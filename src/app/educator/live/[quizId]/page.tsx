"use client";

/**
 * Penyunting kuiz tunggal (pendidik). KZ-046: satu kuiz, semua cara main.
 *
 * KZ-025 memperkenalkan rupa v3 (PageHead dengan breadcrumb, kad kit).
 * KZ-046 menyatukan bank soalan dengan Arena: borang aneka pilihan lama
 * diganti oleh QuestionEditor Arena (6 jenis soalan), dan import CSV/Aiken
 * lama diganti oleh import Excel/CSV/Aiken melalui /import-arena.
 * Medan khusus mod Langsung (kira detik, mata berganda) tidak wujud dalam
 * format Arena, jadi keduanya dikekalkan sebagai kawalan di sebelah editor
 * dan dihantar melalui PATCH format lama selepas simpan Arena.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { ArrowLeft, Plus, Trash2, Play, Upload, Pencil, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import PanelMulaSesi from "@/components/PanelMulaSesi";
import QuestionEditor, { QTYPE_LABEL } from "@/components/arena/QuestionEditor";
import { BONUS_LALAI_SEC, RACE_DEFAULT_MINUTES, sahMinitLumba, type TahapRaksasa } from "@/lib/lumba-laju";
import { isLiveCompatible, liveRowToArena, type LiveBankRow } from "@/lib/kuiz-bank";
import type { ArenaQuestionInput } from "@/lib/arena/types";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import {
  Alert,
  Button,
  Card,
  CardHead,
  CheckRadio,
  EmptyState,
  PageHead,
  Textarea,
} from "@/components/ui";

interface Pilihan { key: string; text: string }
interface Soalan {
  id: string;
  quiz_id: string;
  order_idx: number;
  prompt: string;
  options: Pilihan[];
  correct_key: string;
  qtype: string | null;
  data: unknown;
  hint: unknown;
  points: number;
  time_limit_sec: number;
  use_countdown?: boolean;
  double_points?: boolean;
}
interface Kuiz { id: string; title: string; description: string | null; streak_bonus?: boolean }

/** Baris Outcome yang dipulangkan laluan outcomes kuiz (KZ-037). */
interface OutcomeBaris {
  id: string;
  code: string | null;
  label: string;
  tagged: boolean;
}

/** Bentuk balasan GET/PUT laluan outcomes kuiz (KZ-037). */
interface OutcomeSet {
  classId: string | null;
  outcomes: OutcomeBaris[];
}

/**Permintaan dengan token Bearer pendidik. */
async function authedFetch(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

/** Mesej ralat selamat daripada nilai balingan unknown. */
function mesejRalat(e: unknown, zonkal: string): string {
  return e instanceof Error && e.message ? e.message : zonkal;
}

export default function EditorKuizLangsung() {
  const { quizId } = useParams<{ quizId: string }>() as { quizId: string };
  const router = useRouter();
  const { t } = useBahasa();

  const [kuiz, setKuiz] = useState<Kuiz | null>(null);
  const [soalan, setSoalan] = useState<Soalan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Suntingan soalan: "new" atau id soalan (KZ-046, ikut editor set Arena).
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Medan khusus mod Langsung yang format Arena tidak simpan (KZ-046):
  // dikekalkan sebagai kawalan di sebelah QuestionEditor.
  const [kiraDetik, setKiraDetik] = useState(true);
  const [mataBerganda, setMataBerganda] = useState(false);
  const [editKira, setEditKira] = useState(true);
  const [editBerganda, setEditBerganda] = useState(false);

  // Import soalan melalui /import-arena (KZ-046): Excel, CSV atau Aiken.
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [impErr, setImpErr] = useState<string | null>(null);
  const [impRows, setImpRows] = useState<{ row: number; message: string }[] | null>(null);
  const [aikenText, setAikenText] = useState("");

  // KZ-037: kad Outcome yang dinilai (tag kuiz kepada Outcome kelas).
  const [outcomeSet, setOutcomeSet] = useState<OutcomeSet | null>(null);
  const [outcomePilih, setOutcomePilih] = useState<string[]>([]);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [outcomeMsg, setOutcomeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => {
    try {
      const json = await authedFetch("/api/live/quizzes/" + quizId);
      setKuiz(json.data.quiz);
      setSoalan(json.data.questions || []);
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.loadFailed")));
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (quizId) reload(); }, [quizId]);

  // KZ-037: muat senarai Outcome kelas kuiz dan tag semasa kuiz ini.
  const muatOutcome = async () => {
    try {
      const json = (await authedFetch(`/api/live/quizzes/${quizId}/outcomes`)) as OutcomeSet;
      setOutcomeSet(json);
      setOutcomePilih((json.outcomes || []).filter((o) => o.tagged).map((o) => o.id));
    } catch (e) {
      setOutcomeMsg({ ok: false, text: mesejRalat(e, t("live.educatorEditor.outcomesLoadFailed")) });
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (quizId) muatOutcome(); }, [quizId]);

  /** Soalan ini dimainkan oleh enjin Live (aneka satu jawapan atau ox). */
  const serasiSoalan = (s: Soalan): boolean =>
    isLiveCompatible({ qtype: s.qtype || "multiple", correct_key: s.correct_key || "" });

  /** Hasil QuestionEditor akan dimainkan oleh enjin Live? */
  const serasiInput = (q: ArenaQuestionInput): boolean => {
    if (q.type === "ox") return true;
    if (q.type !== "multiple") return false;
    const senarai = (q.data as { choiceList?: { isAnswer?: boolean }[] }).choiceList ?? [];
    return senarai.filter((c) => c.isAnswer).length === 1;
  };

  /** Baris bank menjadi input awal QuestionEditor (format Arena). */
  const toInput = (s: Soalan): ArenaQuestionInput => {
    const baris: LiveBankRow = {
      id: s.id,
      quiz_id: s.quiz_id,
      order_idx: s.order_idx,
      prompt: s.prompt,
      options: s.options,
      correct_key: s.correct_key,
      qtype: s.qtype || "multiple",
      data: s.data ?? null,
      hint: s.hint ?? null,
      points: s.points,
      time_limit_sec: s.time_limit_sec,
      use_countdown: s.use_countdown,
      double_points: s.double_points,
    };
    const arena = liveRowToArena(baris);
    return {
      type: arena.type,
      prompt: arena.prompt,
      data: arena.data,
      hint: arena.hint,
      points: arena.points,
      time_limit_sec: arena.time_limit_sec,
      origin: arena.origin,
    };
  };

  const mulaSunting = (s: Soalan) => {
    setEditing(s.id);
    setEditKira(s.use_countdown !== false);
    setEditBerganda(s.double_points === true);
  };

  /** Simpan medan khusus mod Langsung melalui PATCH format lama. */
  const simpanMedanLive = async (id: string, kira: boolean, berganda: boolean) => {
    await authedFetch("/api/live/questions/" + id, {
      method: "PATCH",
      body: JSON.stringify({ use_countdown: kira, double_points: berganda }),
    });
  };

  /** Tambah soalan daripada QuestionEditor (format Arena, 6 jenis). */
  const onTambah = async (q: ArenaQuestionInput) => {
    setErr(null);
    setBusy(true);
    try {
      const json = await authedFetch(`/api/live/quizzes/${quizId}/questions`, {
        method: "POST",
        body: JSON.stringify(q),
      });
      // Medan Live tidak wujud dalam format Arena; simpan melalui PATCH kedua
      // hanya untuk soalan yang benar-benar dimainkan oleh enjin Live.
      if (serasiInput(q)) {
        const baharu = (json as { data: { id: string } }).data;
        await simpanMedanLive(baharu.id, kiraDetik, mataBerganda);
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.questionSaveFailed")));
    } finally {
      setBusy(false);
    }
  };

  /** Sunting soalan sedia ada melalui QuestionEditor. */
  const onSimpanSunting = async (q: ArenaQuestionInput) => {
    if (!editing) return;
    setErr(null);
    setBusy(true);
    try {
      await authedFetch("/api/live/questions/" + editing, {
        method: "PATCH",
        body: JSON.stringify(q),
      });
      if (serasiInput(q)) {
        await simpanMedanLive(editing, editKira, editBerganda);
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.updateFailed")));
    } finally {
      setBusy(false);
    }
  };

  const onPadamSoalan = async (s: Soalan) => {
    if (!window.confirm(t("live.educatorEditor.deleteConfirm"))) return;
    try {
      await authedFetch("/api/live/questions/" + s.id, { method: "DELETE" });
      await reload();
    } catch (e) {
      alert(mesejRalat(e, t("live.educatorEditor.deleteFailed")));
    }
  };

  /**
   * Import melalui /import-arena (KZ-046). Berbeza daripada authedFetch:
   * balasan 400 boleh membawa {errors:[{row,message}]} yang perlu dibaca
   * untuk paparan ralat per baris, jadi fetch dibuat secara manual di sini.
   */
  const hantarImport = async (format: "xlsx" | "csv" | "aiken", content: string) => {
    setImpBusy(true);
    setImpErr(null);
    setImpMsg(null);
    setImpRows(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/live/quizzes/${quizId}/import-arena`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
        },
        body: JSON.stringify({ format, content }),
      });
      const j: unknown = await res.json().catch(() => ({}));
      const o = (j ?? {}) as {
        created?: unknown;
        skipped?: unknown;
        error?: unknown;
        errors?: unknown;
      };
      if (!res.ok) {
        setImpRows(
          Array.isArray(o.errors) ? (o.errors as { row: number; message: string }[]) : null,
        );
        setImpErr(typeof o.error === "string" ? o.error : t("live.educatorEditor.csvImportFailed"));
        return;
      }
      const cipta = Number(o.created) || 0;
      const lompat = Number(o.skipped) || 0;
      setImpMsg(
        format === "aiken"
          ? t("live.educatorEditor.aikenDone", { cipta, lompat })
          : t("live.educatorEditor.importDone", { cipta }) +
              (lompat ? t("live.educatorEditor.importSkipped", { lompat }) : ""),
      );
      setAikenText("");
      await reload();
    } catch {
      setImpErr(t("live.educatorEditor.importReadFailed"));
    } finally {
      setImpBusy(false);
    }
  };

  /** Fail .xlsx dibaca sebagai base64; .csv sebagai teks (had 2 MB). */
  const importFile = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) {
      setImpErr(t("live.educatorEditor.importTooLarge"));
      return;
    }
    if (/\.xlsx$/i.test(f.name)) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      await hantarImport("xlsx", btoa(bin));
    } else {
      await hantarImport("csv", await f.text());
    }
  };

  /** Fail Aiken dibaca sebagai teks ke dalam kotak tampal. */
  const importAikenFile = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) {
      setImpErr(t("live.educatorEditor.importTooLarge"));
      return;
    }
    setAikenText(await f.text());
  };

  /** Bonus rentetan ialah tetapan seluruh kuiz, dipetik ke sesi bila dimulakan. */
  const onTukarStreak = async (v: boolean) => {
    if (!kuiz) return;
    const sebelum = kuiz;
    setKuiz({ ...kuiz, streak_bonus: v });
    try {
      await authedFetch("/api/live/quizzes/" + quizId, {
        method: "PATCH",
        body: JSON.stringify({ streak_bonus: v }),
      });
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.streakSaveFailed")));
      setKuiz(sebelum);
    }
  };

  // KZ-037: simpan set Outcome yang dinilai kuiz ini (ganti seluruh set).
  const onSimpanOutcome = async () => {
    setOutcomeMsg(null);
    setOutcomeBusy(true);
    try {
      const json = (await authedFetch(`/api/live/quizzes/${quizId}/outcomes`, {
        method: "PUT",
        body: JSON.stringify({ outcomeIds: outcomePilih }),
      })) as OutcomeSet;
      setOutcomeSet(json);
      setOutcomePilih((json.outcomes || []).filter((o) => o.tagged).map((o) => o.id));
      setOutcomeMsg({ ok: true, text: t("live.educatorEditor.outcomeSaved") });
    } catch (e) {
      setOutcomeMsg({ ok: false, text: mesejRalat(e, t("live.educatorEditor.outcomeSaveFailed")) });
    } finally {
      setOutcomeBusy(false);
    }
  };

  const onMulaSesi = async () => {
    setErr(null);
    if (soalan.length === 0) { setErr(t("live.educatorEditor.needOneQuestion")); return; }
    // KZ-012: Speed Race perlu minit yang sah sebelum sesi dicipta.
    // KZ-013: Boss Battle juga menggunakan raceMinutes dan menambah bossLevel.
    const minit = sahMinitLumba(minitTeks);
    if ((modPilih === "race" || modPilih === "boss") && minit === null) return;
    setBusy(true);
    try {
      const badan =
        modPilih === "race"
          ? { mode: "race", raceMinutes: minit, raceBonusSec: bonusSecPilih }
          : modPilih === "boss"
            ? { mode: "boss", raceMinutes: minit, bossLevel: tahapPilih, raceBonusSec: bonusSecPilih }
            : { mode: "classic" };
      const json = await authedFetch(`/api/live/quizzes/${quizId}/sessions`, {
        method: "POST",
        body: JSON.stringify(badan),
      });
      router.push(`/educator/live/session/${json.data.sessionId}`);
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.sessionStartFailed")));
      setBusy(false);
    }
  };

  // Panel pilihan mod (KZ-012, KZ-013).
  const [panelMula, setPanelMula] = useState(false);
  const [modPilih, setModPilih] = useState<"classic" | "race" | "boss">("classic");
  const [minitTeks, setMinitTeks] = useState(String(RACE_DEFAULT_MINUTES));
  const [tahapPilih, setTahapPilih] = useState<TahapRaksasa>("medium");
  // KZ-032: tempoh bar bonus kelajuan untuk race dan boss, lalai 30 saat.
  const [bonusSecPilih, setBonusSecPilih] = useState(BONUS_LALAI_SEC);

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-ink-muted">{t("common.loading")}</p>
      </Shell>
    );
  }
  if (!kuiz) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-ink-muted">{t("live.educatorEditor.notFound")} <Link href="/educator/live" className="text-brand-purple font-semibold">{t("common.back")} →</Link></p>
      </Shell>
    );
  }

  /** Bilangan soalan serasi mod Langsung dan jumlah untuk Arena (KZ-046). */
  const serasiBil = soalan.filter(serasiSoalan).length;

  /** Kawalan medan khusus mod Langsung, di sebelah QuestionEditor. */
  const kawalanLive = (
    kira: boolean,
    setKira: (v: boolean) => void,
    berganda: boolean,
    setBerganda: (v: boolean) => void,
  ) => (
    <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 space-y-2">
      <p className="text-[13px] font-bold text-ink">{t("live.educatorEditor.liveFieldsTitle")}</p>
      <p className="text-[12px] text-ink-faint">{t("live.educatorEditor.liveFieldsNote")}</p>
      <div className="flex flex-wrap gap-6">
        <CheckRadio label={t("live.educatorEditor.countdown")} checked={kira} onChange={(e) => setKira(e.target.checked)} />
        <CheckRadio label={t("live.educatorEditor.doublePoints")} checked={berganda} onChange={(e) => setBerganda(e.target.checked)} />
      </div>
      <p className="text-[12px] text-ink-faint">
        {kira ? t("live.educatorEditor.countdownDesc") : t("live.educatorEditor.paceDesc")}
      </p>
    </div>
  );

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        crumb={t("live.educatorEditor.crumb")}
        name={kuiz.title}
        description={kuiz.description || undefined}
        secondaryActions={[{ label: t("live.educatorEditor.allQuizzes"), icon: <ArrowLeft className="w-4 h-4" />, href: "/educator/live" }]}
        primaryAction={{
          label: t("live.educatorEditor.startSession"),
          icon: <Play className="w-4 h-4" />,
          // Butang asal dilumpuhkan ketika sibuk; pagar yang sama dipakai di sini.
          onSelect: () => { if (!busy) setPanelMula((v) => !v); },
        }}
      />

      {panelMula && (
        <PanelMulaSesi
          bilSoalan={soalan.length}
          mod={modPilih}
          setMod={setModPilih}
          minitTeks={minitTeks}
          setMinitTeks={setMinitTeks}
          tahap={tahapPilih}
          setTahap={setTahapPilih}
          bonusSec={bonusSecPilih}
          setBonusSec={setBonusSecPilih}
          busy={busy}
          onMula={onMulaSesi}
          onBatal={() => setPanelMula(false)}
        />
      )}

      {err && <Alert tone="danger" className="mb-4">{err}</Alert>}

      <Card className="mb-4">
        <CheckRadio
          label={t("live.educatorEditor.streakBonusLabel")}
          checked={kuiz.streak_bonus !== false}
          onChange={(e) => onTukarStreak(e.target.checked)}
        />
        <p className="text-[12px] text-ink-faint mt-2">
          {t("live.educatorEditor.streakBonusDesc")}
        </p>
      </Card>

      {/* KZ-037: kad Outcome yang dinilai; guru memilih Outcome bagi seluruh kuiz. */}
      <Card className="mb-4">
        <CardHead title={t("live.educatorEditor.outcomeTitle")} />
        {outcomeSet === null ? (
          <p className="text-[12px] text-ink-faint mt-3">{t("common.loading")}</p>
        ) : outcomeSet.classId === null ? (
          <p className="text-[12px] text-ink-faint mt-3">
            {t("live.educatorEditor.outcomeShareClass")}
          </p>
        ) : outcomeSet.outcomes.length === 0 ? (
          <p className="text-[12px] text-ink-faint mt-3">
            {t("live.educatorEditor.outcomeNone")}{" "}
            <Link href="/educator/outcomes" className="text-brand-purple font-semibold">
              {t("live.educatorEditor.outcomeCreateFirst")}
            </Link>
          </p>
        ) : (
          <>
            <div className="mt-3 space-y-1">
              {outcomeSet.outcomes.map((o) => (
                <CheckRadio
                  key={o.id}
                  label={(o.code ? o.code + ". " : "") + o.label}
                  checked={outcomePilih.includes(o.id)}
                  onChange={(e) => {
                    setOutcomePilih((s) =>
                      e.target.checked ? [...s, o.id] : s.filter((x) => x !== o.id),
                    );
                  }}
                />
              ))}
            </div>
            <p className="text-[12px] text-ink-faint mt-2">
              {t("live.educatorEditor.outcomeCountNote")}
            </p>
            <div className="flex items-center justify-end mt-3">
              <Button disabled={outcomeBusy} onClick={onSimpanOutcome}>
                {outcomeBusy ? t("live.educatorEditor.saving") : t("live.educatorEditor.saveOutcomes")}
              </Button>
            </div>
          </>
        )}
        {outcomeMsg && (
          <Alert tone={outcomeMsg.ok ? "success" : "danger"} className="mt-3">{outcomeMsg.text}</Alert>
        )}
      </Card>

      <div className="flex items-center justify-between mb-2 gap-2">
        <div>
          <h3 className="text-[14px] font-bold text-ink">{t("live.educatorEditor.questionsCount", { n: soalan.length })}</h3>
          {soalan.length > 0 && (
            <p className="text-[12px] text-ink-faint">
              {t("live.educatorEditor.compatCount", { x: serasiBil, y: soalan.length })}
            </p>
          )}
        </div>
        <Button onClick={() => setEditing((s) => (s === "new" ? null : "new"))}>
          <Plus className="w-4 h-4" /> {t("live.educatorEditor.newQuestion")}
        </Button>
      </div>

      {/* KZ-046: QuestionEditor Arena mengendalikan keenam-enam jenis;
          medan khusus mod Langsung kekal di sebelahnya. */}
      {editing === "new" && (
        <Card className="mb-4">
          <CardHead title={t("live.educatorEditor.addQuestion")} />
          <div className="mt-4 space-y-4">
            <QuestionEditor onSave={onTambah} onCancel={() => setEditing(null)} />
            {kawalanLive(kiraDetik, setKiraDetik, mataBerganda, setMataBerganda)}
          </div>
        </Card>
      )}

      {soalan.length === 0 ? (
        <div className="mb-4">
          <EmptyState
            icon={<Plus className="w-6 h-6" />}
            title={t("live.educatorEditor.emptyQuestionsTitle")}
            text={t("live.educatorEditor.emptyQuestionsText")}
          />
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {soalan.map((s, idx) => (
            <Card key={s.id}>
              {editing === s.id ? (
                <div className="space-y-4">
                  <QuestionEditor initial={toInput(s)} onSave={onSimpanSunting} onCancel={() => setEditing(null)} />
                  {kawalanLive(editKira, setEditKira, editBerganda, setEditBerganda)}
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="text-[12px] font-bold text-ink-faint mt-1">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                        {QTYPE_LABEL[(s.qtype || "multiple") as keyof typeof QTYPE_LABEL]}
                      </span>
                      {/* Soalan yang enjin Live tidak mainkan: Arena sahaja. */}
                      {!serasiSoalan(s) && (
                        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          {t("live.educatorEditor.arenaOnly")}
                        </span>
                      )}
                    </div>
                    <div className="text-[14px] font-medium text-ink mt-1">{s.prompt}</div>
                    {s.options.length > 0 && (
                      <div className="text-[12px] text-ink-faint mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                        {s.options.map((o) => (
                          <span key={o.key} className={o.key === s.correct_key ? "font-semibold text-green-700" : ""}>
                            {o.key}. {o.text}{o.key === s.correct_key ? " ✓" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="text-[12px] text-ink-faint mt-1">
                      {t("live.educatorEditor.pointsN", { n: s.points })}{s.double_points ? " × 2" : ""} ·{" "}
                      {serasiSoalan(s)
                        ? (s.use_countdown === false
                            ? t("live.educatorEditor.noCountdownPace", { n: s.time_limit_sec })
                            : t("live.educatorEditor.countdownSec", { n: s.time_limit_sec }))
                        : s.time_limit_sec + "s"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="icon"
                      size="sm"
                      title={t("live.educatorEditor.editQuestion")}
                      ariaLabel={t("live.educatorEditor.editQuestion")}
                      onClick={() => mulaSunting(s)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title={t("live.educatorEditor.deleteQuestion")}
                      ariaLabel={t("live.educatorEditor.deleteQuestion")}
                      className="text-[#e85347] hover:bg-[#fce4e2]"
                      onClick={() => onPadamSoalan(s)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* KZ-046: import Excel / CSV / Aiken melalui /import-arena. */}
      <Card className="mb-4">
        <CardHead
          title={
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-violet-600" /> {t("live.educatorEditor.importTitle")}
            </span>
          }
        />
        <p className="text-[12px] text-ink-faint mt-3 mb-3">
          {t("live.educatorEditor.importDesc")}
        </p>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-3 text-xs text-gray-700">
          <div className="font-semibold mb-1">{t("live.educatorEditor.csvColumns")}</div>
          <ul className="list-disc ml-4 space-y-0.5">
            {t("live.educatorEditor.importTypes").split("\n").map((baris, i) => (
              <li key={i}>{baris}</li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pautan muat turun kekal <a> biasa: ini fail API, bukan laluan aplikasi. */}
          <a
            href="/api/arena/template"
            className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> {t("live.educatorEditor.downloadArenaTemplate")}
          </a>
          <label className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1 cursor-pointer">
            <Upload className="w-4 h-4" />
            {impBusy ? t("live.educatorEditor.uploading") : t("live.educatorEditor.uploadExcelCsv")}
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={impBusy}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0] ?? null;
                e.currentTarget.value = "";
                if (f) void importFile(f);
              }}
            />
          </label>
        </div>

        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4">
          <p className="text-[13px] font-bold text-ink">{t("live.educatorEditor.aikenTextLabel")}</p>
          <p className="text-[12px] text-ink-faint">{t("live.educatorEditor.aikenExample")}</p>
          <pre className="overflow-x-auto rounded-lg bg-white p-2 text-xs text-ink-faint ring-1 ring-slate-200">{"Berapakah 2 + 2?\nA. 3\nB. 4\nANSWER: B"}</pre>
          <Textarea
            className="w-full font-mono text-xs"
            rows={4}
            placeholder={t("live.educatorEditor.aikenPlaceholder")}
            value={aikenText}
            onChange={(e) => setAikenText(e.target.value)}
          />
          <div className="flex items-center gap-3 flex-wrap">
            <label className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 text-sm flex items-center gap-1 cursor-pointer">
              {t("live.educatorEditor.uploadAikenFile")}
              <input
                type="file"
                accept=".txt,.text"
                className="hidden"
                disabled={impBusy}
                onChange={(e) => {
                  const f = e.currentTarget.files?.[0] ?? null;
                  e.currentTarget.value = "";
                  if (f) void importAikenFile(f);
                }}
              />
            </label>
            <Button disabled={impBusy || !aikenText.trim()} onClick={() => void hantarImport("aiken", aikenText)}>
              <Upload className="w-4 h-4" /> {impBusy ? t("live.educatorEditor.importing") : t("live.educatorEditor.importAikenButton")}
            </Button>
          </div>
        </div>

        {impMsg && <Alert tone="success" className="mt-3">{impMsg}</Alert>}
        {impErr && <Alert tone="danger" className="mt-3">{impErr}</Alert>}
        {impRows && (
          <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <p className="font-semibold">{t("live.educatorEditor.importNoRows")}</p>
            <ul className="mt-1 list-disc ml-4 space-y-0.5">
              {impRows.map((r, i) => (
                <li key={i}>{r.row > 0 ? t("live.educatorEditor.csvRow", { n: r.row }) : ""}{r.message}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </Shell>
  );
}