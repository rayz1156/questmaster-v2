"use client";

// Butiran kelas ruang kerja admin (V2-011c), rupa v3 (KZ-024b): PageHead
// varian breadcrumb ("Classes / <nama kelas>") dengan tindakan Edit, Archive
// atau Restore, dan Delete; StatGroup nombor sebenar; Tabs keadaan untuk
// bahagian sedia ada; DataTable untuk ahli dan aktiviti. Logik, data dan
// pengesahan TIDAK berubah (KZ-DS-v3 bahagian 5). Semua tindakan kelas
// berpindah ke sini daripada senarai: edit nama/join_code, arkib dan buang
// dengan pengesahan menaip nama.
//
// Ranking individu datang daripada view qm_class_individual_scores
// (V2-012, migrasi 0049): Activities + Live Quiz + Adjustments; skor
// pasukan datang terus daripada enjin pemarkahan langsung qm_teams.score.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pencil, Archive, RotateCcw, Trash2, Download, Users as UsersIcon,
  Map as MapIcon, Search,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
  Alert, Avatar, Badge, Button, Card, CardHead, DataTable, EmptyState,
  Field, Input, Modal, PageHead, StatGroup, Tabs, type DataColumn,
} from "@/components/ui";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { mesejHad } from "@/lib/pelan";
import {
  adminListAllClasses,
  adminListAllHunts,
  adminListAllChallenges,
  adminListAllSubmissions,
  adminListAllTeams,
  adminListProfiles,
  adminListClassMembers,
  adminListTeamMembers,
  adminListMembersOfTeams,
  adminUpdateClass,
  adminDeleteClass,
  adminUpdateTeam,
  adminDeleteTeam,
  listClassIndividualScores,
  logAudit,
  type Profile,
  type Hunt,
  type Challenge,
  type Submission,
  type Team,
  type AhliKelasAdmin,
  type AhliPasukanAdmin,
  type ClassIndividualScore,
} from "@/lib/data";
import { labelStatusKelas, statusKelas, type KelasAdmin } from "@/lib/adminClasses";
import { petikCsv, lindungFormula, tarikhKl, slugFail } from "@/lib/csvPeserta";

type MukaTab = "overview" | "members" | "activities" | "teams" | "ranking";

function fmt(d: string | null | undefined) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}

export default function Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { id } = params;

  const [muat, setMuat] = useState(true);
  const [kelas, setKelas] = useState<KelasAdmin | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [ahli, setAhli] = useState<AhliKelasAdmin[]>([]);
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ahliPasukan, setAhliPasukan] = useState<Record<string, { user_id: string; role: string }[]>>({});
  const [tab, setTab] = useState<MukaTab>("overview");
  const [mesej, setMesej] = useState<{ baik: boolean; teks: string } | null>(null);

  const [edit, setEdit] = useState<{ name: string; join_code: string } | null>(null);
  const [zonBahaya, setZonBahaya] = useState(false);
  const [pengesahanHapus, setPengesahanHapus] = useState("");

  const [carianAhli, setCarianAhli] = useState("");
  const [pasukanDipilih, setPasukanDipilih] = useState<string | null>(null);
  const [butiranAhli, setButiranAhli] = useState<Record<string, AhliPasukanAdmin[]>>({});
  const [editPasukan, setEditPasukan] = useState<{ id: string; nama: string; lama: string } | null>(null);
  const [modRanking, setModRanking] = useState<"teams" | "individuals">("teams");
  // V2-012: ranking individu daripada view qm_class_individual_scores
  // (migrasi 0049) supaya markah Live Quiz dikumpul bersama markah aktiviti.
  const [markahIndividu, setMarkahIndividu] = useState<ClassIndividualScore[]>([]);

  const reload = async () => {
    try {
      const [semuaKelas, profs, semuaHunt, semuaCh, semuaSub, semuaTeam, ahliKelas, markah] = await Promise.all([
        adminListAllClasses(),
        adminListProfiles(),
        adminListAllHunts(),
        adminListAllChallenges(),
        adminListAllSubmissions(),
        adminListAllTeams(),
        adminListClassMembers(id).catch(() => [] as AhliKelasAdmin[]),
        listClassIndividualScores(id).catch(() => [] as ClassIndividualScore[]),
      ]);
      const k = (semuaKelas || []).find((r) => r.id === id) || null;
      setKelas(k as KelasAdmin | null);
      setProfiles(profs);
      setHunts(semuaHunt.filter((h) => h.class_id === id));
      setChallenges(semuaCh);
      setSubs(semuaSub);
      const teamKelas = semuaTeam.filter((t) => t.class_id === id);
      setTeams(teamKelas);
      setAhli(ahliKelas);
      setMarkahIndividu(markah);
      // Kiraan ahli setiap pasukan untuk senarai kiri tab Teams.
      if (teamKelas.length > 0) {
        adminListMembersOfTeams(teamKelas.map((t) => t.id))
          .then(setAhliPasukan)
          .catch(() => setAhliPasukan({}));
      } else {
        setAhliPasukan({});
      }
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to load this class.") });
    } finally {
      setMuat(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Ahli pasukan dipilih dimuat malas ketika panel kanan dibuka.
  useEffect(() => {
    if (!pasukanDipilih || butiranAhli[pasukanDipilih]) return;
    adminListTeamMembers(pasukanDipilih)
      .then((senarai) => setButiranAhli((p) => ({ ...p, [pasukanDipilih]: senarai })))
      .catch(() => setButiranAhli((p) => ({ ...p, [pasukanDipilih]: [] })));
  }, [pasukanDipilih, butiranAhli]);

  const namaProfil = (uid: string | null | undefined) => {
    if (!uid) return "Unnamed user";
    const p = profiles.find((u) => u.id === uid);
    return p?.display_name || "Unnamed user";
  };

  // ===== Data terbitan kelas ini =====
  const idHuntKelas = useMemo(() => new Set(hunts.map((h) => h.id)), [hunts]);
  const challengesKelas = useMemo(
    () => challenges.filter((c) => idHuntKelas.has(c.hunt_id)),
    [challenges, idHuntKelas],
  );
  const idChallengeKelas = useMemo(
    () => new Set(challengesKelas.map((c) => c.id)),
    [challengesKelas],
  );
  const subsKelas = useMemo(
    () => subs.filter((s) => idChallengeKelas.has(s.challenge_id)),
    [subs, idChallengeKelas],
  );
  const namaById = useMemo(() => {
    const peta: Record<string, string | null> = {};
    for (const p of profiles) peta[p.id] = p.display_name;
    for (const a of ahli) if (!peta[a.user_id]) peta[a.user_id] = a.nama;
    return peta;
  }, [profiles, ahli]);

  // Bilangan jawapan diluluskan setiap pelajar; kekal dikira di sini kerana
  // view qm_class_individual_scores tidak membawanya (V2-012: skor individu
  // kini datang daripada view, sila lihat markahIndividu).
  const diluluskanByUser = useMemo(() => {
    const peta: Record<string, number> = {};
    for (const s of subsKelas) {
      if (s.status === "approved") peta[s.user_id] = (peta[s.user_id] || 0) + 1;
    }
    return peta;
  }, [subsKelas]);
  const teamsSusun = useMemo(
    () => [...teams].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0)),
    [teams],
  );

  const kiraanSubs = useMemo(() => {
    const approved = subsKelas.filter((s) => s.status === "approved").length;
    const rejected = subsKelas.filter((s) => s.status === "rejected").length;
    const pending = subsKelas.filter((s) => s.status === "pending").length;
    return { approved, rejected, pending, jumlah: subsKelas.length };
  }, [subsKelas]);

  // ===== Tindakan =====

  /** Edit nama dan join_code; audit membawa before/after penuh. */
  const simpanEdit = async () => {
    if (!kelas || !edit) return;
    const sebelum = { name: kelas.name, join_code: kelas.join_code || "" };
    const selepas = { name: edit.name.trim(), join_code: edit.join_code.trim() };
    if (selepas.name === sebelum.name && selepas.join_code === sebelum.join_code) {
      setEdit(null);
      return;
    }
    try {
      await adminUpdateClass(id, selepas);
      await logAudit("class_edit", "class", id, { before: sebelum, after: selepas });
      setMesej({ baik: true, teks: "Class updated." });
      setEdit(null);
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to update the class.") });
      reload();
    }
  };

  /** Arkib/pulihkan kelas melalui is_archived. */
  const tukarArkib = async () => {
    if (!kelas) return;
    const mengarkib = !kelas.is_archived;
    const ok = await confirm({
      title: mengarkib
        ? `Archive "${kelas.name}"? Students lose access until it is restored.`
        : `Restore "${kelas.name}"?`,
      tone: mengarkib ? "danger" : "default",
    });
    if (!ok) return;
    try {
      await adminUpdateClass(id, { is_archived: mengarkib });
      await logAudit(mengarkib ? "class_archive" : "class_unarchive", "class", id, { name: kelas.name });
      setMesej({ baik: true, teks: mengarkib ? "Class archived." : "Class restored." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to update the class.") });
      reload();
    }
  };

  /** Buang kelas: pengesahan menaip nama kelas dengan tepat. */
  const hapus = async () => {
    if (!kelas) return;
    try {
      await adminDeleteClass(id);
      await logAudit("class_delete", "class", id, { name: kelas.name });
      router.push("/admin/classes");
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Delete failed.") });
      reload();
    }
  };

  /** Eksport CSV ahli: Name, Email, Joined. */
  const exportAhli = async () => {
    const ok = await confirm({
      title: `Export ${ahli.length} members with their email addresses? This is recorded in Audit.`,
    });
    if (!ok) return;
    await logAudit("members_export", "class", id, { count: ahli.length });
    const tajuk = "Name,Email,Joined";
    const baris = ahli.map((a) =>
      [
        petikCsv(lindungFormula(a.nama || "Unnamed user")),
        petikCsv(lindungFormula(a.emel || "")),
        petikCsv(tarikhKl(a.joined_at)),
      ].join(","),
    );
    muatTurunCsv([tajuk, ...baris].join("\r\n"), `kuizen-members-${slugFail(kelas?.name || "class")}.csv`);
  };

  /** Eksport CSV kedudukan ranking mengikut mod semasa. */
  const exportRanking = () => {
    let tajuk = "Rank,Name,Score";
    let baris: string[];
    if (modRanking === "teams") {
      baris = teamsSusun.map((t, i) =>
        [String(i + 1), petikCsv(lindungFormula(t.name)), String(Number(t.score) || 0)].join(","),
      );
    } else {
      // V2-012: lajur tambahan supaya eksport sepadan dengan paparan individu
      // (Activities, Live Quiz, Adjustments, Live sessions), manakala kiraan
      // jawapan diluluskan dikekalkan untuk kesinambungan dengan eksport lama.
      tajuk = "Rank,Name,Score,Approved answers,Activities,Live Quiz,Adjustments,Live sessions";
      baris = markahIndividu.map((r, i) =>
        [
          String(i + 1),
          petikCsv(lindungFormula(r.display_name || namaById[r.user_id] || "Unnamed user")),
          String(Number(r.total_score) || 0),
          String(diluluskanByUser[r.user_id] ?? 0),
          String(r.task_score ?? 0),
          String(r.live_score ?? 0),
          String(r.adjustment_score ?? 0),
          String(r.live_sessions ?? 0),
        ].join(","),
      );
    }
    muatTurunCsv([tajuk, ...baris].join("\r\n"), `kuizen-ranking-${modRanking}-${slugFail(kelas?.name || "class")}.csv`);
  };

  const muatTurunCsv = (kandungan: string, namaFail: string) => {
    // BOM UTF-8 supaya Excel di Windows membaca nama beraksen dengan betul.
    const blob = new Blob(["\uFEFF" + kandungan], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = namaFail;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /** Tukar nama pasukan; audit team_edit membawa before/after. */
  const simpanNamaPasukan = async () => {
    if (!editPasukan) return;
    const baharu = editPasukan.nama.trim();
    if (baharu === editPasukan.lama || baharu.length === 0) {
      setEditPasukan(null);
      return;
    }
    try {
      await adminUpdateTeam(editPasukan.id, { name: baharu });
      await logAudit("team_edit", "team", editPasukan.id, {
        before: { name: editPasukan.lama },
        after: { name: baharu },
      });
      setMesej({ baik: true, teks: "Team renamed." });
      setEditPasukan(null);
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to rename the team.") });
      reload();
    }
  };

  /** Buang pasukan dengan pengesahan; audit membawa nama pasukan. */
  const buangPasukan = async (t: Team) => {
    const ok = await confirm({
      title: `Delete team "${t.name}"? Members stay in the class but lose their team.`,
      tone: "danger",
    });
    if (!ok) return;
    try {
      await adminDeleteTeam(t.id);
      await logAudit("team_delete", "team", t.id, { name: t.name });
      if (pasukanDipilih === t.id) setPasukanDipilih(null);
      setMesej({ baik: true, teks: "Team deleted." });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, "Failed to delete the team.") });
      reload();
    }
  };

  // ===== Paparan =====

  if (muat) {
    return (
      <AdminShell>
        <p className="text-[14px] text-ink-faint py-8">Loading...</p>
      </AdminShell>
    );
  }

  if (!kelas) {
    return (
      <AdminShell title="Class not found">
        <Card>
          <EmptyState
            icon={<MapIcon className="w-6 h-6" />}
            title="Class not found."
            text="This class may have been deleted."
            actionLabel="Back to Classes"
            href="/admin/classes"
          />
        </Card>
      </AdminShell>
    );
  }

  const namaKelas = kelas.name;
  const status = statusKelas(kelas);

  const ahliDitapis = ahli.filter((a) => {
    const jarum = carianAhli.trim().toLowerCase();
    if (!jarum) return true;
    return (
      (a.nama || "Unnamed user").toLowerCase().includes(jarum) ||
      (a.emel || "").toLowerCase().includes(jarum)
    );
  });

  // Lajur DataTable tab Members; carian dan data sama seperti jadual lama.
  const lajurAhli: DataColumn<AhliKelasAdmin>[] = [
    {
      key: "nama",
      header: "Member",
      render: (a, i) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={a.nama || "Unnamed user"} size="sm" index={i} />
          <span className="min-w-0">
            <Link
              href={`/admin/users/${a.user_id}`}
              className="block text-[13px] font-bold text-ink hover:text-brand-purple transition truncate"
            >
              {a.nama || "Unnamed user"}
            </Link>
          </span>
        </span>
      ),
    },
    {
      key: "emel",
      header: "Email",
      hideOnMobile: true,
      render: (a) => <span className="text-[13px] text-ink-faint">{a.emel || "No email"}</span>,
    },
    {
      key: "joined",
      header: "Joined",
      render: (a) => <span className="text-[13px] text-ink-faint whitespace-nowrap">{fmt(a.joined_at)}</span>,
    },
  ];

  // Lajur DataTable tab Activities; kiraan cabaran/penghantaran sama seperti lama.
  const lajurAktiviti: DataColumn<Hunt>[] = [
    {
      key: "tajuk",
      header: "Title",
      render: (h) => (
        <Link
          href={`/admin/hunts/${h.id}`}
          className="text-[13px] font-bold text-ink hover:text-brand-purple transition"
        >
          {h.title}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (h) =>
        h.status === "active" ? (
          <Badge variant="dot" warna="green">
            {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
          </Badge>
        ) : h.status === "draft" ? (
          <Badge variant="dim" warna="yellow">
            {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
          </Badge>
        ) : (
          <Badge variant="dim" warna="gray">
            {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
          </Badge>
        ),
    },
    {
      key: "cabaran",
      header: "Challenges",
      render: (h) => (
        <span className="text-[13px] text-ink-faint">
          {challengesKelas.filter((c) => c.hunt_id === h.id).length}
        </span>
      ),
    },
    {
      key: "hantaran",
      header: "Submissions",
      render: (h) => (
        <span className="text-[13px] text-ink-faint">
          {subsKelas.filter((s) =>
            challengesKelas.some((c) => c.id === s.challenge_id && c.hunt_id === h.id),
          ).length}
        </span>
      ),
    },
    {
      key: "mula",
      header: "Start",
      hideOnMobile: true,
      render: (h) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">{h.start_at ? fmt(h.start_at) : "-"}</span>
      ),
    },
    {
      key: "tamat",
      header: "End",
      hideOnMobile: true,
      render: (h) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">{h.end_at ? fmt(h.end_at) : "-"}</span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHead
        crumb="Classes"
        name={namaKelas}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              by{" "}
              <Link
                href={`/admin/users/${kelas.owner_id}`}
                className="text-brand-purple font-medium hover:underline"
              >
                {namaProfil(kelas.owner_id)}
              </Link>
            </span>
            <span className="font-mono">{kelas.join_code || "-"}</span>
            {status === "active" ? (
              <Badge variant="dot" warna="green">
                {labelStatusKelas(kelas)}
              </Badge>
            ) : status === "ended" ? (
              <Badge variant="dim" warna="yellow">
                {labelStatusKelas(kelas)}
              </Badge>
            ) : (
              <Badge variant="dim" warna="gray">
                {labelStatusKelas(kelas)}
              </Badge>
            )}
          </span>
        }
        secondaryActions={[
          {
            label: "Edit",
            icon: <Pencil className="w-4 h-4" />,
            onSelect: () => setEdit({ name: kelas.name, join_code: kelas.join_code || "" }),
          },
          kelas.is_archived
            ? { label: "Restore", icon: <RotateCcw className="w-4 h-4" />, onSelect: tukarArkib }
            : { label: "Archive", icon: <Archive className="w-4 h-4" />, onSelect: tukarArkib },
          { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onSelect: () => setZonBahaya((v) => !v) },
        ]}
      />

      {/* Zon bahaya buang kelas: pengesahan menaip nama kelas tepat */}
      {zonBahaya && (
        <Card className="mb-6">
          <div className="text-[13px] font-bold text-red-600 mb-1">Danger zone</div>
          <p className="text-[14px] text-ink-muted mb-4">
            Deleting this class removes its activities, submissions and teams permanently. Type the class name exactly to enable the button.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-64"
              placeholder={namaKelas}
              value={pengesahanHapus}
              onChange={(e) => setPengesahanHapus(e.target.value)}
              aria-label="Type the class name to confirm deletion"
            />
            <button
              type="button"
              disabled={pengesahanHapus !== namaKelas}
              onClick={hapus}
              className="inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none h-9 px-[18px] py-[7px] text-[13px] bg-red-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" /> Delete class
            </button>
            <Button variant="outline" onClick={() => { setZonBahaya(false); setPengesahanHapus(""); }}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Tabs
        items={[
          { label: "Overview", onSelect: () => setTab("overview"), aktif: tab === "overview" },
          { label: "Members", onSelect: () => setTab("members"), aktif: tab === "members" },
          { label: "Activities", onSelect: () => setTab("activities"), aktif: tab === "activities" },
          { label: "Teams", onSelect: () => setTab("teams"), aktif: tab === "teams" },
          { label: "Ranking", onSelect: () => setTab("ranking"), aktif: tab === "ranking" },
        ]}
      />

      {mesej && (
        <Alert tone={mesej.baik ? "success" : "danger"} className="mt-4">
          {mesej.teks}
        </Alert>
      )}

      {/* ===== Tab Overview ===== */}
      {tab === "overview" && (
        <>
          <Card>
            <StatGroup
              stats={[
                { label: "Members", value: ahli.length },
                { label: "Activities", value: hunts.length },
                { label: "Teams", value: teams.length },
                { label: "Submissions", value: kiraanSubs.jumlah },
              ]}
            />
          </Card>
          <Card className="mt-4">
            <CardHead title="Class details" />
            <div className="mt-4">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">Description</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted text-right sm:text-left">
                  {kelas.description || "-"}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">Created</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">{fmt(kelas.created_at)}</div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">Scoring mode</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">
                  {kelas.scoring_mode === "individual" ? "Individual" : "Team"}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">Leaderboard visible to students</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">
                  {kelas.leaderboard_visible === false ? "No" : "Yes"}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">Submissions</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">
                  {kiraanSubs.approved} approved, {kiraanSubs.rejected} rejected, {kiraanSubs.pending} pending
                </div>
              </div>
            </div>
          </Card>
        </>
      )}

      {/* ===== Tab Members ===== */}
      {tab === "members" && (
        <DataTable
          className="mt-4"
          label="Class members"
          columns={lajurAhli}
          rows={ahliDitapis}
          rowKey={(a) => a.user_id}
          head={
            <>
              <span className="w-full sm:w-64">
                <Input
                  ikonKiri={<Search className="w-4 h-4" />}
                  placeholder="Search name or email"
                  aria-label="Search members"
                  value={carianAhli}
                  onChange={(e) => setCarianAhli(e.target.value)}
                />
              </span>
              <Button variant="outline" onClick={exportAhli}>
                <Download className="w-4 h-4" /> Export CSV
              </Button>
            </>
          }
          empty={
            <EmptyState
              icon={<UsersIcon className="w-6 h-6" />}
              title="No members."
              text="Nobody has joined this class yet."
            />
          }
        />
      )}

      {/* ===== Tab Activities ===== */}
      {tab === "activities" && (
        <DataTable
          className="mt-4"
          label="Class activities"
          columns={lajurAktiviti}
          rows={hunts}
          rowKey={(h) => h.id}
          empty={
            <EmptyState
              icon={<MapIcon className="w-6 h-6" />}
              title="No activities."
              text="This class has no activities yet."
            />
          }
        />
      )}

      {/* ===== Tab Teams ===== */}
      {tab === "teams" && (
        <div className="mt-4 grid lg:grid-cols-2 gap-4 items-start">
          {/* Senarai kiri */}
          <Card padat>
            <div className="px-6 py-4 border-b border-kz-line text-[16.8px] font-bold tracking-[-0.17px] text-ink">
              Teams
            </div>
            {teams.length === 0 ? (
              <EmptyState
                icon={<UsersIcon className="w-6 h-6" />}
                title="No teams."
                text="Teams appear here once an educator creates them."
              />
            ) : (
              teamsSusun.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPasukanDipilih(t.id)}
                  className={`w-full flex items-center gap-3 px-6 py-4 border-t border-kz-line text-left transition ${
                    pasukanDipilih === t.id ? "bg-[#F1EEFC]" : "hover:bg-[#f8f9fc]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink truncate">{t.name}</span>
                    <span className="block text-[12px] text-ink-faint">{ahliPasukan[t.id]?.length ?? 0} members</span>
                  </span>
                  <span className="text-[14px] font-semibold text-brand-purple shrink-0">{Number(t.score) || 0}</span>
                </button>
              ))
            )}
          </Card>

          {/* Panel kanan: butiran pasukan dipilih */}
          <Card>
            {pasukanDipilih === null ? (
              <EmptyState
                icon={<UsersIcon className="w-6 h-6" />}
                title="Select a team."
                text="Pick a team on the left to see its members."
              />
            ) : (
              (() => {
                const t = teams.find((x) => x.id === pasukanDipilih);
                if (!t)
                  return (
                    <EmptyState
                      icon={<UsersIcon className="w-6 h-6" />}
                      title="Team not found."
                      text="It may have been deleted."
                    />
                  );
                const senarai = butiranAhli[t.id];
                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[16.8px] font-bold tracking-[-0.17px] text-ink truncate">{t.name}</div>
                        <div className="text-[12px] text-ink-faint">Score {Number(t.score) || 0}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditPasukan({ id: t.id, nama: t.name, lama: t.name })}
                        >
                          <Pencil className="w-4 h-4" /> Rename
                        </Button>
                        <button
                          type="button"
                          onClick={() => buangPasukan(t)}
                          className="inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none h-8 px-3 text-[12px] bg-white border border-red-200 text-red-600 hover:bg-[#fce4e2]"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </div>
                    {senarai === undefined ? (
                      <div className="text-[14px] text-ink-faint py-4">Loading members...</div>
                    ) : senarai.length === 0 ? (
                      <EmptyState
                        icon={<UsersIcon className="w-6 h-6" />}
                        title="No members."
                        text="Nobody is in this team yet."
                      />
                    ) : (
                      <div className="mt-2 space-y-1">
                        {senarai.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-2 text-[14px] py-1">
                            <span className="text-ink truncate">{m.nama || "Unnamed user"}</span>
                            {m.role === "leader" && (
                              <Badge variant="dim" warna="purple">
                                Leader
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[12px] text-ink-faint mt-4">Team changes are recorded in Audit.</p>
                  </>
                );
              })()
            )}
          </Card>
        </div>
      )}

      {/* ===== Tab Ranking ===== */}
      {tab === "ranking" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1 p-1 bg-[#eff1f5] rounded-[4px] w-fit">
              <button
                type="button"
                onClick={() => setModRanking("teams")}
                className={`px-4 py-1.5 rounded-[4px] text-[13px] font-bold transition ${
                  modRanking === "teams" ? "bg-white shadow text-brand-purple" : "text-ink-muted hover:text-ink"
                }`}
              >
                Teams
              </button>
              <button
                type="button"
                onClick={() => setModRanking("individuals")}
                className={`px-4 py-1.5 rounded-[4px] text-[13px] font-bold transition ${
                  modRanking === "individuals" ? "bg-white shadow text-brand-purple" : "text-ink-muted hover:text-ink"
                }`}
              >
                Individuals
              </button>
            </div>
            <Button variant="outline" onClick={exportRanking}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>

          <Card padat>
            {modRanking === "teams" ? (
              teamsSusun.length === 0 ? (
                <EmptyState
                  icon={<UsersIcon className="w-6 h-6" />}
                  title="No team scores yet."
                  text="Teams appear here once an educator creates them."
                />
              ) : (
                teamsSusun.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-6 py-4 border-t border-kz-line first:border-t-0"
                  >
                    <span className="w-8 h-8 rounded-full bg-[#EAE6FC] text-brand-purple text-[13px] font-semibold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[14px] font-bold text-ink truncate flex-1">{t.name}</span>
                    <span className="text-[14px] font-semibold text-brand-purple shrink-0">{Number(t.score) || 0}</span>
                  </div>
                ))
              )
            ) : markahIndividu.length === 0 ? (
              <EmptyState
                icon={<UsersIcon className="w-6 h-6" />}
                title="No students ranked yet."
                text="Scores appear here once students join activities."
              />
            ) : (
              markahIndividu.map((r, i) => (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 px-6 py-4 border-t border-kz-line first:border-t-0"
                >
                  <span className="w-8 h-8 rounded-full bg-[#EAE6FC] text-brand-purple text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/admin/users/${r.user_id}`}
                      className="text-[14px] font-bold text-ink hover:text-brand-purple transition truncate"
                    >
                      {r.display_name || namaById[r.user_id] || "Unnamed user"}
                    </Link>
                    {/* V2-012: pecahan markah individu daripada view
                        qm_class_individual_scores (migrasi 0049). */}
                    <span className="block text-[12px] text-ink-faint truncate">
                      Activities {r.task_score ?? 0} · Live Quiz {r.live_score ?? 0} · Adjustments {r.adjustment_score ?? 0}
                    </span>
                  </span>
                  <span className="text-[14px] font-semibold text-brand-purple shrink-0">{Number(r.total_score) || 0}</span>
                </div>
              ))
            )}
          </Card>
          <p className="text-[12px] text-ink-faint mt-3">
            Team scores come from the live scoring engine. Individual totals combine activities, live quizzes and adjustments.
          </p>
        </div>
      )}

      {/* Dialog edit kelas */}
      <Modal
        open={edit !== null}
        onClose={() => setEdit(null)}
        title="Edit class"
        footer={
          <>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={simpanEdit} disabled={!edit || edit.name.trim().length === 0}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="edit-nama-kelas">
            <Input
              id="edit-nama-kelas"
              value={edit?.name ?? ""}
              onChange={(e) => setEdit(edit ? { ...edit, name: e.target.value } : null)}
            />
          </Field>
          <Field label="Join code" htmlFor="edit-kod-kelas">
            <Input
              id="edit-kod-kelas"
              className="font-mono"
              value={edit?.join_code ?? ""}
              onChange={(e) => setEdit(edit ? { ...edit, join_code: e.target.value } : null)}
            />
          </Field>
          <p className="text-[12px] text-ink-faint">Class changes are recorded in Audit.</p>
        </div>
      </Modal>

      {/* Dialog tukar nama pasukan */}
      <Modal
        open={editPasukan !== null}
        onClose={() => setEditPasukan(null)}
        title="Rename team"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditPasukan(null)}>
              Cancel
            </Button>
            <Button onClick={simpanNamaPasukan} disabled={!editPasukan || editPasukan.nama.trim().length === 0}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="New team name" htmlFor="edit-nama-pasukan">
            <Input
              id="edit-nama-pasukan"
              value={editPasukan?.nama ?? ""}
              onChange={(e) => setEditPasukan(editPasukan ? { ...editPasukan, nama: e.target.value } : null)}
            />
          </Field>
          <p className="text-[12px] text-ink-faint">Team changes are recorded in Audit.</p>
        </div>
      </Modal>
    </AdminShell>
  );
}
