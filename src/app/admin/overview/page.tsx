"use client";

// Overview ruang kerja admin, rupa v3 (KZ-024). Jawapan kepada satu soalan:
// apa yang perlu perhatian hari ini. Papan gaya LMS: StatGroup nombor sebenar,
// kad "Needs attention" yang menyembunyikan baris kosong, kesihatan akaun,
// kelas terbaru (TileRow) dan aktiviti admin terbaru (PersonRow). Data,
// panggilan Supabase dan kiraan tidak berubah berbanding versi V2-011b.
//
// Nama pemilik dan pelaku datang daripada adminListProfiles(): UUID
// tidak pernah dipaparkan sebagai nama. Tiada data siri dimuat di sini,
// jadi tiada kad carta.

import { useEffect, useState } from "react";
import Link from "next/link";
import { GraduationCap, ClipboardList, ChevronRight, UserCheck, Mail, MessageSquare, CalendarClock, ShieldCheck, ScrollText } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { relTime } from "@/components/admin/ui";
import { Card, CardHead, CardLink, EmptyState, PageHead, PersonRow, StatGroup, TileRow } from "@/components/ui";
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

/** Baris qm_classes yang diperlukan oleh kad Recent classes. */
interface KelasRingkas {
  id: string;
  name: string;
  color: string | null;
  created_at: string;
  owner_id: string;
}

export default function Page() {
  const [muat, setMuat] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});
  const [aktif, setAktif] = useState(0);
  const [jumlahAktiviti, setJumlahAktiviti] = useState(0);
  const [pendingSemak, setPendingSemak] = useState(0);
  const [maklumbalas, setMaklumbalas] = useState(0);
  const [kelas, setKelas] = useState<KelasRingkas[]>([]);
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
    <AdminShell>
      <PageHead title="Overview" description="What needs your attention across Kuizen today." />

      {/* Empat nombor sebenar; tiada data perubahan, jadi tiada anak panah. */}
      <Card className="mb-5">
        <StatGroup
          stats={[
            { label: "Total users", value: users.length },
            { label: "Educators", value: pendidik },
            {
              label: (
                <>
                  Activities{" "}
                  <span className="text-ink-faint font-normal">({aktif} active)</span>
                </>
              ),
              value: jumlahAktiviti,
            },
            { label: "Pending reviews", value: pendingSemak },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        {/* Perlu perhatian */}
        <Card padat>
          <div className="px-6 py-4 border-b border-kz-line">
            <CardHead title="Needs attention" subtitle="Rows appear only when something needs you." />
          </div>
          {muat ? (
            <p className="px-6 py-8 text-[14px] text-ink-faint">Loading...</p>
          ) : perhatian.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="w-6 h-6" />}
              title="All clear"
              text="Nothing needs you right now."
            />
          ) : (
            <div className="divide-y divide-kz-line">
              {perhatian.map((r) => {
                const Ikon = r.ikon;
                return (
                  <Link
                    key={r.href}
                    href={r.href}
                    className="flex items-center gap-3 px-6 py-4 hover:bg-[#f8f9fc] transition"
                  >
                    <Ikon className="w-4 h-4 text-brand-purple shrink-0" />
                    <span className="text-[14px] text-ink flex-1 min-w-0 truncate">{r.label}</span>
                    <span className="text-[14px] font-medium text-ink tabular-nums">{r.kiraan}</span>
                    <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        {/* Kesihatan akaun: nisbah sebenar, tiada nombor rekaan. */}
        <Card>
          <CardHead title="Account health" subtitle="Email verification and suspensions." />
          <div className="mt-4 flex h-1.5 rounded-full overflow-hidden bg-kz-line">
            <div className="bg-kz-up" style={{ width: `${(verifikasi / jumlah) * 100}%` }} />
            <div className="bg-kz-warn" style={{ width: `${(belumSah / jumlah) * 100}%` }} />
            <div className="bg-kz-down" style={{ width: `${(digantung / jumlah) * 100}%` }} />
          </div>
          <div className="mt-4 space-y-2.5">
            {[
              { label: "Verified", nilai: verifikasi, warna: "green" as const },
              { label: "Unverified", nilai: belumSah, warna: "yellow" as const },
              { label: "Suspended", nilai: digantung, warna: "red" as const },
            ].map((r) => (
              <div key={r.label} className="flex items-center gap-2 text-[14px]">
                <span
                  className={`inline-flex items-center gap-1.5 font-medium ${
                    r.warna === "green" ? "text-kz-up" : r.warna === "yellow" ? "text-kz-warn" : "text-kz-down"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: "currentColor" }}
                    aria-hidden="true"
                  />
                  {r.label}
                </span>
                <span className="ml-auto text-ink-muted tabular-nums">
                  {r.nilai}
                  {users.length > 0 ? ` · ${Math.round((r.nilai / jumlah) * 100)}%` : ""}
                </span>
              </div>
            ))}
          </div>
          <div className="text-[12px] text-ink-faint border-t border-kz-line mt-3 pt-3">
            Total users: {users.length}
            {baharuMinggu > 0 ? ` (+${baharuMinggu} this week)` : ""}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Kelas terbaru */}
        <Card padat>
          <div className="px-6 py-4 border-b border-kz-line">
            <CardHead title="Recent classes" right={<CardLink href="/admin/classes">View all</CardLink>} />
          </div>
          {kelas.length === 0 ? (
            <EmptyState
              icon={<GraduationCap className="w-6 h-6" />}
              title="No classes yet"
              text="Classes created by educators appear here."
            />
          ) : (
            <div className="px-6 divide-y divide-kz-line">
              {kelas.map((k, i) => (
                <TileRow
                  key={k.id}
                  index={i}
                  title={k.name}
                  subtitle={`${namaProfil(k.owner_id)} · ${ahliKelas[k.id] ?? 0} members`}
                  value={relTime(k.created_at)}
                  href={`/admin/classes/${k.id}`}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Aktiviti admin terbaru */}
        <Card padat>
          <div className="px-6 py-4 border-b border-kz-line">
            <CardHead title="Recent admin activity" right={<CardLink href="/admin/audit">View all</CardLink>} />
          </div>
          {audit.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="w-6 h-6" />}
              title="No admin activity yet"
              text="Actions taken by admins appear here."
            />
          ) : (
            <div className="px-6 divide-y divide-kz-line">
              {audit.map((r, i) => (
                <PersonRow
                  key={r.id}
                  index={i}
                  name={namaProfil(r.actor_id)}
                  subtitle={labelTindakan(r.action).label}
                  value={relTime(r.created_at)}
                />
              ))}
            </div>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
