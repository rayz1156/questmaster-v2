"use client";

/**
 * Penyunting kuiz langsung (pendidik). KZ-025: rupa v3 (PageHead dengan
 * breadcrumb "Live Quiz / <tajuk>", setiap soalan dalam Card kit, borang
 * guna Field/Input/Textarea/CheckRadio dan butang kit). Aliran simpan,
 * sunting, padam soalan, import CSV/Aiken dan mula sesi TIDAK berubah;
 * hanya pengendali `catch` ditaip semula supaya lint bersih.
 */

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { ArrowLeft, Plus, Trash2, Play, Upload, Pencil, Check, X, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import PanelMulaSesi from "@/components/PanelMulaSesi";
import { BONUS_LALAI_SEC, RACE_DEFAULT_MINUTES, sahMinitLumba, type TahapRaksasa } from "@/lib/lumba-laju";
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import {
  Alert,
  Button,
  Card,
  CardHead,
  CheckRadio,
  EmptyState,
  Field,
  Input,
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

const HURUF = ["A", "B", "C", "D", "E", "F"];

export default function EditorKuizLangsung() {
  const { quizId } = useParams<{ quizId: string }>() as { quizId: string };
  const router = useRouter();
  const { t } = useBahasa();

  const [kuiz, setKuiz] = useState<Kuiz | null>(null);
  const [soalan, setSoalan] = useState<Soalan[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Borang soalan baharu
  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [opts, setOpts] = useState<Pilihan[]>([
    { key: "A", text: "" },
    { key: "B", text: "" },
    { key: "C", text: "" },
    { key: "D", text: "" },
  ]);
  const [kunci, setKunci] = useState("A");
  const [points, setPoints] = useState(1000);
  const [timeLimit, setTimeLimit] = useState(20);
  const [kiraDetik, setKiraDetik] = useState(true);
  const [mataBerganda, setMataBerganda] = useState(false);
  const [busy, setBusy] = useState(false);

  // Suntingan soalan sedia ada
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editOpts, setEditOpts] = useState<Pilihan[]>([]);
  const [editKunci, setEditKunci] = useState("");
  const [editPoints, setEditPoints] = useState(1000);
  const [editTime, setEditTime] = useState(20);
  const [editKira, setEditKira] = useState(true);
  const [editBerganda, setEditBerganda] = useState(false);

  // Import Aiken
  const [aiken, setAiken] = useState("");
  const [aikenBusy, setAikenBusy] = useState(false);
  const [aikenMsg, setAikenMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Import CSV: templat dimuat turun, diisi dalam Excel, dimuat naik semula.
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMsg, setCsvMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csvErrors, setCsvErrors] = useState<{ row: number; message: string }[]>([]);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

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

  const onTambah = async () => {
    setErr(null);
    const bersih = opts.map((o, i) => ({ key: HURUF[i], text: o.text.trim() })).filter((o) => o.text);
    if (!prompt.trim()) { setErr(t("live.educatorEditor.questionRequired")); return; }
    if (bersih.length < 2) { setErr(t("live.educatorEditor.optionsMin")); return; }
    if (!bersih.some((o) => o.key === kunci)) { setErr(t("live.educatorEditor.answerKeyValid")); return; }
    setBusy(true);
    try {
      await authedFetch(`/api/live/quizzes/${quizId}/questions`, {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.trim(),
          options: bersih,
          correct_key: kunci,
          points,
          time_limit_sec: timeLimit,
          use_countdown: kiraDetik,
          double_points: mataBerganda,
        }),
      });
      setPrompt(""); setOpts([{ key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }]);
      setKunci("A"); setPoints(1000); setTimeLimit(20); setKiraDetik(true);
      setMataBerganda(false); setShowNew(false);
      await reload();
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.questionSaveFailed")));
    } finally { setBusy(false); }
  };

  const mulaSunting = (s: Soalan) => {
    setEditId(s.id);
    setEditPrompt(s.prompt);
    setEditOpts(s.options.map((o) => ({ ...o })));
    setEditKunci(s.correct_key);
    setEditPoints(s.points);
    setEditTime(s.time_limit_sec);
    setEditKira(s.use_countdown !== false);
    setEditBerganda(s.double_points === true);
  };

  const onSimpanSunting = async () => {
    if (!editId) return;
    setErr(null);
    const bersih = editOpts.map((o) => ({ key: o.key, text: o.text.trim() })).filter((o) => o.text);
    if (!editPrompt.trim() || bersih.length < 2 || !bersih.some((o) => o.key === editKunci)) {
      setErr(t("live.educatorEditor.editRequired"));
      return;
    }
    setBusy(true);
    try {
      await authedFetch("/api/live/questions/" + editId, {
        method: "PATCH",
        body: JSON.stringify({
          prompt: editPrompt.trim(),
          options: bersih,
          correct_key: editKunci,
          points: editPoints,
          time_limit_sec: editTime,
          use_countdown: editKira,
          double_points: editBerganda,
        }),
      });
      setEditId(null);
      await reload();
    } catch (e) {
      setErr(mesejRalat(e, t("live.educatorEditor.updateFailed")));
    } finally { setBusy(false); }
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

  const onImportAiken = async () => {
    setAikenMsg(null);
    if (!aiken.trim()) { setAikenMsg({ ok: false, text: t("live.educatorEditor.aikenEmpty") }); return; }
    setAikenBusy(true);
    try {
      const json = await authedFetch(`/api/live/quizzes/${quizId}/import-aiken`, {
        method: "POST",
        body: JSON.stringify({ content: aiken }),
      });
      setAikenMsg({ ok: true, text: t("live.educatorEditor.aikenDone", { cipta: json.created, lompat: json.skipped }) });
      setAiken("");
      await reload();
    } catch (e) {
      setAikenMsg({ ok: false, text: mesejRalat(e, t("live.educatorEditor.aikenImportFailed")) });
    } finally { setAikenBusy(false); }
  };

  /** Baca fail CSV di klien, hantar sebagai teks, papar ralat per baris. */
  const onPilihCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvMsg(null);
    setCsvErrors([]);
    if (file.size > 500000) {
      setCsvMsg({ ok: false, text: t("live.educatorEditor.csvTooLarge") });
      if (csvInputRef.current) csvInputRef.current.value = "";
      return;
    }
    setCsvBusy(true);
    try {
      const content = await file.text();
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`/api/live/quizzes/${quizId}/import-csv`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
        },
        body: JSON.stringify({ content }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCsvErrors(Array.isArray(j.errors) ? j.errors : []);
        setCsvMsg({ ok: false, text: j.error || t("live.educatorEditor.csvImportFailed") });
        return;
      }
      setCsvMsg({ ok: true, text: t("live.educatorEditor.csvDone", { n: j.created, fail: file.name }) });
      await reload();
    } catch {
      setCsvMsg({ ok: false, text: t("live.educatorEditor.csvReadFailed") });
    } finally {
      setCsvBusy(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
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

  /** Baris pilihan dengan radio kunci: sama untuk borang baharu dan suntingan.
   * `bolehBuang`: borang baharu sahaja yang mempunyai butang buang pilihan
   * (borang suntingan asal tiada butang itu, jadi ia dikekalkan begitu). */
  const barisPilihan = (
    senarai: Pilihan[],
    setSenarai: (x: Pilihan[]) => void,
    kunciIni: string,
    setKunciIni: (k: string) => void,
    namaRadio: string,
    bolehBuang: boolean,
  ) => (
    <div className="space-y-2">
      {senarai.map((o, i) => (
        <div key={o.key + i} className="flex items-center gap-2">
          <CheckRadio
            type="radio"
            name={namaRadio}
            checked={kunciIni === senarai[i].key}
            onChange={() => setKunciIni(senarai[i].key)}
            label={<span className="font-bold">{senarai[i].key}.</span>}
          />
          <div className="flex-1 min-w-0">
            <Input
              placeholder={t("live.educatorEditor.optionPlaceholder", { huruf: senarai[i].key })}
              value={o.text}
              onChange={(e) => setSenarai(senarai.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            />
          </div>
          {bolehBuang && senarai.length > 2 && (
            <Button
              variant="icon"
              size="sm"
              title={t("live.educatorEditor.removeOption")}
              ariaLabel={t("live.educatorEditor.removeOption")}
              className="text-[#e85347] hover:bg-[#fce4e2]"
              onClick={() => setSenarai(senarai.filter((_, j) => j !== i).map((x, j) => ({ key: HURUF[j], text: x.text })))}
            >
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      ))}
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
        <h3 className="text-[14px] font-bold text-ink">{t("live.educatorEditor.questionsCount", { n: soalan.length })}</h3>
        <Button onClick={() => setShowNew((s) => !s)}>
          <Plus className="w-4 h-4" /> {t("live.educatorEditor.newQuestion")}
        </Button>
      </div>

      {showNew && (
        <Card className="mb-4">
          <CardHead title={t("live.educatorEditor.addQuestion")} />
          <div className="mt-4 space-y-4">
            <Field label={t("live.educatorEditor.questionLabel")} htmlFor="soalan-baharu">
              <Textarea
                id="soalan-baharu"
                rows={2}
                placeholder={t("live.educatorEditor.questionPlaceholder")}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
            <Field label={t("live.educatorEditor.optionsLabel")} note={t("live.educatorEditor.optionsNote")}>
              {barisPilihan(opts, setOpts, kunci, setKunci, "kunci-baharu", true)}
            </Field>
            {opts.length < 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-brand-purple"
                onClick={() => setOpts([...opts, { key: HURUF[opts.length], text: "" }])}
              >
                {t("live.educatorEditor.addOption")}
              </Button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t("live.educatorEditor.pointsLabel")} htmlFor="soalan-baharu-mata">
                <Input
                  id="soalan-baharu-mata"
                  type="number"
                  min={1}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 1000)}
                />
              </Field>
              <Field label={kiraDetik ? t("live.educatorEditor.timeSeconds") : t("live.educatorEditor.paceSeconds")} htmlFor="soalan-baharu-masa">
                <Input
                  id="soalan-baharu-masa"
                  type="number"
                  min={5}
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value) || 20)}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-6">
              <CheckRadio label={t("live.educatorEditor.countdown")} checked={kiraDetik} onChange={(e) => setKiraDetik(e.target.checked)} />
              <CheckRadio label={t("live.educatorEditor.doublePoints")} checked={mataBerganda} onChange={(e) => setMataBerganda(e.target.checked)} />
            </div>
            <p className="text-[12px] text-ink-faint">
              {kiraDetik
                ? t("live.educatorEditor.countdownDesc")
                : t("live.educatorEditor.paceDesc")}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>{t("common.cancel")}</Button>
              <Button disabled={busy} onClick={onTambah}>{busy ? t("live.educatorEditor.saving") : t("live.educatorEditor.saveQuestion")}</Button>
            </div>
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
              {editId === s.id ? (
                <div className="space-y-4">
                  <Field label={t("live.educatorEditor.questionLabel")} htmlFor={`sunting-${s.id}-prompt`}>
                    <Textarea
                      id={`sunting-${s.id}-prompt`}
                      rows={2}
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                    />
                  </Field>
                  <Field label={t("live.educatorEditor.optionsLabel")} note={t("live.educatorEditor.optionsNote")}>
                    {barisPilihan(editOpts, setEditOpts, editKunci, setEditKunci, `kunci-sunting-${s.id}`, false)}
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label={t("live.educatorEditor.pointsLabel")} htmlFor={`sunting-${s.id}-mata`}>
                      <Input
                        id={`sunting-${s.id}-mata`}
                        type="number"
                        min={1}
                        value={editPoints}
                        onChange={(e) => setEditPoints(Number(e.target.value) || 1000)}
                      />
                    </Field>
                    <Field label={editKira ? t("live.educatorEditor.timeSeconds") : t("live.educatorEditor.paceSeconds")} htmlFor={`sunting-${s.id}-masa`}>
                      <Input
                        id={`sunting-${s.id}-masa`}
                        type="number"
                        min={5}
                        value={editTime}
                        onChange={(e) => setEditTime(Number(e.target.value) || 20)}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <CheckRadio label={t("live.educatorEditor.countdown")} checked={editKira} onChange={(e) => setEditKira(e.target.checked)} />
                    <CheckRadio label={t("live.educatorEditor.doublePoints")} checked={editBerganda} onChange={(e) => setEditBerganda(e.target.checked)} />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditId(null)} disabled={busy}>{t("common.cancel")}</Button>
                    <Button onClick={onSimpanSunting} disabled={busy}><Check className="w-4 h-4" /> {t("live.educatorEditor.saveButton")}</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <span className="text-[12px] font-bold text-ink-faint mt-1">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium text-ink">{s.prompt}</div>
                    <div className="text-[12px] text-ink-faint mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                      {s.options.map((o) => (
                        <span key={o.key} className={o.key === s.correct_key ? "font-semibold text-green-700" : ""}>
                          {o.key}. {o.text}{o.key === s.correct_key ? " ✓" : ""}
                        </span>
                      ))}
                    </div>
                    <div className="text-[12px] text-ink-faint mt-1">
                      {t("live.educatorEditor.pointsN", { n: s.points })}{s.double_points ? " × 2" : ""} ·{" "}
                      {s.use_countdown === false
                        ? t("live.educatorEditor.noCountdownPace", { n: s.time_limit_sec })
                        : t("live.educatorEditor.countdownSec", { n: s.time_limit_sec })}
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

      <Card className="mb-4">
        <CardHead
          title={
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-violet-600" /> {t("live.educatorEditor.csvTitle")}
            </span>
          }
        />
        <p className="text-[12px] text-ink-faint mt-3 mb-3">
          {t("live.educatorEditor.csvDesc")}
        </p>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-3 text-xs text-gray-700">
          <div className="font-semibold mb-1">{t("live.educatorEditor.csvColumns")}</div>
          <ul className="list-disc ml-4 space-y-0.5">
            <li><code className="font-mono">question</code>, {t("live.educatorEditor.csvColQuestion")}</li>
            <li><code className="font-mono">option_a</code> to <code className="font-mono">option_d</code>, {t("live.educatorEditor.csvColOptions")}</li>
            <li><code className="font-mono">correct</code>, {t("live.educatorEditor.csvColCorrect")}</li>
            <li><code className="font-mono">points</code>, {t("live.educatorEditor.csvColPoints")}</li>
            <li><code className="font-mono">seconds</code>, {t("live.educatorEditor.csvColSeconds")}</li>
          </ul>
          <div className="mt-2">
            {t("live.educatorEditor.csvSaveAs")} <strong>CSV UTF-8</strong> {t("live.educatorEditor.csvInExcel")}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pautan muat turun kekal <a> biasa: ini fail API, bukan laluan aplikasi. */}
          <a
            href="/api/live/quiz-template"
            className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> {t("live.educatorEditor.downloadTemplate")}
          </a>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPilihCsv}
            disabled={csvBusy}
            className="text-xs"
          />
          {csvBusy && <span className="text-xs text-ink-faint">{t("live.educatorEditor.uploading")}</span>}
        </div>
        {csvMsg && (
          <Alert tone={csvMsg.ok ? "success" : "danger"} className="mt-3">{csvMsg.text}</Alert>
        )}
        {csvErrors.length > 0 && (
          <ul className="mt-2 text-xs text-red-700 space-y-1 max-h-48 overflow-auto list-disc ml-4">
            {csvErrors.map((x, i) => (
              <li key={i}>{x.row > 0 ? t("live.educatorEditor.csvRow", { n: x.row }) : ""}{x.message}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHead
          title={
            <span className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" /> {t("live.educatorEditor.aikenTitle")}
            </span>
          }
        />
        <p className="text-[12px] text-ink-faint mt-3 mb-2">
          {t("live.educatorEditor.aikenDesc1")}
          {t("live.educatorEditor.aikenDescMid")}<code className="font-mono bg-gray-100 px-1 rounded">ANSWER:</code>{t("live.educatorEditor.aikenDesc3")}
        </p>
        <Textarea
          className="w-full font-mono text-xs mb-2"
          rows={6}
          placeholder={t("live.educatorEditor.aikenPlaceholder")}
          value={aiken}
          onChange={(e) => setAiken(e.target.value)}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={onImportAiken} disabled={aikenBusy}>
            <Upload className="w-4 h-4" /> {aikenBusy ? t("live.educatorEditor.importing") : t("live.educatorEditor.importLabel")}
          </Button>
          {aikenMsg && (
            <span className={`text-xs ${aikenMsg.ok ? "text-green-600" : "text-red-600"}`}>{aikenMsg.text}</span>
          )}
        </div>
      </Card>
    </Shell>
  );
}