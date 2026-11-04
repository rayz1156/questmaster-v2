"use client";

// Butiran aktiviti ruang kerja admin (V2-011c), rupa v3 (KZ-024b): PageHead
// varian breadcrumb ("Activities / <tajuk>") dengan tindakan Publish, Archive
// dan Delete; Card butiran aktiviti; Tabs keadaan (Questions & points,
// Submissions); DataTable cabaran dan penghantaran. Logik, data, panggilan RPC
// dan pengesahan TIDAK berubah (KZ-DS-v3 bahagian 5).
//
// Tindakan lama halaman senarai dipindahkan ke sini: tukar status
// (publish/arkib), ubah mata challenge melalui RPC beralasan dan buang
// aktiviti dengan pengesahan menaip tajuk. Togol "Team completions" lama
// turut dipindahkan ke tab Submissions supaya tiada ciri hilang.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Archive, Rocket, Trash2, CheckCircle, Circle, ChevronDown, ChevronRight,
  ClipboardList, Inbox, Map as MapIcon,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { relTime } from "@/components/admin/ui";
import {
  Alert, Badge, Button, Card, CardHead, DataTable, EmptyState,
  Input, PageHead, Tabs, Textarea, type DataColumn,
} from "@/components/ui";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { mesejHad } from "@/lib/pelan";
import {
  adminListAllHunts,
  adminListAllClasses,
  adminListAllChallenges,
  adminListAllSubmissions,
  adminListAllTeams,
  adminListProfiles,
  adminUpdateHunt,
  adminSetChallengePoints,
  deleteHunt,
  listQuestCompletions,
  markTeamCompletion,
  unmarkTeamCompletion,
  logAudit,
  type Profile,
  type Hunt,
  type Challenge,
  type Submission,
  type Team,
} from "@/lib/data";
import { tokenJawapan } from "@/lib/adminRanking";
import type { KelasAdmin } from "@/lib/adminClasses";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { LOKAL, terjemahBilangan } from "@/lib/i18n";

type MukaTab = "questions" | "submissions";

const MATA_MAX = 100000;

function fmt(d: string | null | undefined, bahasa: "en" | "ms") {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString(LOKAL[bahasa]);
  } catch {
    return String(d);
  }
}

/** Jawapan dalam jadual: dipotong, URL sahaja dipaparkan sebagai pautan selamat. */
function JawapanRingkas({ answer, max = 60 }: { answer: string | null | undefined; max?: number }) {
  const penuh = tokenJawapan(answer);
  if (penuh.length === 0) return <span className="text-ink-faint">-</span>;
  // Bina paparan sehingga had aksara; token URL dikira ikut teksnya.
  const tokens: { jenis: "teks" | "url"; nilai: string }[] = [];
  let panjang = 0;
  for (const t of penuh) {
    if (panjang + t.nilai.length > max) {
      const potongan = t.nilai.slice(0, Math.max(0, max - panjang));
      if (potongan.length > 0) tokens.push({ jenis: t.jenis, nilai: potongan });
      panjang = max;
      break;
    }
    tokens.push(t);
    panjang += t.nilai.length;
  }
  const dipotong = panjang >= max;
  return (
    <span>
      {tokens.map((t, i) =>
        t.jenis === "url" ? (
          <a
            key={i}
            href={t.nilai}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-purple hover:opacity-80 underline underline-offset-2 break-all"
          >
            {t.nilai}
          </a>
        ) : (
          <span key={i}>{t.nilai}</span>
        ),
      )}
      {dipotong && <span className="text-ink-faint">...</span>}
    </span>
  );
}

export default function Page({ params }: { params: { id: string } }) {
  const router = useRouter();
  const confirm = useConfirm();
  const { t, bahasa } = useBahasa();
  const { id } = params;

  const [muat, setMuat] = useState(true);
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [kelas, setKelas] = useState<KelasAdmin | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [tab, setTab] = useState<MukaTab>("questions");
  const [mesej, setMesej] = useState<{ baik: boolean; teks: string } | null>(null);

  // Draf mata: challenge_id -> nilai input (rentetan supaya taipan tak melompat).
  const [drafMata, setDrafMata] = useState<Record<string, string>>({});
  const [alasanMata, setAlasanMata] = useState("");
  const [simpanMata, setSimpanMata] = useState(false);
  const [laporanMata, setLaporanMata] = useState<{ title: string; ok: boolean; teks?: string }[] | null>(null);

  const [zonBahaya, setZonBahaya] = useState(false);
  const [pengesahanHapus, setPengesahanHapus] = useState("");

  // Togol team completions (ciri lama halaman senarai).
  const [completions, setCompletions] = useState<Team[] | null>(null);
  const [senaraiCompletions, setSenaraiCompletions] = useState<string[]>([]);
  const [toggling, setToggling] = useState("");

  const reload = useCallback(async () => {
    try {
      const [semuaHunt, semuaKelas, profs, semuaCh, semuaSub] = await Promise.all([
        adminListAllHunts(),
        adminListAllClasses(),
        adminListProfiles(),
        adminListAllChallenges(),
        adminListAllSubmissions(),
      ]);
      const h = semuaHunt.find((x) => x.id === id) || null;
      setHunt(h);
      setKelas((semuaKelas || []).find((k) => k.id === h?.class_id) || null);
      setProfiles(profs);
      const ch = semuaCh.filter((c) => c.hunt_id === id);
      ch.sort((a, b) => (a.order_idx || 0) - (b.order_idx || 0));
      setChallenges(ch);
      const idCh = new Set(ch.map((c) => c.id));
      setSubs(semuaSub.filter((s) => idCh.has(s.challenge_id)));
      // Draf mata bermula daripada nilai sebenar.
      const draf: Record<string, string> = {};
      for (const c of ch) draf[c.id] = String(Number(c.points) || 0);
      setDrafMata(draf);
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.huntDetail.loadFailed")) });
    } finally {
      setMuat(false);
    }
  }, [id, t]);

  useEffect(() => {
    reload();
  }, [reload]);

  const namaProfil = (uid: string | null | undefined) => {
    if (!uid) return t("admin.unnamedUser");
    const p = profiles.find((u) => u.id === uid);
    return p?.display_name || t("admin.unnamedUser");
  };

  // ===== Questions & points =====
  const perubahanMata = useMemo(() => {
    const senarai: { id: string; title: string; sebelum: number; selepas: number }[] = [];
    for (const c of challenges) {
      const draf = drafMata[c.id];
      if (draf === undefined) continue;
      const selepas = Number(draf);
      if (Number.isNaN(selepas)) continue;
      if (selepas !== (Number(c.points) || 0)) {
        senarai.push({ id: c.id, title: c.title, sebelum: Number(c.points) || 0, selepas });
      }
    }
    return senarai;
  }, [challenges, drafMata]);

  const jumlahSebelum = useMemo(
    () => challenges.reduce((n, c) => n + (Number(c.points) || 0), 0),
    [challenges],
  );
  const jumlahSelepas = useMemo(
    () =>
      challenges.reduce((n, c) => {
        const draf = Number(drafMata[c.id]);
        return n + (Number.isNaN(draf) ? Number(c.points) || 0 : draf);
      }, 0),
    [challenges, drafMata],
  );

  // Draf di luar had 0 hingga 100000 atau bukan integer menyekat simpanan;
  // RPC 0047 juga menolak nilai sebegini di pelayan (invalid_points).
  const mataTakSah = useMemo(() => {
    const senarai: string[] = [];
    for (const c of challenges) {
      const draf = drafMata[c.id];
      if (draf === undefined) continue;
      const v = draf.trim() === "" ? NaN : Number(draf);
      if (Number.isNaN(v) || !Number.isInteger(v) || v < 0 || v > MATA_MAX) senarai.push(c.title);
    }
    return senarai;
  }, [challenges, drafMata]);

  const alasanBersih = alasanMata.trim();
  const alasanSah = alasanBersih.length >= 5 && alasanBersih.length <= 500;
  const bolehSimpan = perubahanMata.length > 0 && mataTakSah.length === 0 && alasanSah && !simpanMata;

  /** Simpan setiap perubahan mata secara berjujukan; lapor kejayaan/ralat setiap satu. */
  const simpanMataBtn = async () => {
    if (!bolehSimpan) return;
    setSimpanMata(true);
    setLaporanMata(null);
    const laporan: { title: string; ok: boolean; teks?: string }[] = [];
    for (const p of perubahanMata) {
      try {
        await adminSetChallengePoints(p.id, p.selepas, alasanBersih);
        laporan.push({ title: p.title, ok: true });
      } catch (e) {
        laporan.push({ title: p.title, ok: false, teks: mesejHad(e, t("admin.huntDetail.reportFailed")) });
      }
    }
    setLaporanMata(laporan);
    setSimpanMata(false);
    if (laporan.every((l) => l.ok)) {
      setMesej({
        baik: true,
        teks: terjemahBilangan(bahasa, "admin.huntDetail.savedOne", "admin.huntDetail.savedOther", laporan.length, {
          n: laporan.length,
        }),
      });
      setAlasanMata("");
      reload();
    } else {
      const gagal = laporan.filter((l) => !l.ok).length;
      setMesej({
        baik: false,
        teks: terjemahBilangan(
          bahasa,
          "admin.huntDetail.changesFailedOne",
          "admin.huntDetail.changesFailedOther",
          gagal,
          { n: gagal },
        ),
      });
      reload();
    }
  };

  // ===== Tindakan status dan buang (fungsi lama halaman senarai) =====
  const tukarStatus = async (status: "draft" | "active" | "archived") => {
    if (!hunt || hunt.status === status) return;
    const ok = await confirm({
      title:
        status === "active"
          ? t("admin.huntDetail.publishConfirm", { tajuk: hunt.title })
          : t("admin.huntDetail.archiveConfirm", { tajuk: hunt.title }),
      tone: status === "archived" ? "danger" : "default",
    });
    if (!ok) return;
    try {
      await adminUpdateHunt(id, { status });
      await logAudit("hunt_status", "hunt", id, { status });
      setMesej({
        baik: true,
        teks: status === "active" ? t("admin.huntDetail.publishedMsg") : t("admin.huntDetail.archivedMsg"),
      });
      reload();
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.huntDetail.updateFailed")) });
      reload();
    }
  };

  /** Buang aktiviti: pengesahan menaip tajuk dengan tepat. */
  const hapus = async () => {
    if (!hunt) return;
    try {
      await deleteHunt(id);
      await logAudit("hunt_delete", "hunt", id, { title: hunt.title });
      router.push("/admin/hunts");
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.huntDetail.deleteFailed")) });
      reload();
    }
  };

  // ===== Team completions (ciri lama) =====
  const bukaCompletions = async () => {
    if (completions !== null) {
      setCompletions(null);
      return;
    }
    try {
      const [teams, done] = await Promise.all([
        adminListAllTeams(),
        listQuestCompletions(id),
      ]);
      setCompletions(teams);
      setSenaraiCompletions(done.map((d) => d.team_id));
    } catch {
      setCompletions([]);
      setSenaraiCompletions([]);
    }
  };

  const togolCompletion = async (teamId: string, sudah: boolean) => {
    setToggling(teamId);
    try {
      if (sudah) await unmarkTeamCompletion(id, teamId);
      else await markTeamCompletion(id, teamId);
      const done = await listQuestCompletions(id);
      setSenaraiCompletions(done.map((d) => d.team_id));
    } catch (e) {
      setMesej({ baik: false, teks: mesejHad(e, t("admin.huntDetail.completionFailed")) });
    } finally {
      setToggling("");
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

  if (!hunt) {
    return (
      <AdminShell>
        <PageHead crumb={t("admin.hunts.title")} name={t("admin.huntDetail.notFound")} />
        <Card>
          <EmptyState
            icon={<MapIcon className="w-6 h-6" />}
            title={t("admin.huntDetail.notFoundTitle")}
            text={t("admin.huntDetail.notFoundText")}
            actionLabel={t("common.backToActivities")}
            href="/admin/hunts"
          />
        </Card>
      </AdminShell>
    );
  }

  const namaTajuk = hunt.title;

  // Lencana status aktiviti (sama seperti lajur Status senarai Activities, KZ-024).
  const kapitalStatus = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  // Label status aktiviti mengikut kamus (nilai DB kekal dalam data).
  const labelStatusHunt =
    hunt.status === "active"
      ? t("admin.huntDetail.statusActive")
      : hunt.status === "draft"
        ? t("admin.huntDetail.statusDraft")
        : hunt.status === "archived"
          ? t("admin.huntDetail.statusArchived")
          : kapitalStatus(hunt.status);
  const lencanaStatus =
    hunt.status === "active" ? (
      <Badge variant="dot" warna="green">
        {labelStatusHunt}
      </Badge>
    ) : hunt.status === "draft" ? (
      <Badge variant="dim" warna="yellow">
        {labelStatusHunt}
      </Badge>
    ) : (
      <Badge variant="dim" warna="gray">
        {labelStatusHunt}
      </Badge>
    );

  // Lajur DataTable cabaran: nombor, tajuk dan input mata draf
  // (logik draf dan had sama seperti jadual lama).
  const lajurCabaran: DataColumn<Challenge>[] = [
    {
      key: "no",
      header: "#",
      render: (_c, i) => <span className="text-[13px] text-ink-faint">{i + 1}</span>,
    },
    {
      key: "tajuk",
      header: t("admin.huntDetail.colTitle"),
      render: (c) => <span className="text-[13px] font-bold text-ink">{c.title}</span>,
    },
    {
      key: "mata",
      header: t("admin.huntDetail.colPoints"),
      render: (c) => (
        <Input
          type="number"
          min={0}
          max={MATA_MAX}
          value={drafMata[c.id] ?? String(Number(c.points) || 0)}
          onChange={(e) => setDrafMata({ ...drafMata, [c.id]: e.target.value })}
          aria-label={t("admin.huntDetail.pointsAria", { tajuk: c.title })}
          className="w-24"
        />
      ),
    },
  ];

  // Label status penghantaran mengikut kamus (nilai DB kekal dalam data).
  const labelStatusSub = (s: string) =>
    s === "approved"
      ? t("admin.huntDetail.statusApproved")
      : s === "rejected"
        ? t("admin.huntDetail.statusRejected")
        : t("admin.huntDetail.statusPending");

  // Lajur DataTable penghantaran; jawapan dipotong, URL sebagai pautan selamat.
  const lajurSub: DataColumn<Submission>[] = [
    {
      key: "peserta",
      header: t("admin.huntDetail.colStudent"),
      render: (s) => (
        <span className="block truncate max-w-[160px] text-[13px] font-bold text-ink">
          {namaProfil(s.user_id)}
        </span>
      ),
    },
    {
      key: "cabaran",
      header: t("admin.huntDetail.colChallenge"),
      hideOnMobile: true,
      render: (s) => (
        <span className="block truncate max-w-[160px] text-[13px] text-ink-faint">
          {challenges.find((c) => c.id === s.challenge_id)?.title || "-"}
        </span>
      ),
    },
    {
      key: "jawapan",
      header: t("admin.huntDetail.colAnswer"),
      render: (s) => (
        <span className="block max-w-[260px] text-[13px] text-ink-faint">
          <JawapanRingkas answer={s.answer} />
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.huntDetail.colStatus"),
      render: (s) =>
        s.status === "approved" ? (
          <Badge variant="dot" warna="green">
            {labelStatusSub(s.status)}
          </Badge>
        ) : s.status === "rejected" ? (
          <Badge variant="dim" warna="red">
            {labelStatusSub(s.status)}
          </Badge>
        ) : (
          <Badge variant="dim" warna="yellow">
            {labelStatusSub(s.status)}
          </Badge>
        ),
    },
    {
      key: "hantar",
      header: t("admin.huntDetail.colSubmitted"),
      hideOnMobile: true,
      render: (s) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">{relTime(s.created_at, undefined, bahasa)}</span>
      ),
    },
    {
      key: "ulas",
      header: "",
      render: (s) => (
        <Link
          href={`/admin/moderation?id=${s.id}`}
          className="text-[13px] font-bold text-brand-purple hover:opacity-80"
        >
          {t("admin.huntDetail.review")}
        </Link>
      ),
    },
  ];

  return (
    <AdminShell>
      <PageHead
        crumb={t("admin.hunts.title")}
        name={namaTajuk}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {hunt.class_id && (
              <Link
                href={`/admin/classes/${hunt.class_id}`}
                className="font-bold text-brand-purple hover:opacity-80"
              >
                {kelas?.name || t("admin.hunts.unnamedClass")}
              </Link>
            )}
            <span>{t("admin.huntDetail.by")} {namaProfil(hunt.owner_id)}</span>
            {lencanaStatus}
            <span>
              {t("admin.huntDetail.startLabel")} {fmt(hunt.start_at, bahasa)} · {t("admin.huntDetail.endLabel")} {fmt(hunt.end_at, bahasa)}
            </span>
          </span>
        }
        primaryAction={
          hunt.status !== "active"
            ? {
                label: t("admin.huntDetail.publish"),
                icon: <Rocket className="w-4 h-4" />,
                onSelect: () => tukarStatus("active"),
              }
            : undefined
        }
        secondaryActions={[
          ...(hunt.status !== "archived"
            ? [
                {
                  label: t("admin.huntDetail.archive"),
                  icon: <Archive className="w-4 h-4" />,
                  onSelect: () => tukarStatus("archived"),
                },
              ]
            : []),
          {
            label: t("admin.delete"),
            icon: <Trash2 className="w-4 h-4" />,
            onSelect: () => setZonBahaya(true),
          },
        ]}
      />

      {/* Zon bahaya buang aktiviti: pengesahan menaip tajuk, sama seperti lama. */}
      {zonBahaya && (
        <Card className="mb-6 border border-red-200">
          <CardHead title={t("admin.dangerZone")} />
          <p className="text-[14px] text-ink-muted mt-4 mb-4">
            {t("admin.huntDetail.dangerDesc")}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="w-64">
              <Input
                placeholder={namaTajuk}
                value={pengesahanHapus}
                onChange={(e) => setPengesahanHapus(e.target.value)}
                aria-label={t("admin.huntDetail.typeTitleAria")}
                ralat={pengesahanHapus !== "" && pengesahanHapus !== namaTajuk}
              />
            </span>
            <Button
              warna="red"
              disabled={pengesahanHapus !== namaTajuk}
              onClick={hapus}
            >
              <Trash2 className="w-4 h-4" /> {t("admin.huntDetail.deleteActivity")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setZonBahaya(false);
                setPengesahanHapus("");
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </Card>
      )}

      <Tabs
        items={[
          {
            label: t("admin.huntDetail.tabQuestions"),
            onSelect: () => setTab("questions"),
            aktif: tab === "questions",
          },
          {
            label: t("admin.huntDetail.tabSubmissions"),
            onSelect: () => setTab("submissions"),
            aktif: tab === "submissions",
          },
        ]}
      />

      {mesej && (
        <div className="mt-4">
          <Alert tone={mesej.baik ? "success" : "danger"}>{mesej.teks}</Alert>
        </div>
      )}

      {/* ===== Tab Questions & points ===== */}
      {tab === "questions" && (
        <div className="mt-4 grid lg:grid-cols-3 gap-4 items-start">
          {/* Jadual cabaran; baris yang ada draf berubah disorot (rowClassName). */}
          <DataTable
            className="lg:col-span-2"
            label={t("admin.huntDetail.questionsTable")}
            columns={lajurCabaran}
            rows={challenges}
            rowKey={(c) => c.id}
            rowClassName={(c) =>
              perubahanMata.some((p) => p.id === c.id) ? "bg-[#F1EEFC]" : ""
            }
            empty={
              <EmptyState
                icon={<ClipboardList className="w-6 h-6" />}
                title={t("admin.huntDetail.noQuestions")}
                text={t("admin.huntDetail.noQuestionsText")}
              />
            }
          />

          {/* Panel kanan melekat: semak perubahan (logik dan had sama seperti lama) */}
          <Card className="lg:sticky lg:top-20">
            <CardHead title={t("admin.huntDetail.reviewChanges")} />
            {perubahanMata.length === 0 ? (
              <p className="text-[14px] text-ink-faint mt-4">
                {t("admin.huntDetail.noChanges")}
              </p>
            ) : (
              <div className="mt-4 space-y-1 mb-4">
                {perubahanMata.map((p) => (
                  <div key={p.id} className="text-[14px] text-ink">
                    <span className="font-bold truncate">{p.title}:</span>{" "}
                    <span className="text-ink-muted">{p.sebelum} {t("admin.huntDetail.toWord")} {p.selepas}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between text-[12px] text-ink-muted border-t border-hairline pt-3 mb-3">
              <span>{t("admin.huntDetail.totalBefore")} <span className="font-semibold text-ink">{jumlahSebelum}</span></span>
              <span>{t("admin.huntDetail.totalAfter")} <span className="font-semibold text-brand-purple">{jumlahSelepas}</span></span>
            </div>
            {mataTakSah.length > 0 && (
              <p className="text-[12px] text-kz-down mb-3">
                {t("admin.huntDetail.pointsRange", { had: MATA_MAX, senarai: mataTakSah.join(", ") })}
              </p>
            )}
            <Textarea
              rows={4}
              maxLength={500}
              value={alasanMata}
              onChange={(e) => setAlasanMata(e.target.value)}
              placeholder={t("admin.huntDetail.reasonPlaceholder")}
              aria-label={t("admin.huntDetail.reasonAria")}
            />
            <div className="flex items-center justify-between mt-1.5 mb-3">
              <span className="text-[12px] text-ink-faint">{alasanBersih.length}/500</span>
              <span className="text-[12px] text-ink-faint">{t("admin.huntDetail.auditNote")}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={simpanMataBtn} disabled={!bolehSimpan} className="flex-1">
                {simpanMata ? t("admin.huntDetail.saving") : t("admin.huntDetail.saveChanges")}
              </Button>
              <Button
                variant="outline"
                disabled={perubahanMata.length === 0 && alasanMata.length === 0}
                onClick={() => {
                  const draf: Record<string, string> = {};
                  for (const c of challenges) draf[c.id] = String(Number(c.points) || 0);
                  setDrafMata(draf);
                  setAlasanMata("");
                  setLaporanMata(null);
                }}
              >
                {t("admin.huntDetail.discard")}
              </Button>
            </div>
            {laporanMata && (
              <div className="mt-3 space-y-1 border-t border-hairline pt-3">
                {laporanMata.map((l) => (
                  <div key={l.title} className={`text-[12px] ${l.ok ? "text-green-700" : "text-kz-down"}`}>
                    {l.ok ? t("admin.huntDetail.reportSaved") : t("admin.huntDetail.reportFailed")}: {l.title}
                    {!l.ok && l.teks ? ` (${l.teks})` : ""}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ===== Tab Submissions ===== */}
      {tab === "submissions" && (
        <div className="mt-4 space-y-4">
          <DataTable
            label={t("admin.huntDetail.subsTable")}
            columns={lajurSub}
            rows={subs}
            rowKey={(s) => s.id}
            empty={
              <EmptyState
                icon={<Inbox className="w-6 h-6" />}
                title={t("admin.huntDetail.noSubs")}
                text={t("admin.huntDetail.noSubsText")}
              />
            }
          />

          {/* Kad togol team completions, dipindahkan daripada halaman lama */}
          <Card padat>
            <button
              type="button"
              onClick={bukaCompletions}
              className="w-full flex items-center gap-2 px-6 py-4 text-[14px] font-bold text-ink hover:bg-[#f8f9fc] transition"
            >
              {completions === null ? (
                <ChevronRight className="w-4 h-4 text-ink-faint" />
              ) : (
                <ChevronDown className="w-4 h-4 text-ink-faint" />
              )}
              {t("admin.huntDetail.teamCompletions")}
            </button>
            {completions !== null && (
              <div className="px-6 pb-4 pt-1 space-y-1 border-t border-kz-line">
                {completions.length === 0 ? (
                  <p className="text-[12px] text-ink-faint">{t("admin.huntDetail.noTeams")}</p>
                ) : (
                  completions.map((pas) => {
                    const sudah = senaraiCompletions.includes(pas.id);
                    return (
                      <button
                        key={pas.id}
                        type="button"
                        onClick={() => togolCompletion(pas.id, sudah)}
                        disabled={toggling === pas.id}
                        className={`w-full flex items-center gap-2 p-2 rounded-[4px] text-left transition ${
                          sudah ? "bg-green-50" : "bg-[#f8f9fc] hover:bg-[#eff1f5]"
                        }`}
                      >
                        {toggling === pas.id ? (
                          <span className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-brand-purple animate-spin" />
                        ) : sudah ? (
                          <CheckCircle className="w-4 h-4 text-green-600" />
                        ) : (
                          <Circle className="w-4 h-4 text-ink-faint" />
                        )}
                        <span className={`text-[13px] truncate ${sudah ? "text-green-700 font-bold" : "text-ink-muted"}`}>
                          {pas.name}
                        </span>
                        {sudah && <span className="text-[12px] text-green-600 ml-auto">{t("admin.huntDetail.complete")}</span>}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
