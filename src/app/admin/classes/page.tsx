"use client";

// Classes ruang kerja admin, rupa v3 (KZ-024). Jadual carian semua kelas
// gaya "Courses": tab status dengan kiraan, carian nama/join_code, penapis
// pendidik dan susunan di kepala kad. Klik baris membuka halaman butiran
// kelas; semua tindakan (edit, arkib, buang) berada di sana, bukan dalam
// senarai. Data, penapis dan susunan tidak berubah.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, GraduationCap } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Tabs, relTime } from "@/components/admin/ui";
import {
  Badge,
  DataTable,
  EmptyState,
  Input,
  PageHead,
  Select,
  type DataColumn,
} from "@/components/ui";
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

  const tukar = (fn: () => void) => {
    fn();
    setMuka(1);
  };

  // Lajur jadual "Courses"; warna titik kelas ialah data sebenar jadual.
  const lajur: DataColumn<KelasAdmin>[] = [
    {
      key: "kelas",
      header: "Class",
      render: (k) => (
        <span className="flex items-center gap-3 py-3 min-w-0">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ background: k.color || "#6366f1" }}
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-ink truncate">{k.name}</span>
            <span className="block text-[12px] text-ink-faint font-mono truncate">{k.join_code || "-"}</span>
          </span>
        </span>
      ),
    },
    {
      key: "pendidik",
      header: "Educator",
      hideOnMobile: true,
      render: (k) => (
        <span className="text-[13px] text-ink-faint truncate block max-w-[180px]">{namaProfil(k.owner_id)}</span>
      ),
    },
    {
      key: "ahli",
      header: "Members",
      render: (k) => <span className="text-[13px] text-ink-faint tabular-nums">{kiraanAhli[k.id] ?? 0}</span>,
    },
    {
      key: "aktiviti",
      header: "Activities",
      hideOnMobile: true,
      render: (k) => <span className="text-[13px] text-ink-faint tabular-nums">{kiraanAktiviti[k.id] ?? 0}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (k) => {
        const status = statusKelas(k);
        return (
          <Badge variant="dim" warna={status === "active" ? "green" : status === "ended" ? "yellow" : "gray"}>
            {labelStatusKelas(k)}
          </Badge>
        );
      },
    },
    {
      key: "dicipta",
      header: "Created",
      hideOnMobile: true,
      render: (k) => <span className="text-[13px] text-ink-faint whitespace-nowrap">{relTime(k.created_at)}</span>,
    },
  ];

  return (
    <div>
      <Tabs
        items={TAB_KELAS.map((t) => ({ ...t, count: kiraan[t.key] }))}
        value={tab}
        onChange={(k) => tukar(() => setTab(k as TabKelas))}
      />

      <DataTable
        className="mt-4"
        label="Classes"
        columns={lajur}
        rows={ditapis}
        rowKey={(k) => k.id}
        onRowClick={(k) => router.push(`/admin/classes/${k.id}`)}
        halaman={muka}
        saizHalaman={SEBARIS}
        onHalaman={setMuka}
        head={
          <>
            <span className="w-full sm:w-64">
              <Input
                ikonKiri={<Search className="w-4 h-4" />}
                placeholder="Search name or join code"
                aria-label="Search classes"
                value={q}
                onChange={(e) => tukar(() => setQ(e.target.value))}
              />
            </span>
            <Select
              value={educatorId}
              onChange={(e) => tukar(() => setEducatorId(e.target.value))}
              aria-label="Filter by educator"
              className="w-auto"
            >
              <option value="">All educators</option>
              {pendidik.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </Select>
            <Select
              value={susun}
              onChange={(e) => tukar(() => setSusun(e.target.value as SusunKelas))}
              aria-label="Sort classes"
              className="w-auto"
            >
              {LABEL_SUSUN.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
            <span className="ml-auto text-[13px] text-ink-faint whitespace-nowrap">
              Showing {mula}-{akhir} of {jumlah}
            </span>
          </>
        }
        empty={
          <EmptyState
            icon={<GraduationCap className="w-6 h-6" />}
            title="No classes match"
            text="Try a different search or filter."
          />
        }
      />
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
    <AdminShell>
      <PageHead
        title="Classes"
        description="Every class on Kuizen, who runs it and how it's going."
      />
      {kelas === null ? (
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
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
