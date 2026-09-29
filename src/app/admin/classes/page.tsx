"use client";

// Classes ruang kerja admin (V2-011c). Jadual carian semua kelas: tab
// status dengan kiraan, carian nama/join_code, penapis pendidik dan
// susunan. Klik baris membuka halaman butiran kelas; semua tindakan
// (edit, arkib, buang) berada di sana, bukan dalam senarai.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState, relTime } from "@/components/admin/ui";
import { supabase } from "@/lib/supabaseClient";
import {
  adminListAllClasses,
  adminListAllHunts,
  adminListProfiles,
  type Profile,
} from "@/lib/data";
import {
  TAB_KELAS,
  tapisKelas,
  kiraTabKelas,
  labelStatusKelas,
  statusKelas,
  type KelasAdmin,
  type SusunKelas,
  type TabKelas,
} from "@/lib/adminClasses";

const SEBARIS = 25;

const LABEL_SUSUN: { key: SusunKelas; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "name", label: "Name A-Z" },
  { key: "members", label: "Most members" },
];

function SenaraiKelas({
  kelas,
  profiles,
  kiraanAhli,
  kiraanAktiviti,
}: {
  kelas: KelasAdmin[];
  profiles: Profile[];
  kiraanAhli: Record<string, number>;
  kiraanAktiviti: Record<string, number>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKelas>("all");
  const [q, setQ] = useState("");
  const [educatorId, setEducatorId] = useState("");
  const [susun, setSusun] = useState<SusunKelas>("newest");
  const [muka, setMuka] = useState(1);

  const namaProfil = (id: string | null | undefined) => {
    if (!id) return "Unnamed user";
    const p = profiles.find((u) => u.id === id);
    return p?.display_name || "Unnamed user";
  };

  // Pilihan pendidik: hanya pemilik yang betul-betul ada kelas.
  const pendidik = useMemo(() => {
    const ids = Array.from(new Set(kelas.map((k) => k.owner_id)));
    return ids
      .map((id) => ({ id, nama: namaProfil(id) }))
      .sort((a, b) => (a.nama < b.nama ? -1 : a.nama > b.nama ? 1 : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kelas, profiles]);

  const ditapis = useMemo(
    () => tapisKelas(kelas, { tab, q, educatorId, susun, kiraanAhli }),
    [kelas, tab, q, educatorId, susun, kiraanAhli],
  );
  const kiraan = useMemo(
    () => kiraTabKelas(kelas, { q, educatorId }),
    [kelas, q, educatorId],
  );

  const jumlah = ditapis.length;
  const mula = jumlah === 0 ? 0 : (muka - 1) * SEBARIS + 1;
  const akhir = Math.min(muka * SEBARIS, jumlah);
  const barisMuka = ditapis.slice((muka - 1) * SEBARIS, muka * SEBARIS);

  const tukar = (fn: () => void) => {
    fn();
    setMuka(1);
  };

  return (
    <div>
      <p className="text-ink-muted text-sm mb-6">Every class on Kuizen, who runs it and how it&apos;s going.</p>

      <Tabs
        items={TAB_KELAS.map((t) => ({ ...t, count: kiraan[t.key] }))}
        value={tab}
        onChange={(k) => tukar(() => setTab(k as TabKelas))}
      />

      <div className="flex flex-wrap items-center gap-2 py-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-hairline text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
            placeholder="Search name or join code"
            value={q}
            onChange={(e) => tukar(() => setQ(e.target.value))}
          />
        </div>
        <select
          value={educatorId}
          onChange={(e) => tukar(() => setEducatorId(e.target.value))}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Filter by educator"
        >
          <option value="">All educators</option>
          {pendidik.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nama}
            </option>
          ))}
        </select>
        <select
          value={susun}
          onChange={(e) => tukar(() => setSusun(e.target.value as SusunKelas))}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Sort classes"
        >
          {LABEL_SUSUN.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Educator</th>
                <th className="px-4 py-3 font-medium">Members</th>
                <th className="px-4 py-3 font-medium">Activities</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {barisMuka.map((k) => {
                const status = statusKelas(k);
                return (
                  <tr
                    key={k.id}
                    onClick={() => router.push(`/admin/classes/${k.id}`)}
                    className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9] cursor-pointer transition"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: k.color || "#6366f1" }}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink truncate">{k.name}</span>
                          <span className="block text-xs text-ink-faint font-mono">{k.join_code || "-"}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-muted truncate max-w-[180px]">
                      {namaProfil(k.owner_id)}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{kiraanAhli[k.id] ?? 0}</td>
                    <td className="px-4 py-3 text-ink-muted">{kiraanAktiviti[k.id] ?? 0}</td>
                    <td className="px-4 py-3">
                      <Pill tone={status === "active" ? "green" : status === "ended" ? "yellow" : "gray"}>
                        {labelStatusKelas(k)}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{relTime(k.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {jumlah === 0 && (
          <EmptyState title="No classes match." body="Try a different search or filter." />
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-hairline">
          <span className="text-xs text-ink-faint">
            Showing {mula}-{akhir} of {jumlah}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={muka <= 1}
              onClick={() => setMuka((v) => Math.max(1, v - 1))}
              className="p-2 rounded-xl border border-hairline text-ink-muted hover:text-ink disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={muka * SEBARIS >= jumlah}
              onClick={() => setMuka((v) => v + 1)}
              className="p-2 rounded-xl border border-hairline text-ink-muted hover:text-ink disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default function Page() {
  const [kelas, setKelas] = useState<KelasAdmin[] | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [kiraanAhli, setKiraanAhli] = useState<Record<string, number>>({});
  const [kiraanAktiviti, setKiraanAktiviti] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const [rows, profs, hunts] = await Promise.all([
          adminListAllClasses(),
          adminListProfiles(),
          adminListAllHunts(),
        ]);
        setKelas((rows || []) as KelasAdmin[]);
        setProfiles(profs);
        // Kiraan aktiviti setiap kelas daripada senarai hunt penuh.
        const aktiviti: Record<string, number> = {};
        for (const h of hunts) {
          if (h.class_id) aktiviti[h.class_id] = (aktiviti[h.class_id] || 0) + 1;
        }
        setKiraanAktiviti(aktiviti);
      } catch {
        // RLS menolak pembacaan bukan admin; senarai kekal kosong.
        setKelas([]);
      }
      // Kiraan ahli: satu pertanyaan seluruh qm_class_members, dikira di klien.
      try {
        const { data } = await supabase.from("qm_class_members").select("class_id");
        const ahli: Record<string, number> = {};
        for (const r of (data || []) as { class_id: string }[]) {
          ahli[r.class_id] = (ahli[r.class_id] || 0) + 1;
        }
        setKiraanAhli(ahli);
      } catch {
        // kiraan ahli hiasan: kekal kosong
      }
    })();
  }, []);

  return (
    <AdminShell title="Classes">
      {kelas === null ? (
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      ) : (
        <SenaraiKelas
          kelas={kelas}
          profiles={profiles}
          kiraanAhli={kiraanAhli}
          kiraanAktiviti={kiraanAktiviti}
        />
      )}
    </AdminShell>
  );
}
