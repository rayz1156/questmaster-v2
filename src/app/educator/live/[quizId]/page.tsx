"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { Plus, Trash2, Play, Upload, Pencil, Check, X, Download, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/lib/supabase";

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
    } catch (e: any) {
      setErr(e.message || "Could not load the quiz.");
    } finally {
      setLoading(false);
    }
  };
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
    } catch (e: any) {
      setErr(e.message || "The question could not be saved.");
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
    } catch (e: any) {
      setErr(e.message || "Update failed.");
    } finally { setBusy(false); }
  };

  const onPadamSoalan = async (s: Soalan) => {
    if (!window.confirm("Delete this question?")) return;
    try {
      await authedFetch("/api/live/questions/" + s.id, { method: "DELETE" });
      await reload();
    } catch (e: any) {
      alert(e.message || "Could not delete the question.");
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
    } catch (e: any) {
      setAikenMsg({ ok: false, text: e.message || "Import failed." });
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
    } catch (e: any) {
      setErr(e.message || "The setting could not be saved.");
      setKuiz(sebelum);
    }
  };

  const onMulaSesi = async () => {
    setErr(null);
    if (soalan.length === 0) { setErr("The quiz needs at least one question."); return; }
    setBusy(true);
    try {
      const json = await authedFetch(`/api/live/quizzes/${quizId}/sessions`, { method: "POST" });
      router.push(`/educator/live/session/${json.data.sessionId}`);
    } catch (e: any) {
      setErr(e.message || "The session could not be started.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-gray-500">Loading…</p>
      </Shell>
    );
  }
  if (!kuiz) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-gray-500">Quiz not found. <Link href="/educator/live" className="text-brand-purple font-semibold">Back →</Link></p>
      </Shell>
    );
  }

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="page-title">{kuiz.title}</h2>
          {kuiz.description && <p className="text-xs text-gray-500">{kuiz.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/educator/live" className="text-xs text-gray-500 hover:text-gray-800">← All quizzes</Link>
          <button onClick={onMulaSesi} disabled={busy} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
            <Play className="w-4 h-4" /> Start session
          </button>
        </div>
      </div>

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      <div className="card mb-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={kuiz.streak_bonus !== false}
            onChange={(e) => onTukarStreak(e.target.checked)}
            className="rounded"
          />
          Answer streak bonus
        </label>
        <p className="text-xs text-gray-500 mt-1">
          Extra points for correct answers back to back: +100 on the second in a row, +200 on the
          third, rising to +500. A wrong answer, a skipped question or running out of time resets
          the streak. The setting is fixed when a session starts, so changing it mid-game is safe.
        </p>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Questions ({soalan.length})</h3>
        <button onClick={() => setShowNew((s) => !s)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
          <Plus className="w-4 h-4" /> New Question
        </button>
      </div>

      {showNew && (
        <div className="card mb-4">
          <div className="font-semibold mb-2">Add a question</div>
          <textarea className="input w-full mb-2" rows={2} placeholder="Question text" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="space-y-2 mb-2">
            {opts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs shrink-0">
                  <input type="radio" name="kunci-baharu" checked={kunci === HURUF[i]} onChange={() => setKunci(HURUF[i])} className="rounded" />
                  <span className="font-semibold">{HURUF[i]}.</span>
                </label>
                <input
                  className="input w-full"
                  placeholder={`Option ${HURUF[i]} text`}
                  value={o.text}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                {opts.length > 2 && (
                  <button type="button" title="Remove option" onClick={() => setOpts(opts.filter((_, j) => j !== i).map((x, j) => ({ key: HURUF[j], text: x.text })))} className="text-red-600 hover:bg-red-50 rounded px-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {opts.length < 6 && (
            <button type="button" onClick={() => setOpts([...opts, { key: HURUF[opts.length], text: "" }])} className="text-xs text-blue-600 mb-3">
              + Add option
            </button>
          )}
          <div className="flex items-center gap-3 mb-1 text-xs text-gray-600 flex-wrap">
            <label className="flex items-center gap-1">Points: <input type="number" min={1} className="input w-20" value={points} onChange={(e) => setPoints(Number(e.target.value) || 1000)} /></label>
            <label className="flex items-center gap-1">{kiraDetik ? "Time (seconds):" : "Pace (seconds):"} <input type="number" min={5} className="input w-20" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) || 20)} /></label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={kiraDetik} onChange={(e) => setKiraDetik(e.target.checked)} className="rounded" />
              Countdown
            </label>
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={mataBerganda} onChange={(e) => setMataBerganda(e.target.checked)} className="rounded" />
              Double points
            </label>
          </div>
          <p className="text-[11px] text-gray-500 mb-2">
            {kiraDetik
              ? "Players see a clock. Answering at once earns the full points, answering on the last second earns half, and answers after time is up earn none."
              : "No clock and no cut-off. Points still fall the longer a player takes, easing toward half, so faster answers always score higher."}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Cancel</button>
            <button type="button" disabled={busy} onClick={onTambah} className="btn-primary py-1.5 px-3 text-sm">{busy ? "Saving…" : "Save question"}</button>
          </div>
        </div>
      )}

      {soalan.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">No questions yet. Add one by hand, or upload a CSV file below.</p>
      ) : (
        <div className="space-y-3 mb-6">
          {soalan.map((s, idx) => (
            <div key={s.id} className="card">
              {editId === s.id ? (
                <>
                  <textarea className="input w-full mb-2" rows={2} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
                  <div className="space-y-2 mb-2">
                    {editOpts.map((o, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs shrink-0">
                          <input type="radio" name={`kunci-sunting-${s.id}`} checked={editKunci === o.key} onChange={() => setEditKunci(o.key)} className="rounded" />
                          <span className="font-semibold">{o.key}.</span>
                        </label>
                        <input
                          className="input w-full"
                          value={o.text}
                          onChange={(e) => setEditOpts(editOpts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mb-2 text-xs text-gray-600 flex-wrap">
                    <label className="flex items-center gap-1">Points: <input type="number" min={1} className="input w-20" value={editPoints} onChange={(e) => setEditPoints(Number(e.target.value) || 1000)} /></label>
                    <label className="flex items-center gap-1">{editKira ? "Time (seconds):" : "Pace (seconds):"} <input type="number" min={5} className="input w-20" value={editTime} onChange={(e) => setEditTime(Number(e.target.value) || 20)} /></label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={editKira} onChange={(e) => setEditKira(e.target.checked)} className="rounded" />
                      Countdown
                    </label>
                    <label className="flex items-center gap-1">
                      <input type="checkbox" checked={editBerganda} onChange={(e) => setEditBerganda(e.target.checked)} className="rounded" />
                      Double points
                    </label>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setEditId(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Cancel</button>
                    <button onClick={onSimpanSunting} disabled={busy} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1"><Check className="w-4 h-4" /> Save</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-semibold text-gray-400 mt-1">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{s.prompt}</div>
                      <div className="text-xs text-gray-500 mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                        {s.options.map((o) => (
                          <span key={o.key} className={o.key === s.correct_key ? "font-semibold text-green-700" : ""}>
                            {o.key}. {o.text}{o.key === s.correct_key ? " ✓" : ""}
                          </span>
                        ))}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {s.points} points{s.double_points ? " × 2" : ""} ·{" "}
                        {s.use_countdown === false
                          ? `no countdown, pace ${s.time_limit_sec}s`
                          : `${s.time_limit_sec}s countdown`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => mulaSunting(s)} title="Edit question" className="text-gray-600 hover:bg-gray-100 rounded-lg px-2 py-1"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => onPadamSoalan(s)} title="Delete question" className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card mb-4">
        <div className="font-semibold mb-1 flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-violet-600" /> Upload questions from a CSV file
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Download the template, type one question per row, then upload the file here. Every
          question is added to the end of this quiz. If any row is wrong, nothing is imported and
          the problem rows are listed below.
        </p>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-3 text-xs text-gray-700">
          <div className="font-semibold mb-1">Columns</div>
          <ul className="list-disc ml-4 space-y-0.5">
            <li><code className="font-mono">question</code> — the question text</li>
            <li><code className="font-mono">option_a</code> to <code className="font-mono">option_d</code> — the choices. At least A and B are needed, filled in order.</li>
            <li><code className="font-mono">correct</code> — the letter of the right answer, A to D</li>
            <li><code className="font-mono">points</code> — optional, 1 to 10000. Blank means 1000.</li>
            <li><code className="font-mono">seconds</code> — optional, 5 to 300. Blank means 20.</li>
          </ul>
          <div className="mt-2">
            Save the file as <strong>CSV UTF-8</strong> in Excel, and keep the header row exactly as
            it comes in the template. Up to 100 questions per upload.
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
          {csvBusy && <span className="text-xs text-gray-500">Uploading…</span>}
        </div>
        {csvMsg && (
          <div className={`mt-3 text-sm rounded-lg px-3 py-2 ${csvMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {csvMsg.text}
          </div>
        )}
        {csvErrors.length > 0 && (
          <ul className="mt-2 text-xs text-red-700 space-y-1 max-h-48 overflow-auto list-disc ml-4">
            {csvErrors.map((x, i) => (
              <li key={i}>{x.row > 0 ? `Row ${x.row}: ` : ""}{x.message}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <div className="font-semibold mb-1 flex items-center gap-2"><Upload className="w-4 h-4 text-indigo-600" /> Import Aiken format</div>
        <p className="text-xs text-gray-500 mb-2">
          Paste questions in Aiken format. Separate every question with a blank line.
          The <code className="font-mono bg-gray-100 px-1 rounded">ANSWER:</code> line sets the correct answer.
        </p>
        <textarea
          className="input w-full font-mono text-xs mb-2"
          rows={6}
          placeholder={"What is the capital of Malaysia?\nA. Johor Bahru\nB. Kuala Lumpur\nC. Ipoh\nANSWER: B"}
          value={aiken}
          onChange={(e) => setAiken(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button onClick={onImportAiken} disabled={aikenBusy} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
            <Upload className="w-4 h-4" /> {aikenBusy ? "Importing…" : "Import"}
          </button>
          {aikenMsg && (
            <span className={`text-xs ${aikenMsg.ok ? "text-green-600" : "text-red-600"}`}>{aikenMsg.text}</span>
          )}
        </div>
      </div>
    </Shell>
  );
}
