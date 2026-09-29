"use client";

// Activities ruang kerja admin (V2-011c). Jadual carian semua aktiviti:
// tab status dengan kiraan, carian tajuk dan penapis kelas. Klik baris
// membuka butiran; tukar status, mata dan buang aktiviti berada di sana.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState } from "@/components/admin/ui";
import {
  adminListAllHunts,
  adminListAllClasses,
  adminListAllChallenges,
  adminListAllSubmissions,
  adminListProfiles,
  type Profile,
  type Hunt,
} from "@/lib/data";
import { TAB_AKTIVITI, tapisAktiviti, kiraTabAktiviti, type TabAktiviti } from "@/lib/adminHunts";
import type { KelasAdmin } from "@/lib/adminClasses";

function SenaraiAktiviti({
  hunts,
  kelas,
  profiles,
  kiraanCh,
  kiraanSub,
  disemakSub,
}: {
  hunts: Hunt[];
  kelas: KelasAdmin[];
  profiles: Profile[];
  kiraanCh: Record<string, number>;
  kiraanSub: Record<string, number>;
  disemakSub: Record<string, number>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabAktiviti>("all");
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("");

  const namaKelas = (id: string | null | undefined) => {
    if (!id) return "-";
    const k = kelas.find((x) => x.id === id);
    return k?.name || "Unnamed class";
  };
  const namaProfil = (id: string | null | undefined) => {
    if (!id) return "Unnamed user";
    const p = profiles.find((u) => u.id === id);
    return p?.display_name || "Unnamed user";
  };

  const ditapis = useMemo(
    () => tapisAktiviti(hunts, { tab, q, classId }),
    [hunts, tab, q, classId],
  );
  const kiraan = useMemo(() => kiraTabAktiviti(hunts, { q, classId }), [hunts, q, classId]);

  return (
    <div>
      <Tabs
        items={TAB_AKTIVITI.map((t) => ({ ...t, count: kiraan[t.key] }))}
        value={tab}
        onChange={(k) => setTab(k as TabAktiviti)}
      />

      <div className="flex flex-wrap items-center gap-2 py-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
          <input
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-hairline text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
            placeholder="Search title"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink"
          aria-label="Filter by class"
        >
          <option value="">All classes</option>
          {kelas.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                <th className="px-4 py-3 font-medium">Activity</th>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Educator</th>
                <th className="px-4 py-3 font-medium">Challenges</th>
                <th className="px-4 py-3 font-medium">Submissions</th>
                <th className="px-4 py-3 font-medium">Review progress</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ditapis.map((h) => {
                const total = kiraanSub[h.id] ?? 0;
                const disemak = disemakSub[h.id] ?? 0;
                const peratus = total === 0 ? 100 : Math.round((disemak / total) * 100);
                return (
                  <tr
                    key={h.id}
                    onClick={() => router.push(`/admin/hunts/${h.id}`)}
                    className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9] cursor-pointer transition"
                  >
                    <td className="px-4 py-3 font-medium text-ink truncate max-w-[220px]">{h.title}</td>
                    <td className="px-4 py-3 text-ink-muted truncate max-w-[180px]">{namaKelas(h.class_id)}</td>
                    <td className="px-4 py-3 text-ink-muted truncate max-w-[160px]">{namaProfil(h.owner_id)}</td>
                    <td className="px-4 py-3 text-ink-muted">{kiraanCh[h.id] ?? 0}</td>
                    <td className="px-4 py-3 text-ink-muted">{total}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-brand-purple rounded-full"
                            style={{ width: `${peratus}%` }}
                          />
                        </div>
                        <span className="text-xs text-ink-faint whitespace-nowrap">
                          {disemak} of {total}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={h.status === "active" ? "green" : h.status === "draft" ? "yellow" : "gray"}>
                        {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                      </Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {ditapis.length === 0 && (
          <EmptyState title="No activities match." body="Try a different search or filter." />
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  const [hunts, setHunts] = useState<Hunt[] | null>(null);
  const [kelas, setKelas] = useState<KelasAdmin[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [kiraanCh, setKiraanCh] = useState<Record<string, number>>({});
  const [kiraanSub, setKiraanSub] = useState<Record<string, number>>({});
  const [disemakSub, setDisemakSub] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      try {
        const [rows, semuaKelas, profs, semuaCh, semuaSub] = await Promise.all([
          adminListAllHunts(),
          adminListAllClasses(),
          adminListProfiles(),
          adminListAllChallenges(),
          adminListAllSubmissions(),
        ]);
        setHunts(rows);
        setKelas((semuaKelas || []) as KelasAdmin[]);
        setProfiles(profs);
        // Kiraan challenge setiap hunt daripada senarai penuh.
        const ch: Record<string, number> = {};
        for (const c of semuaCh) ch[c.hunt_id] = (ch[c.hunt_id] || 0) + 1;
        setKiraanCh(ch);
        // Submission perlu challenge untuk dipetakan kepada hunt.
        const huntByChallenge = new Map<string, string>();
        for (const c of semuaCh) huntByChallenge.set(c.id, c.hunt_id);
        const sub: Record<string, number> = {};
        const disemak: Record<string, number> = {};
        for (const s of semuaSub) {
          const hid = huntByChallenge.get(s.challenge_id);
          if (!hid) continue;
          sub[hid] = (sub[hid] || 0) + 1;
          if (s.status === "approved" || s.status === "rejected") {
            disemak[hid] = (disemak[hid] || 0) + 1;
          }
        }
        setKiraanSub(sub);
        setDisemakSub(disemak);
      } catch {
        // RLS menolak pembacaan bukan admin; senarai kekal kosong.
        setHunts([]);
      }
    })();
  }, []);

  return (
    <AdminShell title="Activities">
      {hunts === null ? (
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      ) : (
        <SenaraiAktiviti
          hunts={hunts}
          kelas={kelas}
          profiles={profiles}
          kiraanCh={kiraanCh}
          kiraanSub={kiraanSub}
          disemakSub={disemakSub}
        />
      )}
    </AdminShell>
  );
}
