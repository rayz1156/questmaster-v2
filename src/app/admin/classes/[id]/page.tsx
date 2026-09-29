"use client";

// Butiran kelas ruang kerja admin (V2-011c). Semua tindakan kelas
// berpindah ke sini daripada senarai: edit nama/join_code, arkib dan
// buang dengan pengesahan menaip nama. Tab: Overview, Members,
// Activities, Teams dan Ranking.
//
// Ranking individu dikira oleh kiraRankingIndividu (tulen) daripada
// submission diluluskan; skor pasukan datang terus daripada enjin
// pemarkahan langsung qm_teams.score.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Pencil, Archive, RotateCcw, Trash2, X, Download, Users as UsersIcon,
  Map as MapIcon, ClipboardList, Search,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { Card, Pill, Tabs, EmptyState, StatCard } from "@/components/admin/ui";
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
  logAudit,
  type Profile,
  type Hunt,
  type Challenge,
  type Submission,
  type Team,
  type AhliKelasAdmin,
  type AhliPasukanAdmin,
} from "@/lib/data";
import { kiraRankingIndividu } from "@/lib/adminRanking";
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

  const reload = async () => {
    try {
      const [semuaKelas, profs, semuaHunt, semuaCh, semuaSub, semuaTeam, ahliKelas] = await Promise.all([
        adminListAllClasses(),
        adminListProfiles(),
        adminListAllHunts(),
        adminListAllChallenges(),
        adminListAllSubmissions(),
        adminListAllTeams(),
        adminListClassMembers(id).catch(() => [] as AhliKelasAdmin[]),
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

  const rankingIndividu = useMemo(
    () => kiraRankingIndividu(subsKelas, challengesKelas, namaById),
    [subsKelas, challengesKelas, namaById],
  );
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
      tajuk = "Rank,Name,Score,Approved answers";
      baris = rankingIndividu.map((r, i) =>
        [String(i + 1), petikCsv(lindungFormula(r.nama)), String(r.skor), String(r.diluluskan)].join(","),
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
      <AdminShell crumbs={[{ label: "Classes", href: "/admin/classes" }, { label: "Loading..." }]}>
        <div className="text-sm text-ink-faint py-8">Loading...</div>
      </AdminShell>
    );
  }

  if (!kelas) {
    return (
      <AdminShell
        crumbs={[{ label: "Classes", href: "/admin/classes" }, { label: "Not found" }]}
        title="Class not found"
      >
        <Card>
          <EmptyState title="Class not found." body="This class may have been deleted." />
          <div className="px-4 pb-4">
            <Link href="/admin/classes" className="text-sm font-medium text-brand-purple hover:opacity-80">
              Back to Classes
            </Link>
          </div>
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

  return (
    <AdminShell
      crumbs={[{ label: "Classes", href: "/admin/classes" }, { label: namaKelas }]}
      actions={
        <>
          <button
            type="button"
            onClick={() => setEdit({ name: kelas.name, join_code: kelas.join_code || "" })}
            className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
          >
            <Pencil className="w-4 h-4 text-ink-faint" /> Edit
          </button>
          {kelas.is_archived ? (
            <button
              type="button"
              onClick={tukarArkib}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
            >
              <RotateCcw className="w-4 h-4 text-ink-faint" /> Restore
            </button>
          ) : (
            <button
              type="button"
              onClick={tukarArkib}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
            >
              <Archive className="w-4 h-4 text-ink-faint" /> Archive
            </button>
          )}
          <button
            type="button"
            onClick={() => setZonBahaya((v) => !v)}
            className="inline-flex items-center gap-1.5 bg-white border border-red-200 rounded-xl px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        </>
      }
    >
      {/* Kepala */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <span
          className="w-12 h-12 rounded-2xl shrink-0"
          style={{ background: kelas.color || "#6366f1" }}
          aria-hidden
        />
        <div className="min-w-0">
          <div className="text-xl font-semibold text-ink truncate">{namaKelas}</div>
          <div className="text-sm text-ink-faint truncate flex items-center gap-2 flex-wrap">
            <span>
              by{" "}
              <Link href={`/admin/users/${kelas.owner_id}`} className="text-brand-purple font-medium hover:opacity-80">
                {namaProfil(kelas.owner_id)}
              </Link>
            </span>
            <span className="font-mono">{kelas.join_code || "-"}</span>
            <Pill tone={status === "active" ? "green" : status === "ended" ? "yellow" : "gray"}>
              {labelStatusKelas(kelas)}
            </Pill>
          </div>
        </div>
      </div>

      {/* Zon bahaya buang kelas: pengesahan menaip nama kelas tepat */}
      {zonBahaya && (
        <Card className="mb-6 p-4 border-red-200">
          <div className="text-sm font-semibold text-red-600 mb-1">Danger zone</div>
          <p className="text-sm text-ink-muted mb-3">
            Deleting this class removes its activities, submissions and teams permanently. Type the class name exactly to enable the button.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              className="h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink w-64"
              placeholder={namaKelas}
              value={pengesahanHapus}
              onChange={(e) => setPengesahanHapus(e.target.value)}
              aria-label="Type the class name to confirm deletion"
            />
            <button
              type="button"
              disabled={pengesahanHapus !== namaKelas}
              onClick={hapus}
              className="inline-flex items-center gap-1.5 bg-red-600 text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
            >
              <Trash2 className="w-4 h-4" /> Delete class
            </button>
            <button
              type="button"
              onClick={() => {
                setZonBahaya(false);
                setPengesahanHapus("");
              }}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      <Tabs
        items={[
          { key: "overview", label: "Overview" },
          { key: "members", label: "Members" },
          { key: "activities", label: "Activities" },
          { key: "teams", label: "Teams" },
          { key: "ranking", label: "Ranking" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as MukaTab)}
      />

      {mesej && (
        <div
          className={`mt-4 text-sm rounded-lg px-3 py-2 inline-block ${
            mesej.baik
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          {mesej.teks}
        </div>
      )}

      {/* ===== Tab Overview ===== */}
      {tab === "overview" && (
        <div className="mt-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <StatCard label="Members" value={ahli.length} icon={<UsersIcon className="w-4 h-4" />} />
            <StatCard label="Activities" value={hunts.length} icon={<MapIcon className="w-4 h-4" />} />
            <StatCard label="Teams" value={teams.length} icon={<UsersIcon className="w-4 h-4" />} />
            <StatCard
              label="Submissions"
              value={kiraanSubs.jumlah}
              hint={`${kiraanSubs.approved} approved, ${kiraanSubs.rejected} rejected, ${kiraanSubs.pending} pending`}
              icon={<ClipboardList className="w-4 h-4" />}
            />
          </div>
          <Card className="p-4">
            <div className="text-sm font-semibold text-ink mb-2">Class details</div>
            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-hairline last:border-b-0">
              <span className="text-sm text-ink-muted shrink-0">Description</span>
              <span className="text-sm text-ink text-right min-w-0">{kelas.description || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-hairline last:border-b-0">
              <span className="text-sm text-ink-muted shrink-0">Created</span>
              <span className="text-sm text-ink text-right">{fmt(kelas.created_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-hairline last:border-b-0">
              <span className="text-sm text-ink-muted shrink-0">Scoring mode</span>
              <span className="text-sm text-ink text-right">{kelas.scoring_mode === "individual" ? "Individual" : "Team"}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5 border-b border-hairline last:border-b-0">
              <span className="text-sm text-ink-muted shrink-0">Leaderboard visible to students</span>
              <span className="text-sm text-ink text-right">{kelas.leaderboard_visible === false ? "No" : "Yes"}</span>
            </div>
          </Card>
        </div>
      )}

      {/* ===== Tab Members ===== */}
      {tab === "members" && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-hairline text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
                placeholder="Search name or email"
                value={carianAhli}
                onChange={(e) => setCarianAhli(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={exportAhli}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
            >
              <Download className="w-4 h-4 text-ink-faint" /> Export CSV
            </button>
          </div>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {ahliDitapis.map((a) => (
                    <tr key={a.user_id} className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${a.user_id}`}
                          className="font-medium text-brand-purple hover:opacity-80"
                        >
                          {a.nama || "Unnamed user"}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{a.emel || "No email"}</td>
                      <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{fmt(a.joined_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ahli.length === 0 && <EmptyState title="No members." body="Nobody has joined this class yet." />}
          </Card>
        </div>
      )}

      {/* ===== Tab Activities ===== */}
      {tab === "activities" && (
        <Card className="mt-4 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-faint border-b border-hairline">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Challenges</th>
                  <th className="px-4 py-3 font-medium">Submissions</th>
                  <th className="px-4 py-3 font-medium">Start</th>
                  <th className="px-4 py-3 font-medium">End</th>
                </tr>
              </thead>
              <tbody>
                {hunts.map((h) => {
                  const kiraCh = challengesKelas.filter((c) => c.hunt_id === h.id).length;
                  const kiraSub = subsKelas.filter((s) =>
                    challengesKelas.some((c) => c.id === s.challenge_id && c.hunt_id === h.id),
                  ).length;
                  return (
                    <tr key={h.id} className="border-b border-hairline last:border-b-0 hover:bg-[#F7F7F9]">
                      <td className="px-4 py-3">
                        <Link href={`/admin/hunts/${h.id}`} className="font-medium text-brand-purple hover:opacity-80">
                          {h.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Pill tone={h.status === "active" ? "green" : h.status === "draft" ? "yellow" : "gray"}>
                          {h.status.charAt(0).toUpperCase() + h.status.slice(1)}
                        </Pill>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{kiraCh}</td>
                      <td className="px-4 py-3 text-ink-muted">{kiraSub}</td>
                      <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{h.start_at ? fmt(h.start_at) : "-"}</td>
                      <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{h.end_at ? fmt(h.end_at) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hunts.length === 0 && <EmptyState title="No activities." body="This class has no activities yet." />}
        </Card>
      )}

      {/* ===== Tab Teams ===== */}
      {tab === "teams" && (
        <div className="mt-4 grid lg:grid-cols-2 gap-4">
          {/* Senarai kiri */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-hairline text-sm font-semibold text-ink">Teams</div>
            {teams.length === 0 ? (
              <EmptyState title="No teams." body="Teams appear here once an educator creates them." />
            ) : (
              teamsSusun.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPasukanDipilih(t.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-t border-hairline first:border-t-0 text-left transition ${
                    pasukanDipilih === t.id ? "bg-[#F1EEFC]" : "hover:bg-[#F7F7F9]"
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink truncate">{t.name}</span>
                    <span className="block text-xs text-ink-faint">{ahliPasukan[t.id]?.length ?? 0} members</span>
                  </span>
                  <span className="text-sm font-semibold text-brand-purple shrink-0">{Number(t.score) || 0}</span>
                </button>
              ))
            )}
          </Card>

          {/* Panel kanan: butiran pasukan dipilih */}
          <Card className="p-4">
            {pasukanDipilih === null ? (
              <EmptyState title="Select a team." body="Pick a team on the left to see its members." />
            ) : (
              (() => {
                const t = teams.find((x) => x.id === pasukanDipilih);
                if (!t) return <EmptyState title="Team not found." />;
                const senarai = butiranAhli[t.id];
                return (
                  <>
                    <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink truncate">{t.name}</div>
                        <div className="text-xs text-ink-faint">Score {Number(t.score) || 0}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditPasukan({ id: t.id, nama: t.name, lama: t.name })}
                          className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-3 py-1.5 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
                        >
                          <Pencil className="w-4 h-4 text-ink-faint" /> Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => buangPasukan(t)}
                          className="inline-flex items-center gap-1.5 bg-white border border-red-200 rounded-xl px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </div>
                    {senarai === undefined ? (
                      <div className="text-sm text-ink-faint py-4">Loading members...</div>
                    ) : senarai.length === 0 ? (
                      <EmptyState title="No members." />
                    ) : (
                      <div className="space-y-1">
                        {senarai.map((m) => (
                          <div key={m.user_id} className="flex items-center gap-2 text-sm py-1">
                            <span className="text-ink truncate">{m.nama || "Unnamed user"}</span>
                            {m.role === "leader" && <Pill tone="violet">Leader</Pill>}
                          </div>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-ink-faint mt-4">Team changes are recorded in Audit.</p>
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
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-1 p-1 bg-[#F4F4F6] rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setModRanking("teams")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  modRanking === "teams" ? "bg-white shadow text-brand-purple" : "text-ink-muted hover:text-ink"
                }`}
              >
                Teams
              </button>
              <button
                type="button"
                onClick={() => setModRanking("individuals")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                  modRanking === "individuals" ? "bg-white shadow text-brand-purple" : "text-ink-muted hover:text-ink"
                }`}
              >
                Individuals
              </button>
            </div>
            <button
              type="button"
              onClick={exportRanking}
              className="inline-flex items-center gap-1.5 bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink hover:bg-[#F7F7F9]"
            >
              <Download className="w-4 h-4 text-ink-faint" /> Export CSV
            </button>
          </div>

          <Card className="overflow-hidden">
            {modRanking === "teams" ? (
              teamsSusun.length === 0 ? (
                <EmptyState title="No team scores yet." />
              ) : (
                teamsSusun.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-3 border-t border-hairline first:border-t-0"
                  >
                    <span className="w-8 h-8 rounded-full bg-[#EAE6FC] text-brand-purple text-[13px] font-semibold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-ink truncate flex-1">{t.name}</span>
                    <span className="text-sm font-semibold text-brand-purple shrink-0">{Number(t.score) || 0}</span>
                  </div>
                ))
              )
            ) : rankingIndividu.length === 0 ? (
              <EmptyState title="No students ranked yet." />
            ) : (
              rankingIndividu.map((r, i) => (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 px-4 py-3 border-t border-hairline first:border-t-0"
                >
                  <span className="w-8 h-8 rounded-full bg-[#EAE6FC] text-brand-purple text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/admin/users/${r.user_id}`}
                      className="text-sm font-medium text-ink hover:text-brand-purple truncate"
                    >
                      {r.nama}
                    </Link>
                    <span className="block text-xs text-ink-faint">{r.diluluskan} approved answers</span>
                  </span>
                  <span className="text-sm font-semibold text-brand-purple shrink-0">{r.skor}</span>
                </div>
              ))
            )}
          </Card>
          <p className="text-xs text-ink-faint mt-3">
            Team scores come from the live scoring engine. Individual totals are computed from approved answers.
          </p>
        </div>
      )}

      {/* Dialog edit kelas */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl border border-hairline shadow-raised w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-ink">Edit class</h3>
              <button type="button" onClick={() => setEdit(null)} aria-label="Close">
                <X className="w-5 h-5 text-ink-muted" />
              </button>
            </div>
            <label className="text-xs text-ink-faint">Name</label>
            <input
              className="w-full mt-1 mb-3 h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
            <label className="text-xs text-ink-faint">Join code</label>
            <input
              className="w-full mt-1 mb-3 h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink font-mono focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              value={edit.join_code}
              onChange={(e) => setEdit({ ...edit, join_code: e.target.value })}
            />
            <p className="text-xs text-ink-faint mb-3">Class changes are recorded in Audit.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={simpanEdit}
                disabled={edit.name.trim().length === 0}
                className="bg-brand-purple text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog tukar nama pasukan */}
      {editPasukan && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl border border-hairline shadow-raised w-full max-w-md p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-ink">Rename team</h3>
              <button type="button" onClick={() => setEditPasukan(null)} aria-label="Close">
                <X className="w-5 h-5 text-ink-muted" />
              </button>
            </div>
            <input
              className="w-full mb-3 h-10 rounded-xl bg-white border border-hairline px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-purple/30"
              value={editPasukan.nama}
              onChange={(e) => setEditPasukan({ ...editPasukan, nama: e.target.value })}
              aria-label="New team name"
            />
            <p className="text-xs text-ink-faint mb-3">Team changes are recorded in Audit.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditPasukan(null)}
                className="bg-white border border-hairline rounded-xl px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={simpanNamaPasukan}
                disabled={editPasukan.nama.trim().length === 0}
                className="bg-brand-purple text-white rounded-xl px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40"
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
