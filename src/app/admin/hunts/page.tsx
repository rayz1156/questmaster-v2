"use client";

// Activities ruang kerja admin, rupa v3 (KZ-024). Jadual carian semua
// aktiviti guna DataTable kit: tab status dengan kiraan, carian tajuk dan
// penapis kelas di kepala kad. Klik baris membuka butiran; tukar status,
// mata dan buang aktiviti berada di sana. Data dan penapis tidak berubah.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Map as MapIcon } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Tabs } from "@/components/admin/ui";
import {
  Badge,
  DataTable,
  EmptyState,
  Input,
  PageHead,
  ProgressBar,
  Select,
  type DataColumn,
} from "@/components/ui";
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

  // Lajur jadual; kiraan dan kemajuan semakan datang daripada data dimuat.
  const lajur: DataColumn<Hunt>[] = [
    {
      key: "aktiviti",
      header: "Activity",
      render: (h) => (
        <span className="block text-[13px] font-bold text-ink truncate max-w-[220px]">{h.title}</span>
      ),
    },
    {
      key: "kelas",
      header: "Class",
      hideOnMobile: true,
      render: (h) => (
        <span className="text-[13px] text-ink-faint truncate block max-w-[180px]">{namaKelas(h.class_id)}</span>
      ),
    },
    {
      key: "pendidik",
      header: "Educator",
      hideOnMobile: true,
      render: (h) => (
        <span className="text-[13px] text-ink-faint truncate block max-w-[160px]">{namaProfil(h.owner_id)}</span>
      ),
    },
    {
      key: "cabaran",
      header: "Challenges",
      render: (h) => <span className="text-[13px] text-ink-faint tabular-nums">{kiraanCh[h.id] ?? 0}</span>,
    },
    {
      key: "penghantaran",
      header: "Submissions",
      render: (h) => <span className="text-[13px] text-ink-faint tabular-nums">{kiraanSub[h.id] ?? 0}</span>,
    },
    {
      key: "kemajuan",
      header: "Review progress",
      hideOnMobile: true,
      render: (h) => {
        const total = kiraanSub[h.id] ?? 0;
        const disemak = disemakSub[h.id] ?? 0;
        return (
          <span className="flex items-center gap-2 min-w-[120px]">
            <ProgressBar value={disemak} max={total} label={`Review progress for ${h.title}`} className="flex-1" />
            <span className="text-[12px] text-ink-faint whitespace-nowrap">
              {disemak} of {total}
            </span>
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (h) => (
        <Badge variant="dim" warna={h.status === "active" ? "green" : h.status === "draft" ? "yellow" : "gray"}>
          {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
        </Badge>
      ),
    },
  ];

  return (
    <div>
      <Tabs
        items={TAB_AKTIVITI.map((t) => ({ ...t, count: kiraan[t.key] }))}
        value={tab}
        onChange={(k) => setTab(k as TabAktiviti)}
      />

      <DataTable
        className="mt-4"
        label="Activities"
        columns={lajur}
        rows={ditapis}
        rowKey={(h) => h.id}
        onRowClick={(h) => router.push(`/admin/hunts/${h.id}`)}
        head={
          <>
            <span className="w-full sm:w-64">
              <Input
                ikonKiri={<Search className="w-4 h-4" />}
                placeholder="Search title"
                aria-label="Search activities"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </span>
            <Select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              aria-label="Filter by class"
              className="w-auto"
            >
              <option value="">All classes</option>
              {kelas.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </Select>
          </>
        }
        empty={
          <EmptyState
            icon={<MapIcon className="w-6 h-6" />}
            title="No activities match"
            text="Try a different search or filter."
          />
        }
      />
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
    <AdminShell>
      <PageHead title="Activities" />
      {hunts === null ? (
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
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
