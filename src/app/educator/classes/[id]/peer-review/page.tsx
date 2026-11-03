"use client";

/**
 * Peer review (pendidik): pusingan penilaian rakan sebaya, Fasa 1.
 *
 * Dua bahagian: senarai pusingan (cipta, sunting, kira) dan keputusan
 * (papan pemuka berkod warna dengan penapis). Unit penilaian ialah
 * PUSINGAN, milik kelas; bukan aktiviti. Rujukan: docs/SPEC-penilaian-rakan.md.
 *
 * Kerahsiaan dikekalkan di pelayan: identiti penilai tidak pernah dihantar
 * ke pelayar, jadi justifikasi dipaparkan tanpa nama penilai.
 *
 * KZ-022b: rupa v3 dengan kit (Card, CardHead, Field, Input, Alert, Badge,
 * Button, DataTable, EmptyState; kepala halaman dibekalkan ClassShell).
 * Logik, data, panggilan API dan pengendali klik tidak berubah.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { getClass, type Klass } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { peerApi } from "@/lib/peer-client";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { LOKAL, type Bahasa } from "@/lib/i18n";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  Field,
  Input,
  type DataColumn,
} from "@/components/ui";

type Pusingan = {
  id: string;
  class_id: string;
  name: string;
  kind: string;
  week: number | null;
  opens_at: string;
  closes_at: string;
  computed_at: string | null;
};

type BarisKeputusan = {
  user_id: string;
  name: string;
  team_id: string;
  team_name: string;
  t_total: number;
  r_count: number;
  valid: boolean;
  p: number | null;
  pbar: number | null;
  f: number | null;
  f_mod: number;
  flag: string | null;
  needs_review: boolean;
  team_at_risk: boolean;
};

type Justifikasi = {
  ratee_id: string;
  ratee_name: string;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
  justification: string | null;
};

type Keputusan = {
  round: Pusingan;
  results: BarisKeputusan[];
  justifications: Justifikasi[];
  not_submitted: { user_id: string; name: string; team_id: string; team_name: string }[];
};

type Penapis = "semua" | "merah" | "semak" | "risiko" | "belum";

/** Kumpulan seperti yang dipulangkan oleh pertanyaan qm_teams dengan ahli. */
type PasukanRingkas = {
  id: string;
  name: string | null;
  qm_team_members?: { user_id: string }[];
};

/** Cadangan templat Fasa 1: tiga pusingan formatif (sumatif datang kemudian). */
const TEMPLAT_MINGGU = [4, 6, 9];

function statusPusingan(p: Pusingan): "akan" | "terbuka" | "tertutup" | "dikira" {
  if (p.computed_at) return "dikira";
  const now = Date.now();
  if (now < Date.parse(p.opens_at)) return "akan";
  if (now <= Date.parse(p.closes_at)) return "terbuka";
  return "tertutup";
}

// Format tarikh pusingan ikut bahasa semasa (en-GB / ms-MY).
function formatTarikh(iso: string, bahasa: Bahasa): string {
  try {
    return new Date(iso).toLocaleDateString(LOKAL[bahasa], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

/** Mesej ralat selamat daripada nilai balingan `unknown`. */
function mesejRalat(e: unknown, zonkal: string): string {
  return e instanceof Error && e.message ? e.message : zonkal;
}

export default function PeerReviewPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const confirm = useConfirm();
  const { t, bahasa } = useBahasa();

  const [klass, setKlass] = useState<Klass | null>(null);
  const [rounds, setRounds] = useState<Pusingan[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  // Bahagian pusingan: borang cipta dan templat.
  const [borangTerbuka, setBorangTerbuka] = useState(false);
  const [nama, setNama] = useState("");
  const [minggu, setMinggu] = useState("");
  const [dibuka, setDibuka] = useState("");
  const [ditutup, setDitutup] = useState("");
  const [mulaSemester, setMulaSemester] = useState("");
  const [amaranSatuSudah, setAmaranSatuSudah] = useState(false);

  // Kumpulan dua orang (amaran sahaja, bukan sekatan).
  const [kumpulanDua, setKumpulanDua] = useState<string[]>([]);

  // Bahagian keputusan.
  const [pusinganDipilih, setPusinganDipilih] = useState<string>("");
  const [keputusan, setKeputusan] = useState<Keputusan | null>(null);
  const [penapis, setPenapis] = useState<Penapis>("semua");
  const [barisTerbuka, setBarisTerbuka] = useState<string | null>(null);
  const [kiraBusy, setKiraBusy] = useState(false);
  // Versi memaksa keputusan dimuat semula selepas pengiraan.
  const [versiKeputusan, setVersiKeputusan] = useState(0);

  const muatPusingan = useCallback(async () => {
    try {
      const res = await peerApi(`/api/classes/${classId}/peer-rounds`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('educator.peerReview.loadRoundsFailed'));
      setRounds(json.rounds ?? []);
    } catch (e: unknown) {
      setMsg(mesejRalat(e, t('educator.peerReview.loadRoundsFailed')));
    }
  }, [classId, t]);

  useEffect(() => {
    (async () => {
      setKlass(await getClass(classId));
      await muatPusingan();
      // Kumpulan dua orang: kumpulan peringkat kelas dengan tepat dua ahli.
      try {
        const { data: teams } = await supabase
          .from("qm_teams")
          .select("id, name, qm_team_members(user_id)")
          .eq("class_id", classId)
          .is("hunt_id", null);
        const senarai = (teams ?? []) as unknown as PasukanRingkas[];
        setKumpulanDua(
          senarai
            .filter((t) => (t.qm_team_members ?? []).length === 2)
            .map((t) => t.name ?? "")
            .filter((n) => n !== ""),
        );
      } catch {
        setKumpulanDua([]);
      }
      setLoading(false);
    })();
  }, [classId, muatPusingan]);

  // Muat keputusan bagi pusingan yang dipilih.
  useEffect(() => {
    if (!pusinganDipilih) {
      setKeputusan(null);
      return;
    }
    (async () => {
      try {
        const res = await peerApi(`/api/classes/${classId}/peer-rounds/${pusinganDipilih}/results`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || t('educator.peerReview.loadResultsFailed'));
        setKeputusan(json);
      } catch (e: unknown) {
        setMsg(mesejRalat(e, t('educator.peerReview.loadResultsFailed')));
        setKeputusan(null);
      }
    })();
  }, [classId, pusinganDipilih, versiKeputusan]);

  // Pusingan lalai bagi bahagian keputusan: yang terkini sudah dikira.
  useEffect(() => {
    if (pusinganDipilih || rounds.length === 0) return;
    const dikira = rounds.filter((r) => r.computed_at);
    if (dikira.length > 0) setPusinganDipilih(dikira[dikira.length - 1].id);
  }, [rounds, pusinganDipilih]);

  /** Tarikh dibuka/tutup daripada minggu dan tarikh mula semester. */
  function tarikhTemplat(week: number): { opens: string; closes: string } {
    const mula = mulaSemester ? new Date(mulaSemester + "T00:00:00") : new Date();
    const opens = new Date(mula);
    opens.setDate(opens.getDate() + (week - 1) * 7);
    const closes = new Date(opens);
    closes.setDate(closes.getDate() + 7);
    return { opens: opens.toISOString(), closes: closes.toISOString() };
  }

  /** Cipta satu pusingan; pulangkan true jika berjaya. */
  async function ciptaPusingan(p: { name: string; week: number | null; opens: string; closes: string }): Promise<boolean> {
    const res = await peerApi(`/api/classes/${classId}/peer-rounds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: p.name, week: p.week, opens_at: p.opens, closes_at: p.closes }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || t('educator.peerReview.createFailed'));
    await muatPusingan();
    return true;
  }

  async function simpanBorang() {
    setMsg(null);
    try {
      if (!nama.trim() || !dibuka || !ditutup) {
        setMsg(t('educator.peerReview.nameAndDatesRequired'));
        return;
      }
      const sebelum = rounds.length;
      await ciptaPusingan(
        { name: nama.trim(), week: minggu ? parseInt(minggu, 10) : null, opens: new Date(dibuka).toISOString(), closes: new Date(ditutup).toISOString() },
      );
      // Amaran satu pusingan: tunjuk sekali sahaja, bila kelas kini hanya
      // ada SATU pusingan. Jangan ulang pada simpanan berikutnya.
      if (sebelum === 0) setAmaranSatuSudah(true);
      setBorangTerbuka(false);
      setNama(""); setMinggu(""); setDibuka(""); setDitutup("");
      setMsg(t('educator.peerReview.roundCreated'));
    } catch (e: unknown) {
      setMsg(mesejRalat(e, t('educator.peerReview.createFailed')));
    }
  }

  async function ciptaTemplat() {
    setMsg(null);
    try {
      for (const week of TEMPLAT_MINGGU) {
        // Pembolehubah dinamakan `tarikh` supaya tidak berlanggar dengan fungsi t().
        const tarikh = tarikhTemplat(week);
        await ciptaPusingan({ name: t('educator.peerReview.roundNameTemplate', { minggu: week }), week, opens: tarikh.opens, closes: tarikh.closes });
      }
      // Tiga pusingan dicipta, jadi amaran satu pusingan tidak relevan.
      setAmaranSatuSudah(false);
      setMsg(t('educator.peerReview.templateCreated'));
    } catch (e: unknown) {
      setMsg(mesejRalat(e, t('educator.peerReview.templateFailed')));
    }
  }

  async function kira(roundId: string) {
    setMsg(null);
    setKiraBusy(true);
    try {
      const res = await peerApi(`/api/classes/${classId}/peer-rounds/${roundId}/compute`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('educator.peerReview.computeFailed'));
      await muatPusingan();
      setVersiKeputusan((v) => v + 1);
      setMsg(t('educator.peerReview.resultsComputed', { n: json.written ?? 0 }));
    } catch (e: unknown) {
      setMsg(mesejRalat(e, t('educator.peerReview.computeFailed')));
    } finally {
      setKiraBusy(false);
    }
  }

  async function padamPusingan(p: Pusingan) {
    const ok = await confirm({
      title: t('educator.peerReview.deleteConfirmTitle'),
      description: t('educator.peerReview.deleteConfirmDesc', { nama: p.name }),
      confirmLabel: t('educator.peerReview.deleteLabel'),
      tone: "danger",
    });
    if (!ok) return;
    setMsg(null);
    try {
      const res = await peerApi(`/api/classes/${classId}/peer-rounds/${p.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || t('educator.peerReview.deleteFailed'));
      if (pusinganDipilih === p.id) setPusinganDipilih("");
      await muatPusingan();
      setMsg(t('educator.peerReview.roundDeleted'));
    } catch (e: unknown) {
      setMsg(mesejRalat(e, t('educator.peerReview.deleteFailed')));
    }
  }

  const belumLabel: Record<Penapis, string> = {
    semua: t('educator.peerReview.filterAll'),
    merah: t('educator.peerReview.filterRed'),
    semak: t('educator.peerReview.filterReview'),
    risiko: t('educator.peerReview.filterAtRisk'),
    belum: t('educator.peerReview.filterNotSubmitted'),
  };

  const barisDitapis = useMemo(() => {
    if (!keputusan) return [];
    const semua = [...keputusan.results].sort(
      (a, b) => (a.team_name || "").localeCompare(b.team_name || "") || (a.name || "").localeCompare(b.name || ""),
    );
    switch (penapis) {
      case "merah":
        return semua.filter((b) => b.flag === "MERAH");
      case "semak":
        return semua.filter((b) => b.needs_review);
      case "risiko":
        return semua.filter((b) => b.team_at_risk);
      case "belum":
        return semua.filter((b) => b.r_count === 0);
      default:
        return semua;
    }
  }, [keputusan, penapis]);

  const justifikasiMengikut = useMemo(() => {
    const m = new Map<string, Justifikasi[]>();
    for (const j of keputusan?.justifications ?? []) {
      m.set(j.ratee_id, [...(m.get(j.ratee_id) ?? []), j]);
    }
    return m;
  }, [keputusan]);

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <div className="p-10 text-[14px] text-ink-muted">{t('educator.peerReview.loading')}</div>
      </Shell>
    );
  }
  if (!klass) {
    return (
      <Shell tabs={EDU_TABS}>
        <div className="p-10 text-[14px] text-ink-muted">{t('educator.peerReview.classNotFound')}</div>
      </Shell>
    );
  }

  // Titik warna bendera pada lajur pelajar (palet pejal KZ-DS-v3).
  const titikBendera: Record<string, string> = {
    MERAH: "#e85347",
    KUNING: "#f4bd0e",
    HIJAU: "#1ee0ac",
  };

  // Lajur jadual keputusan (DataTable kit). Klik baris membuka justifikasi
  // yang diterima (tindakan sedia ada).
  const lajurKeputusan: DataColumn<BarisKeputusan>[] = [
    {
      key: "pelajar",
      header: t('common.student'),
      render: (b) => (
        <span className="flex items-center gap-2 min-w-0">
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: b.flag ? (titikBendera[b.flag] ?? "#dbdfea") : "#dbdfea" }}
          />
          <span className="text-[13px] font-medium text-ink truncate">{b.name || t('common.student')}</span>
          {b.team_at_risk && (
            <Badge variant="dim" warna="red">{t('educator.peerReview.atRisk')}</Badge>
          )}
        </span>
      ),
    },
    {
      key: "kumpulan",
      header: t('educator.peerReview.colGroup'),
      render: (b) => <span className="text-[13px] text-ink-muted">{b.team_name}</span>,
    },
    {
      key: "p",
      header: "P",
      className: "text-right",
      hideOnMobile: true,
      render: (b) => (
        <span className="text-[13px] text-ink-muted tabular-nums">{b.p === null ? "-" : (Math.round(b.p * 10000) / 10000).toFixed(4)}</span>
      ),
    },
    {
      key: "f",
      header: "F",
      className: "text-right",
      hideOnMobile: true,
      render: (b) => (
        <span className="text-[13px] text-ink-muted tabular-nums">{b.f === null ? "-" : (Math.round(b.f * 10000) / 10000).toFixed(4)}</span>
      ),
    },
    {
      key: "fmod",
      header: "Fmod",
      className: "text-right",
      hideOnMobile: true,
      render: (b) => (
        <span className="text-[13px] text-ink-muted tabular-nums">{(Math.round(b.f_mod * 10000) / 10000).toFixed(4)}</span>
      ),
    },
    {
      key: "bendera",
      header: t('educator.peerReview.colFlag'),
      render: (b) => (
        <span className="text-[12px] font-medium" style={{ color: b.flag ? (titikBendera[b.flag] ?? "#8094ae") : "#8094ae" }}>
          {b.flag ?? "-"}
        </span>
      ),
    },
    {
      key: "semak",
      header: t('educator.peerReview.colReview'),
      render: (b) => (
        b.needs_review
          ? <span className="text-[12px] font-bold text-kz-down">{t('educator.peerReview.yes')}</span>
          : <span className="text-[13px] text-ink-faint">-</span>
      ),
    },
  ];

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={klass.id} current="peer-review" klass={klass}>
        {msg && (
          <Alert tone="info" className="mb-4">{msg}</Alert>
        )}

        {borangTerbuka && (
          <Card className="mb-4">
            <CardHead
              title={t('educator.peerReview.createTitle')}
              right={
                <Button variant="icon" ariaLabel={t('educator.peerReview.closeForm')} onClick={() => setBorangTerbuka(false)}>
                  <X className="w-4 h-4" />
                </Button>
              }
            />
            {rounds.length === 0 && (
              <Alert tone="info" className="my-4">
                <div className="font-bold text-ink mb-1">{t('educator.peerReview.suggestedTitle')}</div>
                <p className="mb-3">{t('educator.peerReview.suggestedText')}</p>
                <p className="text-[14px] font-medium text-[#344357] mb-2">{t('educator.peerReview.semesterStart')}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="date"
                    value={mulaSemester}
                    onChange={(e) => setMulaSemester(e.target.value)}
                    className="max-w-[200px]"
                    aria-label={t('educator.peerReview.semesterStart')}
                  />
                  <Button size="sm" disabled={!mulaSemester} onClick={ciptaTemplat}>
                    {t('educator.peerReview.createAllThree')}
                  </Button>
                  <span className="text-[12px] text-ink-faint">
                    {t('educator.peerReview.templateNote')}
                  </span>
                </div>
              </Alert>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <Field label={t('educator.peerReview.nameLabel')} htmlFor="pusingan-nama">
                <Input id="pusingan-nama" value={nama} onChange={(e) => setNama(e.target.value)} placeholder={t('educator.peerReview.roundNameTemplate', { minggu: 4 })} />
              </Field>
              <Field label={t('educator.peerReview.weekLabel')} htmlFor="pusingan-minggu">
                <Input id="pusingan-minggu" type="number" min={1} max={52} value={minggu} onChange={(e) => setMinggu(e.target.value)} />
              </Field>
              <Field label={t('educator.peerReview.opensLabel')} htmlFor="pusingan-dibuka">
                <Input id="pusingan-dibuka" type="datetime-local" value={dibuka} onChange={(e) => setDibuka(e.target.value)} />
              </Field>
              <Field label={t('educator.peerReview.closesLabel')} htmlFor="pusingan-ditutup">
                <Input id="pusingan-ditutup" type="datetime-local" value={ditutup} onChange={(e) => setDitutup(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <Button onClick={simpanBorang}>{t('educator.peerReview.saveRound')}</Button>
            </div>
          </Card>
        )}

        {amaranSatuSudah && (
          <Alert tone="warning" icon={<AlertTriangle className="w-4 h-4" />} className="mb-4">
            <div className="font-bold">{t('educator.peerReview.singleRoundTitle')}</div>
            <p className="mb-3">{t('educator.peerReview.singleRoundText')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAmaranSatuSudah(false)}>{t('educator.peerReview.continue')}</Button>
              <Button size="sm" onClick={() => { setAmaranSatuSudah(false); setBorangTerbuka(true); }}>{t('educator.peerReview.addRound')}</Button>
            </div>
          </Alert>
        )}

        {kumpulanDua.length > 0 && (
          <Alert tone="warning" icon={<Users className="w-4 h-4" />} className="mb-4">
            <div className="font-bold">{t('educator.peerReview.twoMembersTitle', { senarai: kumpulanDua.join(", ") })}</div>
            <p>{t('educator.peerReview.twoMembersText')}</p>
          </Alert>
        )}

        {/* Bahagian pusingan */}
        <Card className="mb-4">
          <CardHead
            title={t('educator.peerReview.roundsTitle')}
            subtitle={t('educator.peerReview.roundsSubtitle')}
            right={
              <Button size="sm" onClick={() => setBorangTerbuka(!borangTerbuka)}>
                <Plus className="w-4 h-4" /> {t('educator.peerReview.createRound')}
              </Button>
            }
          />
          {rounds.length === 0 ? (
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title={t('educator.peerReview.noRoundsTitle')}
              text={t('educator.peerReview.noRoundsText')}
              actionLabel={t('educator.peerReview.createRound')}
              onAction={() => setBorangTerbuka(true)}
            />
          ) : (
            <div className="divide-y divide-kz-line">
              {rounds.map((r) => {
                const st = statusPusingan(r);
                const warna =
                  st === "terbuka" ? "green" :
                  st === "akan" ? "info" :
                  st === "dikira" ? "purple" :
                  "gray";
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium text-ink truncate">
                        {r.name}
                        {r.week ? <span className="ml-2 text-[12px] text-ink-faint font-normal">{t('educator.peerReview.weekLabelShort', { minggu: r.week })}</span> : null}
                      </div>
                      <div className="text-[12px] text-ink-faint">
                        {t('educator.peerReview.dateRange', { dari: formatTarikh(r.opens_at, bahasa), hingga: formatTarikh(r.closes_at, bahasa) })}
                      </div>
                    </div>
                    <Badge variant="dot" warna={warna}>
                      {st === "akan" ? t('educator.peerReview.statusUpcoming') : st === "terbuka" ? t('educator.peerReview.statusOpen') : st === "dikira" ? t('educator.peerReview.statusComputed') : t('educator.peerReview.statusClosed')}
                    </Badge>
                    {(st === "tertutup" || st === "dikira") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => kira(r.id)}
                        disabled={kiraBusy}
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${kiraBusy ? "animate-spin" : ""}`} />
                        {st === "dikira" ? t('educator.peerReview.recompute') : t('educator.peerReview.computeResults')}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => setPusinganDipilih(r.id)}>
                      {t('educator.peerReview.results')}
                    </Button>
                    <Button
                      variant="icon"
                      ariaLabel={t('educator.peerReview.deleteRoundAria', { nama: r.name })}
                      onClick={() => padamPusingan(r)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Bahagian keputusan: penapis kecil pada kepala kad, klik baris
            membuka justifikasi terima (penilai kekal tanpa nama). */}
        {keputusan && (
          penapis === "belum" ? (
            <div className="bg-white rounded-[4px] shadow-card">
              <CardHead
                title={t('educator.peerReview.resultsFor', { nama: keputusan.round.name })}
                subtitle={
                  keputusan.round.computed_at
                    ? t('educator.peerReview.computedOn', { tarikh: formatTarikh(keputusan.round.computed_at, bahasa) })
                    : t('educator.peerReview.notComputedYet')
                }
                right={
                  <div className="flex flex-wrap gap-1.5">
                    {(["semua", "merah", "semak", "risiko", "belum"] as Penapis[]).map((k) => (
                      <Button
                        key={k}
                        size="sm"
                        variant={penapis === k ? "primary" : "outline"}
                        onClick={() => setPenapis(k)}
                      >
                        {belumLabel[k]}
                      </Button>
                    ))}
                  </div>
                }
              />
              <div className="px-6 pb-2">
                {keputusan.not_submitted.length === 0 ? (
                  <p className="text-[14px] text-ink-faint py-3">{t('educator.peerReview.everyoneSubmitted')}</p>
                ) : (
                  <ul className="divide-y divide-kz-line">
                    {keputusan.not_submitted.map((m) => (
                      <li key={m.user_id + m.team_id} className="py-3 text-[13px]">
                        <span className="font-medium text-ink">{m.name || t('common.student')}</span>
                        <span className="text-ink-muted"> {t('educator.peerReview.notSubmitted', { kumpulan: m.team_name })}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <DataTable
              label={t('educator.peerReview.tableLabel', { nama: keputusan.round.name })}
              columns={lajurKeputusan}
              rows={barisDitapis}
              rowKey={(b) => b.user_id}
              onRowClick={(b) => setBarisTerbuka(barisTerbuka === b.user_id ? null : b.user_id)}
              head={
                <CardHead
                  title={t('educator.peerReview.resultsFor', { nama: keputusan.round.name })}
                  subtitle={
                    keputusan.round.computed_at
                      ? t('educator.peerReview.computedOn', { tarikh: formatTarikh(keputusan.round.computed_at, bahasa) })
                      : t('educator.peerReview.notComputedYet')
                  }
                  right={
                    <div className="flex flex-wrap gap-1.5">
                      {(["semua", "merah", "semak", "risiko", "belum"] as Penapis[]).map((k) => (
                        <Button
                          key={k}
                          size="sm"
                          variant={penapis === k ? "primary" : "outline"}
                          onClick={() => setPenapis(k)}
                        >
                          {belumLabel[k]}
                        </Button>
                      ))}
                    </div>
                  }
                />
              }
              empty={
                <EmptyState
                  icon={<Users className="w-6 h-6" />}
                  title={t('educator.peerReview.noMatchTitle')}
                  text={t('educator.peerReview.noMatchText')}
                />
              }
              renderRowExtra={(b) => {
                if (barisTerbuka !== b.user_id) return null;
                const just = justifikasiMengikut.get(b.user_id) ?? [];
                return (
                  <div className="rounded-[4px] border border-hairline bg-[#f8f9fc] p-4 text-[12px]">
                    <div className="font-bold text-ink mb-1">
                      {t('educator.peerReview.justificationsFor', { nama: b.name || t('educator.peerReview.thisStudent') })}
                    </div>
                    {just.length === 0 ? (
                      <p className="text-ink-faint">{t('educator.peerReview.noJustifications')}</p>
                    ) : (
                      <ul className="list-disc pl-4 space-y-1 text-ink-muted">
                        {just.map((j, i) => (
                          <li key={i}>
                            {j.justification}
                            <span className="ml-2 text-ink-faint">
                              (K1 {j.k1}, K2 {j.k2}, K3 {j.k3}, K4 {j.k4}, K5 {j.k5})
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              }}
            />
          )
        )}
      </ClassShell>
    </Shell>
  );
}