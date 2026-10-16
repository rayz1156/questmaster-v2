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
import { RACE_DEFAULT_MINUTES, sahMinitLumba, type TahapRaksasa } from "@/lib/lumba-laju";
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

  const reload = async () => {
    try {
      const json = await authedFetch("/api/live/quizzes/" + quizId);
      setKuiz(json.data.quiz);
      setSoalan(json.data.questions || []);
    } catch (e) {
      setErr(mesejRalat(e, "Could not load the quiz."));
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (quizId) reload(); }, [quizId]);

  const onTambah = async () => {
    setErr(null);
    const bersih = opts.map((o, i) => ({ key: HURUF[i], text: o.text.trim() })).filter((o) => o.text);
    if (!prompt.trim()) { setErr("A question is required."); return; }
    if (bersih.length < 2) { setErr("At least two options must be filled in."); return; }
    if (!bersih.some((o) => o.key === kunci)) { setErr("The answer key must be one of the options."); return; }
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
      setErr(mesejRalat(e, "The question could not be saved."));
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
      setErr("A question, at least two options and a valid answer key are required.");
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
      setErr(mesejRalat(e, "Update failed."));
    } finally { setBusy(false); }
  };

  const onPadamSoalan = async (s: Soalan) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await authedFetch("/api/live/questions/" + s.id, { method: "DELETE" });
      await reload();
    } catch (e) {
      alert(mesejRalat(e, "Could not delete the question."));
    }
  };

  const onImportAiken = async () => {
    setAikenMsg(null);
    if (!aiken.trim()) { setAikenMsg({ ok: false, text: "Paste the Aiken content first." }); return; }
    setAikenBusy(true);
    try {
      const json = await authedFetch(`/api/live/quizzes/${quizId}/import-aiken`, {
        method: "POST",
        body: JSON.stringify({ content: aiken }),
      });
      setAikenMsg({ ok: true, text: `${json.created} questions imported, ${json.skipped} blocks skipped.` });
      setAiken("");
      await reload();
    } catch (e) {
      setAikenMsg({ ok: false, text: mesejRalat(e, "Import failed.") });
    } finally { setAikenBusy(false); }
  };

  /** Baca fail CSV di klien, hantar sebagai teks, papar ralat per baris. */
  const onPilihCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvMsg(null);
    setCsvErrors([]);
    if (file.size > 500000) {
      setCsvMsg({ ok: false, text: "That file is too large. The limit is about 500 KB." });
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
        setCsvMsg({ ok: false, text: j.error || "The file could not be imported." });
        return;
      }
      setCsvMsg({ ok: true, text: `${j.created} questions imported from ${file.name}.` });
      await reload();
    } catch {
      setCsvMsg({ ok: false, text: "The file could not be read. Save it again as CSV UTF-8." });
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
      setErr(mesejRalat(e, "The setting could not be saved."));
      setKuiz(sebelum);
    }
  };

  const onMulaSesi = async () => {
    setErr(null);
    if (soalan.length === 0) { setErr("The quiz needs at least one question."); return; }
    // KZ-012: Speed Race perlu minit yang sah sebelum sesi dicipta.
    // KZ-013: Boss Battle juga menggunakan raceMinutes dan menambah bossLevel.
    const minit = sahMinitLumba(minitTeks);
    if ((modPilih === "race" || modPilih === "boss") && minit === null) return;
    setBusy(true);
    try {
      const badan =
        modPilih === "race"
          ? { mode: "race", raceMinutes: minit }
          : modPilih === "boss"
            ? { mode: "boss", raceMinutes: minit, bossLevel: tahapPilih }
            : { mode: "classic" };
      const json = await authedFetch(`/api/live/quizzes/${quizId}/sessions`, {
        method: "POST",
        body: JSON.stringify(badan),
      });
      router.push(`/educator/live/session/${json.data.sessionId}`);
    } catch (e) {
      setErr(mesejRalat(e, "The session could not be started."));
      setBusy(false);
    }
  };

  // Panel pilihan mod (KZ-012, KZ-013).
  const [panelMula, setPanelMula] = useState(false);
  const [modPilih, setModPilih] = useState<"classic" | "race" | "boss">("classic");
  const [minitTeks, setMinitTeks] = useState(String(RACE_DEFAULT_MINUTES));
  const [tahapPilih, setTahapPilih] = useState<TahapRaksasa>("medium");

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-ink-muted">Loading…</p>
      </Shell>
    );
  }
  if (!kuiz) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-ink-muted">Quiz not found. <Link href="/educator/live" className="text-brand-purple font-semibold">Back →</Link></p>
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
              placeholder={`Option ${senarai[i].key} text`}
              value={o.text}
              onChange={(e) => setSenarai(senarai.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
            />
          </div>
          {bolehBuang && senarai.length > 2 && (
            <Button
              variant="icon"
              size="sm"
              title="Remove option"
              ariaLabel="Remove option"
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
        crumb="Live Quiz"
        name={kuiz.title}
        description={kuiz.description || undefined}
        secondaryActions={[{ label: "All quizzes", icon: <ArrowLeft className="w-4 h-4" />, href: "/educator/live" }]}
        primaryAction={{
          label: "Start session",
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
          busy={busy}
          onMula={onMulaSesi}
          onBatal={() => setPanelMula(false)}
        />
      )}

      {err && <Alert tone="danger" className="mb-4">{err}</Alert>}

      <Card className="mb-4">
        <CheckRadio
          label="Answer streak bonus"
          checked={kuiz.streak_bonus !== false}
          onChange={(e) => onTukarStreak(e.target.checked)}
        />
        <p className="text-[12px] text-ink-faint mt-2">
          Extra points for correct answers back to back: +100 on the second in a row, +200 on the
          third, rising to +500. A wrong answer, a skipped question or running out of time resets
          the streak. The setting is fixed when a session starts, so changing it mid-game is safe.
        </p>
      </Card>

      <div className="flex items-center justify-between mb-2 gap-2">
        <h3 className="text-[14px] font-bold text-ink">Questions ({soalan.length})</h3>
        <Button onClick={() => setShowNew((s) => !s)}>
          <Plus className="w-4 h-4" /> New Question
        </Button>
      </div>

      {showNew && (
        <Card className="mb-4">
          <CardHead title="Add a question" />
          <div className="mt-4 space-y-4">
            <Field label="Question" htmlFor="soalan-baharu">
              <Textarea
                id="soalan-baharu"
                rows={2}
                placeholder="Question text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
            <Field label="Options" note="Pick the circle beside the correct answer.">
              {barisPilihan(opts, setOpts, kunci, setKunci, "kunci-baharu", true)}
            </Field>
            {opts.length < 6 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-brand-purple"
                onClick={() => setOpts([...opts, { key: HURUF[opts.length], text: "" }])}
              >
                + Add option
              </Button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Points" htmlFor="soalan-baharu-mata">
                <Input
                  id="soalan-baharu-mata"
                  type="number"
                  min={1}
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value) || 1000)}
                />
              </Field>
              <Field label={kiraDetik ? "Time (seconds)" : "Pace (seconds)"} htmlFor="soalan-baharu-masa">
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
              <CheckRadio label="Countdown" checked={kiraDetik} onChange={(e) => setKiraDetik(e.target.checked)} />
              <CheckRadio label="Double points" checked={mataBerganda} onChange={(e) => setMataBerganda(e.target.checked)} />
            </div>
            <p className="text-[12px] text-ink-faint">
              {kiraDetik
                ? "Players see a clock. Answering at once earns the full points, answering on the last second earns half, and answers after time is up earn none."
                : "No clock and no cut-off. Points still fall the longer a player takes, easing toward half, so faster answers always score higher."}
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button disabled={busy} onClick={onTambah}>{busy ? "Saving…" : "Save question"}</Button>
            </div>
          </div>
        </Card>
      )}

      {soalan.length === 0 ? (
        <div className="mb-4">
          <EmptyState
            icon={<Plus className="w-6 h-6" />}
            title="No questions yet"
            text="Add one by hand, or upload a CSV file below."
          />
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {soalan.map((s, idx) => (
            <Card key={s.id}>
              {editId === s.id ? (
                <div className="space-y-4">
                  <Field label="Question" htmlFor={`sunting-${s.id}-prompt`}>
                    <Textarea
                      id={`sunting-${s.id}-prompt`}
                      rows={2}
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                    />
                  </Field>
                  <Field label="Options" note="Pick the circle beside the correct answer.">
                    {barisPilihan(editOpts, setEditOpts, editKunci, setEditKunci, `kunci-sunting-${s.id}`, false)}
                  </Field>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Points" htmlFor={`sunting-${s.id}-mata`}>
                      <Input
                        id={`sunting-${s.id}-mata`}
                        type="number"
                        min={1}
                        value={editPoints}
                        onChange={(e) => setEditPoints(Number(e.target.value) || 1000)}
                      />
                    </Field>
                    <Field label={editKira ? "Time (seconds)" : "Pace (seconds)"} htmlFor={`sunting-${s.id}-masa`}>
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
                    <CheckRadio label="Countdown" checked={editKira} onChange={(e) => setEditKira(e.target.checked)} />
                    <CheckRadio label="Double points" checked={editBerganda} onChange={(e) => setEditBerganda(e.target.checked)} />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setEditId(null)} disabled={busy}>Cancel</Button>
                    <Button onClick={onSimpanSunting} disabled={busy}><Check className="w-4 h-4" /> Save</Button>
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
                      {s.points} points{s.double_points ? " × 2" : ""} ·{" "}
                      {s.use_countdown === false
                        ? `no countdown, pace ${s.time_limit_sec}s`
                        : `${s.time_limit_sec}s countdown`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="icon"
                      size="sm"
                      title="Edit question"
                      ariaLabel="Edit question"
                      onClick={() => mulaSunting(s)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="icon"
                      size="sm"
                      title="Delete question"
                      ariaLabel="Delete question"
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
              <FileSpreadsheet className="w-4 h-4 text-violet-600" /> Upload questions from a CSV file
            </span>
          }
        />
        <p className="text-[12px] text-ink-faint mt-3 mb-3">
          Download the template, type one question per row, then upload the file here. Every
          question is added to the end of this quiz. If any row is wrong, nothing is imported and
          the problem rows are listed below.
        </p>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-3 text-xs text-gray-700">
          <div className="font-semibold mb-1">Columns</div>
          <ul className="list-disc ml-4 space-y-0.5">
            <li><code className="font-mono">question</code>, the question text</li>
            <li><code className="font-mono">option_a</code> to <code className="font-mono">option_d</code>, the choices. At least A and B are needed, filled in order.</li>
            <li><code className="font-mono">correct</code>, the letter of the right answer, A to D</li>
            <li><code className="font-mono">points</code>, optional, 1 to 10000. Blank means 1000.</li>
            <li><code className="font-mono">seconds</code>, optional, 5 to 300. Blank means 20.</li>
          </ul>
          <div className="mt-2">
            Save the file as <strong>CSV UTF-8</strong> in Excel, and keep the header row exactly as
            it comes in the template. Up to 100 questions per upload.
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pautan muat turun kekal <a> biasa: ini fail API, bukan laluan aplikasi. */}
          <a
            href="/api/live/quiz-template"
            className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
          >
            <Download className="w-4 h-4" /> Download template
          </a>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPilihCsv}
            disabled={csvBusy}
            className="text-xs"
          />
          {csvBusy && <span className="text-xs text-ink-faint">Uploading…</span>}
        </div>
        {csvMsg && (
          <Alert tone={csvMsg.ok ? "success" : "danger"} className="mt-3">{csvMsg.text}</Alert>
        )}
        {csvErrors.length > 0 && (
          <ul className="mt-2 text-xs text-red-700 space-y-1 max-h-48 overflow-auto list-disc ml-4">
            {csvErrors.map((x, i) => (
              <li key={i}>{x.row > 0 ? `Row ${x.row}: ` : ""}{x.message}</li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardHead
          title={
            <span className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" /> Import Aiken format
            </span>
          }
        />
        <p className="text-[12px] text-ink-faint mt-3 mb-2">
          Paste questions in Aiken format. Separate every question with a blank line.
          The <code className="font-mono bg-gray-100 px-1 rounded">ANSWER:</code> line sets the correct answer.
        </p>
        <Textarea
          className="w-full font-mono text-xs mb-2"
          rows={6}
          placeholder={"What is the capital of Malaysia?\nA. Johor Bahru\nB. Kuala Lumpur\nC. Ipoh\nANSWER: B"}
          value={aiken}
          onChange={(e) => setAiken(e.target.value)}
        />
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={onImportAiken} disabled={aikenBusy}>
            <Upload className="w-4 h-4" /> {aikenBusy ? "Importing…" : "Import"}
          </Button>
          {aikenMsg && (
            <span className={`text-xs ${aikenMsg.ok ? "text-green-600" : "text-red-600"}`}>{aikenMsg.text}</span>
          )}
        </div>
      </Card>
    </Shell>
  );
}