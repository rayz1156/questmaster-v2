"use client";

// Overview ruang kerja admin (V2-011b). Jawapan kepada satu soalan: apa
// yang perlu perhatian hari ini. Empat kad statistik, kad "Needs
// attention" yang menyembunyikan baris kosong, kesihatan akaun, kelas
// terbaru dan aktiviti admin terbaru.
//
// Nama pemilik dan pelaku datang daripada adminListProfiles(): UUID
// tidak pernah dipaparkan sebagai nama.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users as UsersIcon, GraduationCap, Map as MapIcon, ClipboardList, ChevronRight, UserCheck, Mail, MessageSquare, CalendarClock } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { StatCard, Card, EmptyState, relTime, initials } from "@/components/admin/ui";
import {
  adminListProfiles,
  adminListAllHunts,
  adminListAllSubmissions,
  adminListUsersMeta,
  adminListAllClasses,
  adminListAuditLogPaged,
  type Profile,
  type UserMeta,
  type AuditLogRow,
} from "@/lib/data";
import { labelTindakan } from "@/lib/adminAudit";
import { pendingPendidik, emelBelumSah, pelanTamatDalam, HARI_TAMAT_PELAN } from "@/lib/adminUsers";
import { supabase } from "@/lib/supabaseClient";

interface BarisPerhatian {
  label: string;
  kiraan: number;
  href: string;
  ikon: React.ComponentType<{ className?: string }>;
}

export default function Page() {
  const [muat, setMuat] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});
  const [aktif, setAktif] = useState(0);
  const [jumlahAktiviti, setJumlahAktiviti] = useState(0);
  const [pendingSemak, setPendingSemak] = useState(0);
  const [maklumbalas, setMaklumbalas] = useState(0);
  const [kelas, setKelas] = useState<any[]>([]);
  const [ahliKelas, setAhliKelas] = useState<Record<string, number>>({});
  const [audit, setAudit] = useState<AuditLogRow[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [profiles, hunts, subs, m, kelasRows, log] = await Promise.all([
          adminListProfiles(),
          adminListAllHunts(),
          adminListAllSubmissions(),
          adminListUsersMeta(),
          adminListAllClasses(),
          adminListAuditLogPaged({ limit: 8 }),
        ]);
        setUsers(profiles);
        setMeta(m);
        setJumlahAktiviti(hunts.length);
        setAktif(hunts.filter((h) => h.status === "active").length);
        // Jawapan benih SEED:: bukan karya pelajar; ia bukan beban moderasi.
        setPendingSemak(
          subs.filter(
            (s) => s.status === "pending" && !(typeof s.answer === "string" && s.answer.startsWith("SEED::")),
          ).length,
        );
        setKelas((kelasRows || []).slice(0, 5));
        setAudit(log);
      } finally {
        setMuat(false);
      }
      // Maklum balas baharu/terbuka: status sebenar ialah open.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/admin/feedback", {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        if (res.ok) {
          const out = (await res.json()) as { items?: { status?: string }[] };
          setMaklumbalas((out.items || []).filter((x) => x.status === "open").length);
        }
      } catch {
        // gagal memuat: kiraan kekal sifar, bukan punca halaman gagal
      }
    })();
  }, []);

  // Kiraan ahli 5 kelas terbaru, satu pertanyaan kepala setiap satu.
  useEffect(() => {
    (async () => {
      const baris: Record<string, number> = {};
      for (const k of kelas) {
        try {
          const { count, error } = await supabase
            .from("qm_class_members")
            .select("id", { count: "exact", head: true })
            .eq("class_id", k.id);
          if (!error && typeof count === "number") baris[k.id] = count;
        } catch {
          // abaikan: kiraan ahli hiasan, bukan kritikal
        }
      }
      setAhliKelas(baris);
    })();
  }, [kelas]);

  const seminggu = Date.now() - 7 * 86_400_000;
  const baharuMinggu = users.filter((u) => {
    const t = meta[u.id]?.created_at || u.created_at;
    return !!t && new Date(t).getTime() >= seminggu;
  }).length;
  const pendidik = users.filter((u) => u.role === "educator").length;
  const menunggu = users.filter(pendingPendidik).length;
  const belumSah = users.filter((u) => !u.suspended && emelBelumSah(u.id, meta)).length;
  const pelanTamat = users.filter((u) => pelanTamatDalam(u)).length;

  const verifikasi = users.filter((u) => !u.suspended && !!meta[u.id]?.email_confirmed_at).length;
  const jumlah = users.length || 1;
  const digantung = users.filter((u) => u.suspended).length;

  const namaProfil = (id: string | null | undefined) => {
    if (!id) return "Unnamed user";
    const p = users.find((u) => u.id === id);
    return p?.display_name || "Unnamed user";
  };

  const perhatian: BarisPerhatian[] = [
    { label: "Educators waiting for approval", kiraan: menunggu, href: "/admin/users?tab=pending", ikon: UserCheck },
    { label: "Unverified email addresses", kiraan: belumSah, href: "/admin/users?status=unverified", ikon: Mail },
    { label: "Submissions pending review", kiraan: pendingSemak, href: "/admin/moderation", ikon: ClipboardList },
    { label: "New feedback", kiraan: maklumbalas, href: "/admin/feedback", ikon: MessageSquare },
    { label: `Plans expiring in ${HARI_TAMAT_PELAN} days`, kiraan: pelanTamat, href: "/admin/users?status=expiring", ikon: CalendarClock },
  ].filter((r) => r.kiraan > 0);

  return (
    <AdminShell title="Overview">
      <p className="text-ink-muted text-sm mb-6">What needs your attention across Kuizen today.</p>

      {/* Empat kad statistik */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total users"
          value={users.length}
          hint={baharuMinggu > 0 ? `+${baharuMinggu} this week` : undefined}
          icon={<UsersIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Educators"
          value={pendidik}
          hint={menunggu > 0 ? `${menunggu} pending approval` : undefined}
          icon={<GraduationCap className="w-4 h-4" />}
        />
        <StatCard
          label="Activities"
          value={jumlahAktiviti}
          hint={`${aktif} active`}
          icon={<MapIcon className="w-4 h-4" />}
        />
        <StatCard
          label="Pending reviews"
          value={pendingSemak}
          href="/admin/moderation"
          icon={<ClipboardList className="w-4 h-4" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {/* Perlu perhatian */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline text-sm font-semibold text-ink">Needs attention</div>
          {muat ? (
            <div className="px-4 py-8 text-sm text-ink-faint">Loading...</div>
          ) : perhatian.length === 0 ? (
            <EmptyState title="All clear. Nothing needs you right now." />
          ) : (
            perhatian.map((r) => {
              const Ikon = r.ikon;
              return (
                <Link
                  key={r.href}
                  href={r.href}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-[#F7F7F9] transition border-t border-hairline first:border-t-0"
                >
                  <Ikon className="w-4 h-4 text-brand-purple shrink-0" />
                  <span className="text-sm text-ink flex-1 min-w-0 truncate">{r.label}</span>
                  <span className="text-sm font-semibold text-ink-muted">{r.kiraan}</span>
                  <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
                </Link>
              );
            })
          )}
        </Card>

        {/* Kesihatan akaun */}
        <Card className="p-4">
          <div className="text-sm font-semibold text-ink mb-4">Account health</div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-4">
            <div className="bg-green-500" style={{ width: `${(verifikasi / jumlah) * 100}%` }} />
            <div className="bg-yellow-500" style={{ width: `${(belumSah / jumlah) * 100}%` }} />
            <div className="bg-red-500" style={{ width: `${(digantung / jumlah) * 100}%` }} />
          </div>
          <div className="space-y-2.5">
            {[
              { label: "Verified", nilai: verifikasi, bulat: "bg-green-500", teks: "text-green-700" },
              { label: "Unverified", nilai: belumSah, bulat: "bg-yellow-500", teks: "text-yellow-700" },
              { label: "Suspended", nilai: digantung, bulat: "bg-red-500", teks: "text-red-700" },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${r.bulat}`} />
                <span className={`font-medium ${r.teks}`}>{r.label}</span>
                <span className="ml-auto text-ink-muted">
                  {r.nilai}
                  {users.length > 0 ? ` · ${Math.round((r.nilai / jumlah) * 100)}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="text-xs text-ink-faint pt-3 mt-3 border-t border-hairline">Total users: {users.length}</div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Kelas terbaru */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline text-sm font-semibold text-ink">Recent classes</div>
          {kelas.length === 0 ? (
            <EmptyState title="No classes yet." />
          ) : (
            kelas.map((k) => (
              <Link
                key={k.id}
                href={`/admin/classes/${k.id}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-[#F7F7F9] transition border-t border-hairline first:border-t-0"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: k.color || "#6366f1" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink truncate">{k.name}</span>
                  <span className="block text-xs text-ink-faint truncate">
                    {namaProfil(k.owner_id)} · {ahliKelas[k.id] ?? 0} members
                  </span>
                </span>
                <span className="text-xs text-ink-faint shrink-0">{relTime(k.created_at)}</span>
                <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
              </Link>
            ))
          )}
        </Card>

        {/* Aktiviti admin terbaru */}
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-hairline flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Recent admin activity</span>
            <Link href="/admin/audit" className="text-xs font-medium text-brand-purple hover:opacity-80">
              View all
            </Link>
          </div>
          {audit.length === 0 ? (
            <EmptyState title="No admin activity yet." />
          ) : (
            audit.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3 border-t border-hairline first:border-t-0">
                <span className="w-7 h-7 rounded-full bg-[#EAE6FC] text-brand-purple text-[11px] font-semibold flex items-center justify-center shrink-0">
                  {initials(namaProfil(r.actor_id))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink truncate">
                    {namaProfil(r.actor_id)} · {labelTindakan(r.action).label}
                  </span>
                </span>
                <span className="text-xs text-ink-faint shrink-0">{relTime(r.created_at)}</span>
              </div>
            ))
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
