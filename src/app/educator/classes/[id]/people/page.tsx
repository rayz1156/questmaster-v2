"use client";

/**
 * People: pelajar, kumpulan dan pendidik sesebuah kelas dalam satu tempat.
 *
 * Sebelum ini ketiga-tiganya berselerak: ahli pada halaman kelas, kumpulan
 * pada skrin global berasingan, pendidik dalam kad di bawah. Orang ialah
 * satu idea, jadi ia satu skrin dengan tiga sub-tab.
 *
 * KZ-022b: rupa v3. Sub-tab guna Tabs kit (tab keadaan); senarai pelajar
 * dan kumpulan guna DataTable kit gaya "Students" (avatar inisial, lencana
 * status, menu "..." tindakan, lajur kurang penting disembunyi di telefon);
 * keadaan kosong guna EmptyState kit. Klik kepala lajur markah untuk
 * menyusun kekal sebagai butang dalam `header` lajur. Logik, data, panggilan
 * Supabase/API, import CSV dan laci markah tidak berubah.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, Download, Search, Upload, Users } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import EducatorsCard from "@/components/EducatorsCard";
import EmailExportButton from "@/components/EmailExportButton";
import { EDU_TABS } from "@/lib/eduTabs";
import { listClassMembers, listTeamsByClass, listClassTeamScores, listClassIndividualScores, type ClassIndividualScore } from "@/lib/data";
import { namaAhli } from "@/lib/namaAhli";
import { formatMata, kiraKedudukan } from "@/lib/markahPeserta";
import LaciMarkahPeserta from "@/components/people/LaciMarkahPeserta";
import { supabase } from "@/lib/supabase";
import {
  Avatar,
  Button,
  Card,
  DataTable,
  EmptyState,
  InitialTile,
  Select,
  Tabs,
  type DataColumn,
} from "@/components/ui";

type Sub = "students" | "teams" | "educators";

// Kunci susunan jadual markah pelajar. Semua lajur markah boleh disusun
// dengan klik kepala lajur; nama kekal lalai (A-Z).
type KunciUrut = "nama" | "aktiviti" | "langsung" | "jumlah" | "kedudukan";
// Baris markah per peserta, bentuk nilai dalam petaMarkah.
type BarisMarkah = { task: number; live: number; adj: number; jumlah: number; kedudukan: number };


/** Baris tunggu yang belum tuntut, dipaparkan dengan label pending. */
type InviteRow = { id: string; team_id: string; email: string; nama: string | null; role: string };

/** Pratonton import daripada POST /api/classes/[id]/teams/import-csv?dryRun=1 */
type TeamImportPreview = {
  ok: boolean;
  dry_run: boolean;
  teams_created: number;
  teams_reused: number;
  joined_now: number;
  pending: number;
  teams: { name: string; action: string; members: number }[];
  emails: { email: string; team: string; action: string }[];
  warnings: { team?: string; message: string }[];
  errors?: { row: number; message: string }[];
};

/** Baris kumpulan seperti yang dikembalikan listTeamsByClass. */
type Kumpulan = {
  id: string;
  name: string | null;
  max_members?: number | null;
  score?: number | null;
  member_count?: number | null;
  members_count?: number | null;
};

/**
 * Bilangan ahli bagi setiap kumpulan. qm_teams TIADA lajur member_count,
 * jadi kiraan dibaca melalui RPC qm_team_member_counts, sumber yang sama
 * dengan halaman Manage teams (/educator/teams), supaya kedua-dua halaman
 * memaparkan angka yang sama. Gagal membaca tidak merosakkan halaman: peta
 * kosong, paparan jatuh kepada 0 seperti sebelum ini.
 */
async function kiraAhliKumpulan(classId: string): Promise<Record<string, number>> {
  if (!classId) return {};
  const { data, error } = await supabase.rpc("qm_team_member_counts", { p_class_id: classId });
  if (error || !data) return {};
  const peta: Record<string, number> = {};
  for (const r of data as { team_id: string; cnt: number | string }[]) peta[String(r.team_id)] = Number(r.cnt) || 0;
  return peta;
}

export default function ClassPeoplePage() {
  const { id } = useParams<{ id: string }>() as { id: string };
  const [sub, setSub] = useState<Sub>("students");
  const [members, setMembers] = useState<Record<string, unknown>[]>([]);
  const [teams, setTeams] = useState<Record<string, unknown>[]>([]);
  const [bilAhli, setBilAhli] = useState<Record<string, number>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
    // V2-013: markah individu daripada view qm_class_individual_scores dan
    // laci butiran markah peserta. Susunan jadual: semua lajur markah boleh
    // disusun dengan klik kepala lajur; nama kekal lalai (A-Z).
    const [markahInd, setMarkahInd] = useState<ClassIndividualScore[]>([]);
    const [urut, setUrut] = useState<{ kunci: KunciUrut; arah: 1 | -1 }>({ kunci: "nama", arah: 1 });
    const [laciUser, setLaciUser] = useState<{ id: string; nama: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    // Import kumpulan melalui CSV.
    const [invites, setInvites] = useState<InviteRow[]>([]);
    const [preview, setPreview] = useState<TeamImportPreview | null>(null);
    const [previewErrors, setPreviewErrors] = useState<{ row: number; message: string }[]>([]);
    const [replace, setReplace] = useState(false);
    const [importBusy, setImportBusy] = useState(false);
    const [importErr, setImportErr] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // Eksport CSV peserta (V2-010): muat turun fail daripada laluan export.
    const [exportBusy, setExportBusy] = useState(false);
    const [exportErr, setExportErr] = useState<string | null>(null);
    const eksportCsv = async () => {
        setExportErr(null);
        setExportBusy(true);
        try {
            const { data: ses } = await supabase.auth.getSession();
            const res = await fetch(`/api/classes/${id}/members/export`, {
                headers: ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {},
                cache: "no-store",
            });
            if (!res.ok) {
                let msg = "Export failed.";
                try {
                    const j = await res.json();
                    if (j?.error) msg = j.error;
                } catch { /* badan bukan JSON: guna mesej lalai */ }
                setExportErr(msg);
                return;
            }
            // Nama fail diambil daripada content-disposition pelayan supaya
            // slug nama kelas dikira satu tempat sahaja.
            const blob = await res.blob();
            const cd = res.headers.get("content-disposition") || "";
            const m = /filename="([^"]+)"/.exec(cd);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = m ? m[1] : "kuizen-participants.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch {
            setExportErr("Export failed.");
        } finally {
            setExportBusy(false);
        }
    };

    // Muat semula senarai kumpulan dan baris tunggu selepas import.
    const loadTeams = async () => {
      const [ts, iv] = await Promise.all([
        listTeamsByClass(id),
        supabase
          .from("qm_team_invites")
          .select("id, team_id, email, nama, role")
          .eq("class_id", id)
          .is("claimed_at", null),
      ]);
      setTeams((ts || []) as Record<string, unknown>[]);
      setInvites((iv.data || []) as InviteRow[]);
      setBilAhli(await kiraAhliKumpulan(id).catch(() => ({} as Record<string, number>)));
    };

    useEffect(() => {
      if (!id) return;
      let alive = true;
      (async () => {
        try {
          const [ms, ts, ss, iv, mi] = await Promise.all([
            listClassMembers(id),
            listTeamsByClass(id),
            listClassTeamScores(id).catch(() => []),
            supabase
              .from("qm_team_invites")
              .select("id, team_id, email, nama, role")
              .eq("class_id", id)
              .is("claimed_at", null),
            // View ditapis oleh migrasi 0050: educator kelas sahaja nampak
            // markah kelasnya. Kegagalan (mis. skema belum dimuat semula)
            // tidak merosakkan halaman; lajur markah jatuh kepada 0.
            listClassIndividualScores(id).catch(() => []),
          ]);
          if (!alive) return;
          setMembers((ms || []) as Record<string, unknown>[]);
          setTeams((ts || []) as Record<string, unknown>[]);
          setInvites((iv.data || []) as InviteRow[]);
          setMarkahInd((mi || []) as ClassIndividualScore[]);
          const bil = await kiraAhliKumpulan(id).catch(() => ({} as Record<string, number>));
          if (alive) setBilAhli(bil);
          const map: Record<string, number> = {};
          for (const s of ss || []) map[s.team_id] = Number(s.total_score) || 0;
          setScores(map);
        } catch (e) {
          if (alive) setErr(e instanceof Error ? e.message : "Could not load this class.");
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => { alive = false; };
    }, [id]);

    // Baca fail CSV, hantar untuk pratonton (dryRun=1) atau import sebenar.
    const runImport = async (file: File, confirm: boolean) => {
      setImportErr(null);
      setImportBusy(true);
      try {
        const content = await file.text();
        const { data: ses } = await supabase.auth.getSession();
        const res = await fetch(`/api/classes/${id}/teams/import-csv${confirm ? "" : "?dryRun=1"}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ses.session ? { Authorization: `Bearer ${ses.session.access_token}` } : {}),
          },
          body: JSON.stringify({ content, replace }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (Array.isArray(data.errors) && data.errors.length > 0) {
            setPreviewErrors(data.errors);
            setPreview(null);
          } else {
            setImportErr(data.error || "Import failed.");
          }
          return;
        }
        setPreviewErrors([]);
        if (confirm) {
          setPreview(null);
          if (fileRef.current) fileRef.current.value = "";
          await loadTeams();
        } else {
          setPreview(data as TeamImportPreview);
        }
      } catch (e) {
        setImportErr(e instanceof Error ? e.message : "Import failed.");
      } finally {
        setImportBusy(false);
      }
    };

  // Tiket V2-007: nama daripada m.qm_profiles (display_name, kemudian emel
  // sebelum @, kemudian "Student"). UUID tidak boleh dipaparkan sebagai nama.
  const name = (m: Record<string, unknown>) => namaAhli(m);

  // V2-013: peta markah per user_id. Pecahan datang daripada view; kedudukan
  // (seri berkongsi kedudukan) dikira sekali di sini dengan kiraKedudukan.
  const petaMarkah = useMemo(() => {
    const kedudukan = kiraKedudukan(markahInd.map((b) => Number(b.total_score) || 0));
    const peta = new Map<
      string,
      { task: number; live: number; adj: number; jumlah: number; kedudukan: number }
    >();
    markahInd.forEach((b, i) => {
      peta.set(String(b.user_id), {
        task: Number(b.task_score) || 0,
        live: Number(b.live_score) || 0,
        adj: Number(b.adjustment_score) || 0,
        jumlah: Number(b.total_score) || 0,
        kedudukan: kedudukan[i] || 0,
      });
    });
    return peta;
  }, [markahInd]);

  // Baris ahli bergabung dengan markah, ditapis ikut carian dan disusun
  // ikut kunci kepala lajur. Name kekal lalai (A-Z); lajur markah klik
  // pertama papar markah tertinggi dahulu, dan seri dipecahkan ikut nama A-Z.
  const barisAhli = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const asas = needle
      ? members.filter((m) => name(m).toLowerCase().includes(needle))
      : members;
    const baris = asas.map((m) => {
      const mk = petaMarkah.get(String(m.user_id || ""));
      return { m, mk };
    });
    // Nilai lajur aktif untuk satu baris. Kedudukan 0 bermakna tiada markah,
    // jadi ia sentiasa diletakkan di bawah semasa disusun ikut Rank.
    const nilai = (mk: BarisMarkah | undefined): number => {
      if (!mk) return 0;
      if (urut.kunci === "aktiviti") return mk.task;
      if (urut.kunci === "langsung") return mk.live;
      if (urut.kunci === "jumlah") return mk.jumlah;
      return mk.kedudukan ? mk.kedudukan : Number.MAX_SAFE_INTEGER;
    };
    baris.sort((a, b) => {
      const ka = name(a.m).toLowerCase();
      const kb = name(b.m).toLowerCase();
      const bandingNama = ka < kb ? -1 : ka > kb ? 1 : 0;
      if (urut.kunci === "nama") return bandingNama * urut.arah;
      const va = nilai(a.mk);
      const vb = nilai(b.mk);
      if (va !== vb) return (va - vb) * urut.arah;
      return bandingNama; // seri markah: nama A-Z sentiasa
    });
    return baris;
  }, [members, q, urut, petaMarkah]);

  // Klik kepala lajur: klik pertama guna arah lalai lajur itu (markah
  // tertinggi dahulu, kecuali Name dan Rank yang mula dari atas senarai),
  // klik seterusnya terbalik.
  const klikUrut = (kunci: KunciUrut, arahPertama: 1 | -1) =>
    setUrut((u) =>
      u.kunci === kunci
        ? { kunci, arah: u.arah === 1 ? -1 : 1 }
        : { kunci, arah: arahPertama },
    );

  // Ikon arah susunan pada kepala lajur aktif; kepala lajur markah ialah
  // butang susunan dalam `header` lajur DataTable kit.
  const IkonUrut = ({ kunci }: { kunci: KunciUrut }) =>
    urut.kunci === kunci ? (
      urut.arah === 1 ? (
        <ChevronUp className="w-3.5 h-3.5" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5" />
      )
    ) : null;

  const shownTeams = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((t) => String(t.name || "").toLowerCase().includes(needle));
  }, [teams, q]);

  // Lajur jadual pelajar (DataTable kit, gaya "Students"). Medan yang
  // dipapar sama seperti sebelum ini; e-mel tidak ditambah baharu.
  const lajurAhli: DataColumn<{ m: Record<string, unknown>; mk: BarisMarkah | undefined }>[] = [
    {
      key: "nama",
      header: (
        <button
          type="button"
          onClick={() => klikUrut("nama", 1)}
          className="inline-flex items-center gap-1 hover:text-ink"
        >
          Name <IkonUrut kunci="nama" />
        </button>
      ),
      render: ({ m }, i) => (
        <button
          type="button"
          onClick={() => setLaciUser({ id: String(m.user_id || ""), nama: name(m) })}
          aria-label={`Open scores for ${name(m)}`}
          className="flex items-center gap-3 min-w-0 text-left group"
        >
          <Avatar name={name(m)} size="sm" index={i} />
          <span className="text-[13px] font-bold text-ink truncate group-hover:text-brand-purple group-hover:underline underline-offset-2">
            {name(m)}
          </span>
        </button>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideOnMobile: true,
      render: () => (
        <span className="inline-flex items-center gap-2 text-[13px] text-ink-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4BA972]" aria-hidden="true" /> Active
        </span>
      ),
    },
    {
      key: "serta",
      header: "Joined",
      render: ({ m }) => (
        <span className="text-[13px] text-ink-muted">
          {m.joined_at
            ? new Date(String(m.joined_at)).toLocaleDateString(undefined, { day: "numeric", month: "short" })
            : ","}
        </span>
      ),
    },
    {
      key: "aktiviti",
      header: (
        <button
          type="button"
          onClick={() => klikUrut("aktiviti", -1)}
          className="inline-flex items-center gap-1 justify-end hover:text-ink w-full"
        >
          Activities <IkonUrut kunci="aktiviti" />
        </button>
      ),
      hideOnMobile: true,
      className: "text-right",
      render: ({ mk }) => (
        <span className={`text-[13px] tabular-nums ${mk && mk.task > 0 ? "text-ink" : "text-ink-faint"}`}>
          {formatMata(mk?.task ?? 0)}
        </span>
      ),
    },
    {
      key: "langsung",
      header: (
        <button
          type="button"
          onClick={() => klikUrut("langsung", -1)}
          className="inline-flex items-center gap-1 justify-end hover:text-ink w-full"
        >
          Live Quiz <IkonUrut kunci="langsung" />
        </button>
      ),
      hideOnMobile: true,
      className: "text-right",
      render: ({ mk }) => (
        <span className={`text-[13px] tabular-nums ${mk && mk.live > 0 ? "text-ink" : "text-ink-faint"}`}>
          {formatMata(mk?.live ?? 0)}
        </span>
      ),
    },
    {
      key: "jumlah",
      header: (
        <button
          type="button"
          onClick={() => klikUrut("jumlah", -1)}
          className="inline-flex items-center gap-1 justify-end hover:text-ink w-full"
        >
          Total <IkonUrut kunci="jumlah" />
        </button>
      ),
      className: "text-right",
      render: ({ mk }) => (
        <span className={`text-[14px] font-medium tabular-nums ${mk && mk.jumlah > 0 ? "text-ink" : "text-ink-faint"}`}>
          {formatMata(mk?.jumlah ?? 0)}
        </span>
      ),
    },
    {
      key: "kedudukan",
      header: (
        <button
          type="button"
          onClick={() => klikUrut("kedudukan", 1)}
          className="inline-flex items-center gap-1 justify-end hover:text-ink w-full"
        >
          Rank <IkonUrut kunci="kedudukan" />
        </button>
      ),
      hideOnMobile: true,
      className: "text-right",
      render: ({ mk }) => (
        <span className="text-[13px] tabular-nums text-ink-faint">{mk?.kedudukan ?? ""}</span>
      ),
    },
  ];

  // Lajur jadual kumpulan (DataTable kit). Baris tunggu (pending) kekal
  // dipapar sebagai baris tambahan di bawah setiap kumpulan.
  const lajurKumpulan: DataColumn<Kumpulan>[] = [
    {
      key: "kumpulan",
      header: "Team",
      render: (t, i) => (
        <span className="flex items-center gap-3 py-3 min-w-0">
          <InitialTile name={String(t.name || "Team")} index={i} />
          <span className="text-[14px] font-medium text-ink truncate">{t.name || "Team"}</span>
        </span>
      ),
    },
    {
      key: "ahli",
      header: "Members",
      hideOnMobile: true,
      className: "text-right",
      render: (t) => {
        const max = Number(t.max_members) || 6;
        const filled = bilAhli[String(t.id)] ?? Number(t.member_count ?? t.members_count ?? 0);
        return (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="flex gap-0.5" aria-hidden="true">
              {Array.from({ length: Math.min(max, 8) }).map((_, k) => (
                <span key={k} className={`w-2.5 h-1.5 rounded-full ${k < filled ? "bg-brand-purple" : "bg-[#e5e9f2]"}`} />
              ))}
            </span>
            <span className="text-[12px] text-ink-muted tabular-nums">{filled} of {max}</span>
          </span>
        );
      },
    },
    {
      key: "mata",
      header: "Points",
      className: "text-right",
      render: (t) => (
        <span className="text-[14px] text-ink tabular-nums">
          {scores[String(t.id)] ?? Number(t.score ?? 0)}
        </span>
      ),
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={id} current="people">
        <Tabs
          className="mb-5"
          items={[
            { label: `Students${members.length > 0 ? ` (${members.length})` : ""}`, onSelect: () => setSub("students"), aktif: sub === "students" },
            { label: `Teams${teams.length > 0 ? ` (${teams.length})` : ""}`, onSelect: () => setSub("teams"), aktif: sub === "teams" },
            { label: "Educators", onSelect: () => setSub("educators"), aktif: sub === "educators" },
          ]}
        />

        <div className="flex items-center gap-3 flex-wrap mb-5">
          {sub !== "educators" && (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="input pl-9"
                placeholder={sub === "students" ? "Search people..." : "Search teams..."}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={sub === "students" ? "Search people" : "Search teams"}
              />
            </div>
          )}
          {sub === "students" && (
            <Button variant="outline" size="sm" onClick={eksportCsv} disabled={exportBusy}>
              <Download className="w-4 h-4" /> {exportBusy ? "Exporting..." : "Export CSV"}
            </Button>
          )}
          <EmailExportButton classId={id} />
        </div>

        {err && <div className="text-sm text-kz-down mb-4">{err}</div>}
        {exportErr && <div className="text-sm text-kz-down mb-4">{exportErr}</div>}
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}

        {!loading && sub === "students" && (
          <DataTable
            label="Student scores"
            columns={lajurAhli}
            rows={barisAhli}
            rowKey={({ m }, i) => String(m.user_id || i)}
            head={
              <>
                {/* Susunan pantas untuk skrin kecil: sesetengah lajur markah
                    tersembunyi di telefon, jadi satu-satunya cara menyusun
                    ialah select ini. Tidak kelihatan pada sm ke atas. */}
                <div className="sm:hidden contents">
                  <label htmlFor="urut-mudah-alihs" className="sr-only">Sort by</label>
                  <Select
                    id="urut-mudah-alihs"
                    className="w-44"
                    value={urut.kunci === "kedudukan" ? "nama" : urut.kunci}
                    onChange={(e) => {
                      const kunci = e.target.value as KunciUrut;
                      klikUrut(kunci, kunci === "nama" ? 1 : -1);
                    }}
                  >
                    <option value="nama">Name</option>
                    <option value="jumlah">Total</option>
                    <option value="aktiviti">Activities</option>
                    <option value="langsung">Live Quiz</option>
                  </Select>
                </div>
              </>
            }
            menuItems={({ m }) => [
              {
                label: "Open scores",
                icon: <Users className="w-4 h-4" />,
                onSelect: () => setLaciUser({ id: String(m.user_id || ""), nama: name(m) }),
              },
            ]}
            menuLabel="Student actions"
            empty={
              <EmptyState
                icon={<Users className="w-6 h-6" />}
                title="Your class starts with people."
                text="Share your class code to welcome your first students."
              />
            }
          />
        )}

        {!loading && sub === "teams" && (
          <>
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <Button
                variant="outline"
                size="sm"
                href={`/api/classes/${id}/teams/template`}
              >
                <Download className="w-4 h-4" /> Download template
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={importBusy}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="w-4 h-4" /> Upload CSV
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) runImport(f, false);
                }}
              />
            </div>

            {importErr && (
              <Card className="mb-4"><p className="text-sm text-kz-down">{importErr}</p></Card>
            )}

            {previewErrors.length > 0 && (
              <Card className="mb-4">
                <div className="section-title mb-2 text-sm">
                  Nothing was imported. Fix the rows below and upload again.
                </div>
                <ul className="text-sm text-kz-down space-y-1">
                  {previewErrors.map((e, i) => (
                    <li key={i}>
                      {e.row > 0 ? `Row ${e.row}: ` : ""}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {preview && (
              <Card className="mb-4">
                <div className="section-title mb-2 text-sm">Preview</div>
                <div className="text-sm text-ink-muted mb-3">
                  {preview.teams_created + preview.teams_reused} teams
                  {" ("}{preview.teams_created} new, {preview.teams_reused} reused{")"},{" "}
                  {" | "}{preview.joined_now} will join now, {preview.pending} waiting for sign-up
                </div>
                <ul className="text-sm space-y-1 mb-2">
                  {preview.teams.map((t, i) => (
                    <li key={i}>
                      <span className="text-ink">{t.name}</span>{" "}
                      <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${t.action === "create" ? "bg-[#EAE6FC] text-[#5B42C4]" : "bg-[#E4EEFD] text-[#2B5FBF]"}`}>
                        {t.action === "create" ? "will be created" : "reused"}
                      </span>
                    </li>
                  ))}
                </ul>
                <ul className="text-sm space-y-1 mb-3">
                  {preview.emails.map((m, i) => (
                    <li key={i}>
                      <span className="text-ink">{m.email}</span>{" "}
                      {m.action === "join" ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[#E3F5EA] text-[#2E7D4F]">
                          joins {m.team} now
                        </span>
                      ) : (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-[#FBF0DC] text-[#96661A]">
                          waiting for sign-up ({m.team})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {preview.warnings.length > 0 && (
                  <ul className="text-sm text-ink-muted space-y-1 mb-3">
                    {preview.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-4 flex-wrap">
                  <label className="text-sm text-ink-muted inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={replace}
                      onChange={(e) => setReplace(e.target.checked)}
                      className="accent-[#5B42C4]"
                    />
                    Replace existing groups
                  </label>
                  <Button
                    disabled={importBusy}
                    onClick={() => {
                      if (fileRef.current?.files?.[0]) runImport(fileRef.current.files[0], true);
                    }}
                  >
                    {importBusy ? "Importing..." : "Confirm import"}
                  </Button>
                </div>
              </Card>
            )}

            {shownTeams.length === 0 ? (
              <div className="bg-white rounded-[4px] shadow-card">
                <EmptyState
                  icon={<Users className="w-6 h-6" />}
                  title="Better learning, together."
                  text="Create a team to get started."
                  actionLabel="Create team"
                  href={`/educator/teams?classId=${id}`}
                />
              </div>
            ) : (
              <>
                <DataTable
                  label="Class teams"
                  columns={lajurKumpulan}
                  rows={(shownTeams as unknown as Kumpulan[])}
                  rowKey={(t, i) => String(t.id || i)}
                  renderRowExtra={(t) => {
                    const pendingRows = invites.filter((iv) => iv.team_id === String(t.id));
                    if (pendingRows.length === 0) return null;
                    return (
                      <ul className="mt-1 space-y-1">
                        {pendingRows.map((iv) => (
                          <li key={iv.id} className="flex items-center gap-2 text-[13px]">
                            <span className="px-1.5 py-0.5 rounded-full text-[12px] bg-[#FBF0DC] text-[#96661A]">
                              pending
                            </span>
                            <span className="text-ink-muted truncate">{iv.email}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }}
                  empty={
                    <EmptyState
                      icon={<Users className="w-6 h-6" />}
                      title="No teams match."
                      text="Try another search."
                    />
                  }
                />
                <div className="px-6 py-4 border-t border-kz-line flex items-center justify-between">
                  <span className="text-[12px] text-ink-faint">{teams.length} teams</span>
                  <Link href={`/educator/teams?classId=${id}`} className="text-[13px] font-medium text-brand-purple hover:underline">
                    Manage teams
                  </Link>
                </div>
              </>
            )}</>
                    )}

                    {!loading && sub === "educators" && <EducatorsCard classId={id} />}

                    {/* V2-013: laci butiran markah peserta, dibuka dengan klik nama. */}
                    {laciUser && (
                      <LaciMarkahPeserta
                        classId={id}
                        userId={laciUser.id}
                        nama={laciUser.nama}
                        jumlahAhli={markahInd.length}
                        tutup={() => setLaciUser(null)}
                      />
                    )}
                  </ClassShell>
    </Shell>
  );
}
