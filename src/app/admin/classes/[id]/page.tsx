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
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { LOKAL } from "@/lib/i18n";
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

// Format tarikh; lokal pilihan supaya paparan ikut bahasa semasa.
function fmt(d: string | null | undefined, lokal?: string) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString(lokal);
  } catch {
    return String(d);
  }
}

export default function Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { t, bahasa } = useBahasa();
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
      setMesej({ baik: false, teks: mesejHad(e, t("admin.classDetail.loadFailed")) });
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
    if (!uid) return t("admin.unnamedUser");
    const p = profiles.find((u) => u.id === uid);
    return p?.display_name || t("admin.unnamedUser");
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
      setMesej({ baik: true, teks: t("admin.classDetail.updated") });
      setEdit(null);
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.classDetail.updateFailed")) });
      reload();
    }
  };

  /** Arkib/pulihkan kelas melalui is_archived. */
  const tukarArkib = async () => {
    if (!kelas) return;
    const mengarkib = !kelas.is_archived;
    const ok = await confirm({
      title: mengarkib
        ? t("admin.classDetail.archiveConfirm", { nama: kelas.name })
        : t("admin.classDetail.restoreConfirm", { nama: kelas.name }),
      tone: mengarkib ? "danger" : "default",
    });
    if (!ok) return;
    try {
      await adminUpdateClass(id, { is_archived: mengarkib });
      await logAudit(mengarkib ? "class_archive" : "class_unarchive", "class", id, { name: kelas.name });
      setMesej({ baik: true, teks: mengarkib ? t("admin.classDetail.archivedMsg") : t("admin.classDetail.restoredMsg") });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.classDetail.updateFailed")) });
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
      setMesej({ baik: false, teks: mesejHad(e, t("admin.classDetail.deleteFailed")) });
      reload();
    }
  };

  /** Eksport CSV ahli: Name, Email, Joined. */
  const exportAhli = async () => {
    const ok = await confirm({
      title: t("admin.classDetail.exportMembersConfirm", { n: ahli.length }),
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
      setMesej({ baik: true, teks: t("admin.classDetail.teamRenamed") });
      setEditPasukan(null);
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.classDetail.renameFailed")) });
      reload();
    }
  };

  /** Buang pasukan dengan pengesahan; audit membawa nama pasukan. */
  const buangPasukan = async (pas: Team) => {
    const ok = await confirm({
      title: t("admin.classDetail.deleteTeamConfirm", { nama: pas.name }),
      tone: "danger",
    });
    if (!ok) return;
    try {
      await adminDeleteTeam(pas.id);
      await logAudit("team_delete", "team", pas.id, { name: pas.name });
      if (pasukanDipilih === pas.id) setPasukanDipilih(null);
      setMesej({ baik: true, teks: t("admin.classDetail.teamDeleted") });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.classDetail.teamDeleteFailed")) });
      reload();
    }
  };

  // ===== Paparan =====

  if (muat) {
    return (
      <AdminShell>
        <p className="text-[14px] text-ink-faint py-8">{t("common.loadingDots")}</p>
      </AdminShell>
    );
  }

  if (!kelas) {
    return (
      <AdminShell title={t("admin.classDetail.notFoundTitle")}>
        <Card>
          <EmptyState
            icon={<MapIcon className="w-6 h-6" />}
            title={`${t("admin.classDetail.notFoundTitle")}.`}
            text={t("admin.classDetail.notFoundText")}
            actionLabel={t("admin.classDetail.backToClasses")}
            href="/admin/classes"
          />
        </Card>
      </AdminShell>
    );
  }

  const namaKelas = kelas.name;
  const status = statusKelas(kelas);

  // Label paparan status kelas daripada kunci status teknikal.
  const labelStatus = () => {
    if (status === "archived") return t("admin.archived");
    if (status === "ended") return t("admin.ended");
    return t("admin.active");
  };

  const ahliDitapis = ahli.filter((a) => {
    const jarum = carianAhli.trim().toLowerCase();
    if (!jarum) return true;
    return (
      (a.nama || t("admin.unnamedUser")).toLowerCase().includes(jarum) ||
      (a.emel || "").toLowerCase().includes(jarum)
    );
  });

  // Lajur DataTable tab Members; carian dan data sama seperti jadual lama.
  const lajurAhli: DataColumn<AhliKelasAdmin>[] = [
    {
      key: "nama",
      header: t("admin.classDetail.colMember"),
      render: (a, i) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={a.nama || t("admin.unnamedUser")} size="sm" index={i} />
          <span className="min-w-0">
            <Link
              href={`/admin/users/${a.user_id}`}
              className="block text-[13px] font-bold text-ink hover:text-brand-purple transition truncate"
            >
              {a.nama || t("admin.unnamedUser")}
            </Link>
          </span>
        </span>
      ),
    },
    {
      key: "emel",
      header: t("admin.classDetail.colEmail"),
      hideOnMobile: true,
      render: (a) => <span className="text-[13px] text-ink-faint">{a.emel || t("admin.noEmail")}</span>,
    },
    {
      key: "joined",
      header: t("admin.classDetail.colJoined"),
      render: (a) => <span className="text-[13px] text-ink-faint whitespace-nowrap">{fmt(a.joined_at, LOKAL[bahasa])}</span>,
    },
  ];

  // Lajur DataTable tab Activities; kiraan cabaran/penghantaran sama seperti lama.
  const lajurAktiviti: DataColumn<Hunt>[] = [
    {
      key: "tajuk",
      header: t("admin.classDetail.colTitle"),
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
      header: t("admin.classDetail.colStatus"),
      render: (h) =>
        h.status === "active" ? (
          <Badge variant="dot" warna="green">
            {t("admin.classDetail.statusActive")}
          </Badge>
        ) : h.status === "draft" ? (
          <Badge variant="dim" warna="yellow">
            {t("admin.classDetail.statusDraft")}
          </Badge>
        ) : (
          <Badge variant="dim" warna="gray">
            {h.status === "archived" ? t("admin.archived") : h.status}
          </Badge>
        ),
    },
    {
      key: "cabaran",
      header: t("admin.classDetail.colChallenges"),
      render: (h) => (
        <span className="text-[13px] text-ink-faint">
          {challengesKelas.filter((c) => c.hunt_id === h.id).length}
        </span>
      ),
    },
    {
      key: "hantaran",
      header: t("admin.classDetail.colSubmissions"),
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
      header: t("admin.classDetail.colStart"),
      hideOnMobile: true,
      render: (h) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">{h.start_at ? fmt(h.start_at, LOKAL[bahasa]) : "-"}</span>
      ),
    },
    {
      key: "tamat",
      header: t("admin.classDetail.colEnd"),
      hideOnMobile: true,
      render: (h) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">{h.end_at ? fmt(h.end_at, LOKAL[bahasa]) : "-"}</span>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHead
        crumb={t("nav.adminClasses")}
        name={namaKelas}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {t("admin.classDetail.by")}
              {" "}
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
                {labelStatus()}
              </Badge>
            ) : status === "ended" ? (
              <Badge variant="dim" warna="yellow">
                {labelStatus()}
              </Badge>
            ) : (
              <Badge variant="dim" warna="gray">
                {labelStatus()}
              </Badge>
            )}
          </span>
        }
        secondaryActions={[
          {
            label: t("admin.classDetail.edit"),
            icon: <Pencil className="w-4 h-4" />,
            onSelect: () => setEdit({ name: kelas.name, join_code: kelas.join_code || "" }),
          },
          kelas.is_archived
            ? { label: t("admin.classDetail.restore"), icon: <RotateCcw className="w-4 h-4" />, onSelect: tukarArkib }
            : { label: t("admin.classDetail.archive"), icon: <Archive className="w-4 h-4" />, onSelect: tukarArkib },
          { label: t("admin.classDetail.delete"), icon: <Trash2 className="w-4 h-4" />, onSelect: () => setZonBahaya((v) => !v) },
        ]}
      />

      {/* Zon bahaya buang kelas: pengesahan menaip nama kelas tepat */}
      {zonBahaya && (
        <Card className="mb-6">
          <div className="text-[13px] font-bold text-red-600 mb-1">{t("admin.dangerZone")}</div>
          <p className="text-[14px] text-ink-muted mb-4">
            {t("admin.classDetail.deleteClassDesc")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="w-64"
              placeholder={namaKelas}
              value={pengesahanHapus}
              onChange={(e) => setPengesahanHapus(e.target.value)}
              aria-label={t("admin.classDetail.typeClassNameAria")}
            />
            <button
              type="button"
              disabled={pengesahanHapus !== namaKelas}
              onClick={hapus}
              className="inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none h-9 px-[18px] py-[7px] text-[13px] bg-red-600 text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" /> {t("admin.classDetail.deleteClass")}
            </button>
            <Button variant="outline" onClick={() => { setZonBahaya(false); setPengesahanHapus(""); }}>
              {t("common.cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Tabs
        items={[
          { label: t("nav.adminOverview"), onSelect: () => setTab("overview"), aktif: tab === "overview" },
          { label: t("common.members"), onSelect: () => setTab("members"), aktif: tab === "members" },
          { label: t("nav.activities"), onSelect: () => setTab("activities"), aktif: tab === "activities" },
          { label: t("nav.teams"), onSelect: () => setTab("teams"), aktif: tab === "teams" },
          { label: t("nav.ranking"), onSelect: () => setTab("ranking"), aktif: tab === "ranking" },
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
                { label: t("common.members"), value: ahli.length },
                { label: t("nav.activities"), value: hunts.length },
                { label: t("nav.teams"), value: teams.length },
                { label: t("admin.classDetail.colSubmissions"), value: kiraanSubs.jumlah },
              ]}
            />
          </Card>
          <Card className="mt-4">
            <CardHead title={t("admin.classDetail.details")} />
            <div className="mt-4">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">{t("admin.classDetail.description")}</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted text-right sm:text-left">
                  {kelas.description || "-"}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">{t("admin.classDetail.created")}</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">{fmt(kelas.created_at, LOKAL[bahasa])}</div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">{t("admin.classDetail.scoringMode")}</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">
                  {kelas.scoring_mode === "individual" ? t("admin.classDetail.individual") : t("admin.classDetail.team")}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3 border-b border-kz-line">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">{t("admin.classDetail.leaderboardVisible")}</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">
                  {kelas.leaderboard_visible === false ? t("admin.no") : t("admin.yes")}
                </div>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 py-3">
                <div className="w-full sm:w-1/3 text-[14px] text-ink-faint shrink-0">{t("admin.classDetail.colSubmissions")}</div>
                <div className="flex-1 min-w-0 text-[14px] font-medium text-ink-muted">
                  {t("admin.classDetail.subsCounts", { lulus: kiraanSubs.approved, tolak: kiraanSubs.rejected, menunggu: kiraanSubs.pending })}
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
          label={t("admin.classDetail.membersTable")}
          columns={lajurAhli}
          rows={ahliDitapis}
          rowKey={(a) => a.user_id}
          head={
            <>
              <span className="w-full sm:w-64">
                <Input
                  ikonKiri={<Search className="w-4 h-4" />}
                  placeholder={t("admin.classDetail.searchMembersPlaceholder")}
                  aria-label={t("admin.classDetail.searchMembersAria")}
                  value={carianAhli}
                  onChange={(e) => setCarianAhli(e.target.value)}
                />
              </span>
              <Button variant="outline" onClick={exportAhli}>
                <Download className="w-4 h-4" /> {t("admin.exportCsv")}
              </Button>
            </>
          }
          empty={
            <EmptyState
              icon={<UsersIcon className="w-6 h-6" />}
              title={t("admin.classDetail.noMembers")}
              text={t("admin.classDetail.noMembersText")}
            />
          }
        />
      )}

      {/* ===== Tab Activities ===== */}
      {tab === "activities" && (
        <DataTable
          className="mt-4"
          label={t("admin.classDetail.activitiesTable")}
          columns={lajurAktiviti}
          rows={hunts}
          rowKey={(h) => h.id}
          empty={
            <EmptyState
              icon={<MapIcon className="w-6 h-6" />}
              title={t("admin.classDetail.noActivities")}
              text={t("admin.classDetail.noActivitiesText")}
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
              {t("admin.classDetail.teamsHeading")}
            </div>
            {teams.length === 0 ? (
              <EmptyState
                icon={<UsersIcon className="w-6 h-6" />}
                title={t("admin.classDetail.noTeams")}
                text={t("admin.classDetail.noTeamsText")}
              />
            ) : (
              teamsSusun.map((pas) => (
                <button
                  key={pas.id}
                  type="button"
                  onClick={() => setPasukanDipilih(pas.id)}
                  className={`w-full flex items-center gap-3 px-6 py-4 border-t border-kz-line text-left transition ${
                    pasukanDipilih === pas.id ? "bg-[#F1EEFC]" : "hover:bg-[#f8f9fc]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-bold text-ink truncate">{pas.name}</span>
                    <span className="block text-[12px] text-ink-faint">{t("admin.classDetail.membersCount", { n: ahliPasukan[pas.id]?.length ?? 0 })}</span>
                  </span>
                  <span className="text-[14px] font-semibold text-brand-purple shrink-0">{Number(pas.score) || 0}</span>
                </button>
              ))
            )}
          </Card>

          {/* Panel kanan: butiran pasukan dipilih */}
          <Card>
            {pasukanDipilih === null ? (
              <EmptyState
                icon={<UsersIcon className="w-6 h-6" />}
                title={t("admin.classDetail.selectTeam")}
                text={t("admin.classDetail.selectTeamText")}
              />
            ) : (
              (() => {
                const pas = teams.find((x) => x.id === pasukanDipilih);
                if (!pas)
                  return (
                    <EmptyState
                      icon={<UsersIcon className="w-6 h-6" />}
                      title={t("admin.classDetail.teamNotFound")}
                      text={t("admin.classDetail.teamNotFoundText")}
                    />
                  );
                const senarai = butiranAhli[pas.id];
                return (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[16.8px] font-bold tracking-[-0.17px] text-ink truncate">{pas.name}</div>
                        <div className="text-[12px] text-ink-faint">{t("admin.classDetail.score", { n: Number(pas.score) || 0 })}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditPasukan({ id: pas.id, nama: pas.name, lama: pas.name })}
                        >
                          <Pencil className="w-4 h-4" /> {t("admin.classDetail.rename")}
                        </Button>
                        <button
                          type="button"
                          onClick={() => buangPasukan(pas)}
                          className="inline-flex items-center justify-center gap-2 font-bold tracking-[0.26px] rounded-[4px] transition select-none h-8 px-3 text-[12px] bg-white border border-red-200 text-red-600 hover:bg-[#fce4e2]"
                        >
                          <Trash2 className="w-4 h-4" /> {t("admin.classDetail.deleteTeam")}
                        </button>
                      </div>
                    </div>
                    {senarai === undefined ? (
                      <div className="text-[14px] text-ink-faint py-4">{t("admin.classDetail.loadingMembers")}</div>
                    ) : senarai.length === 0 ? (
                      <EmptyState
                        icon={<UsersIcon className="w-6 h-6" />}
                        title={t("admin.classDetail.noTeamMembers")}
                        text={t("admin.classDetail.noTeamMembersText")}
                      />
                    ) : (
                      <div className="mt-2 space-y-1">
                        {senarai.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-2 text-[14px] py-1">
                            <span className="text-ink truncate">{m.nama || t("admin.unnamedUser")}</span>
                            {m.role === "leader" && (
                              <Badge variant="dim" warna="purple">
                                {t("admin.leader")}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-[12px] text-ink-faint mt-4">{t("admin.classDetail.teamAuditNote")}</p>
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
                {t("admin.classDetail.teamsHeading")}
              </button>
              <button
                type="button"
                onClick={() => setModRanking("individuals")}
                className={`px-4 py-1.5 rounded-[4px] text-[13px] font-bold transition ${
                  modRanking === "individuals" ? "bg-white shadow text-brand-purple" : "text-ink-muted hover:text-ink"
                }`}
              >
                {t("admin.classDetail.individualsMode")}
              </button>
            </div>
            <Button variant="outline" onClick={exportRanking}>
              <Download className="w-4 h-4" /> {t("admin.exportCsv")}
            </Button>
          </div>

          <Card padat>
            {modRanking === "teams" ? (
              teamsSusun.length === 0 ? (
                <EmptyState
                  icon={<UsersIcon className="w-6 h-6" />}
                  title={t("admin.classDetail.noTeamScores")}
                  text={t("admin.classDetail.noTeamsText")}
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
