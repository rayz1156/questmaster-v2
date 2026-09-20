"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { Plus, Trash2, Play, Upload, Pencil, Check, X } from "lucide-react";
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
}
interface Kuiz { id: string; title: string; description: string | null }

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
  if (!res.ok) throw new Error(json.error || "Permintaan gagal.");
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
  const [busy, setBusy] = useState(false);

  // Suntingan soalan sedia ada
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editOpts, setEditOpts] = useState<Pilihan[]>([]);
  const [editKunci, setEditKunci] = useState("");
  const [editPoints, setEditPoints] = useState(1000);
  const [editTime, setEditTime] = useState(20);

  // Import Aiken
  const [aiken, setAiken] = useState("");
  const [aikenBusy, setAikenBusy] = useState(false);
  const [aikenMsg, setAikenMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => {
    try {
      const json = await authedFetch("/api/live/quizzes/" + quizId);
      setKuiz(json.data.quiz);
      setSoalan(json.data.questions || []);
    } catch (e: any) {
      setErr(e.message || "Gagal memuat kuiz.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (quizId) reload(); }, [quizId]);

  const onTambah = async () => {
    setErr(null);
    const bersih = opts.map((o, i) => ({ key: HURUF[i], text: o.text.trim() })).filter((o) => o.text);
    if (!prompt.trim()) { setErr("Soalan diperlukan."); return; }
    if (bersih.length < 2) { setErr("Sekurang-kurangnya dua pilihan perlu diisi."); return; }
    if (!bersih.some((o) => o.key === kunci)) { setErr("Kunci jawapan mesti salah satu pilihan."); return; }
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
        }),
      });
      setPrompt(""); setOpts([{ key: "A", text: "" }, { key: "B", text: "" }, { key: "C", text: "" }, { key: "D", text: "" }]);
      setKunci("A"); setPoints(1000); setTimeLimit(20); setShowNew(false);
      await reload();
    } catch (e: any) {
      setErr(e.message || "Soalan tidak dapat disimpan.");
    } finally { setBusy(false); }
  };

  const mulaSunting = (s: Soalan) => {
    setEditId(s.id);
    setEditPrompt(s.prompt);
    setEditOpts(s.options.map((o) => ({ ...o })));
    setEditKunci(s.correct_key);
    setEditPoints(s.points);
    setEditTime(s.time_limit_sec);
  };

  const onSimpanSunting = async () => {
    if (!editId) return;
    setErr(null);
    const bersih = editOpts.map((o) => ({ key: o.key, text: o.text.trim() })).filter((o) => o.text);
    if (!editPrompt.trim() || bersih.length < 2 || !bersih.some((o) => o.key === editKunci)) {
      setErr("Soalan, sekurang-kurangnya dua pilihan dan kunci yang sah diperlukan.");
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
        }),
      });
      setEditId(null);
      await reload();
    } catch (e: any) {
      setErr(e.message || "Kemas kini gagal.");
    } finally { setBusy(false); }
  };

  const onPadamSoalan = async (s: Soalan) => {
    if (!window.confirm("Padam soalan ini?")) return;
    try {
      await authedFetch("/api/live/questions/" + s.id, { method: "DELETE" });
      await reload();
    } catch (e: any) {
      alert(e.message || "Gagal memadam soalan.");
    }
  };

  const onImportAiken = async () => {
    setAikenMsg(null);
    if (!aiken.trim()) { setAikenMsg({ ok: false, text: "Tampal kandungan Aiken dahulu." }); return; }
    setAikenBusy(true);
    try {
      const json = await authedFetch(`/api/live/quizzes/${quizId}/import-aiken`, {
        method: "POST",
        body: JSON.stringify({ content: aiken }),
      });
      setAikenMsg({ ok: true, text: `${json.created} soalan berjaya diimport, ${json.skipped} blok dilangkau.` });
      setAiken("");
      await reload();
    } catch (e: any) {
      setAikenMsg({ ok: false, text: e.message || "Import gagal." });
    } finally { setAikenBusy(false); }
  };

  const onMulaSesi = async () => {
    setErr(null);
    if (soalan.length === 0) { setErr("Kuiz mesti ada sekurang-kurangnya satu soalan."); return; }
    setBusy(true);
    try {
      const json = await authedFetch(`/api/live/quizzes/${quizId}/sessions`, { method: "POST" });
      router.push(`/educator/live/session/${json.data.sessionId}`);
    } catch (e: any) {
      setErr(e.message || "Sesi tidak dapat dimulakan.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-gray-500">Memuat…</p>
      </Shell>
    );
  }
  if (!kuiz) {
    return (
      <Shell tabs={EDU_TABS}>
        <p className="text-sm text-gray-500">Kuiz tidak dijumpai. <Link href="/educator/live" className="text-brand-purple font-semibold">Kembali →</Link></p>
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
          <Link href="/educator/live" className="text-xs text-gray-500 hover:text-gray-800">← Semua kuiz</Link>
          <button onClick={onMulaSesi} disabled={busy} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
            <Play className="w-4 h-4" /> Mula sesi
          </button>
        </div>
      </div>

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Soalan ({soalan.length})</h3>
        <button onClick={() => setShowNew((s) => !s)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
          <Plus className="w-4 h-4" /> Soalan Baharu
        </button>
      </div>

      {showNew && (
        <div className="card mb-4">
          <div className="font-semibold mb-2">Tambah soalan</div>
          <textarea className="input w-full mb-2" rows={2} placeholder="Teks soalan" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="space-y-2 mb-2">
            {opts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs shrink-0">
                  <input type="radio" name="kunci-baharu" checked={kunci === HURUF[i]} onChange={() => setKunci(HURUF[i])} className="rounded" />
                  <span className="font-semibold">{HURUF[i]}.</span>
                </label>
                <input
                  className="input w-full"
                  placeholder={`Teks pilihan ${HURUF[i]}`}
                  value={o.text}
                  onChange={(e) => setOpts(opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                {opts.length > 2 && (
                  <button type="button" title="Buang pilihan" onClick={() => setOpts(opts.filter((_, j) => j !== i).map((x, j) => ({ key: HURUF[j], text: x.text })))} className="text-red-600 hover:bg-red-50 rounded px-1">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {opts.length < 6 && (
            <button type="button" onClick={() => setOpts([...opts, { key: HURUF[opts.length], text: "" }])} className="text-xs text-blue-600 mb-3">
              + Tambah pilihan
            </button>
          )}
          <div className="flex items-center gap-3 mb-2 text-xs text-gray-600">
            <label className="flex items-center gap-1">Mata: <input type="number" min={1} className="input w-20" value={points} onChange={(e) => setPoints(Number(e.target.value) || 1000)} /></label>
            <label className="flex items-center gap-1">Masa (saat): <input type="number" min={5} className="input w-20" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) || 20)} /></label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Batal</button>
            <button type="button" disabled={busy} onClick={onTambah} className="btn-primary py-1.5 px-3 text-sm">{busy ? "Menyimpan…" : "Simpan soalan"}</button>
          </div>
        </div>
      )}

      {soalan.length === 0 ? (
        <p className="text-sm text-gray-500 mb-4">Tiada soalan lagi. Tambah soalan atau import format Aiken di bawah.</p>
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
                  <div className="flex items-center gap-3 mb-2 text-xs text-gray-600">
                    <label className="flex items-center gap-1">Mata: <input type="number" min={1} className="input w-20" value={editPoints} onChange={(e) => setEditPoints(Number(e.target.value) || 1000)} /></label>
                    <label className="flex items-center gap-1">Masa (saat): <input type="number" min={5} className="input w-20" value={editTime} onChange={(e) => setEditTime(Number(e.target.value) || 20)} /></label>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => setEditId(null)} disabled={busy} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Batal</button>
                    <button onClick={onSimpanSunting} disabled={busy} className="btn-primary py-1.5 px-3 text-sm flex items-center gap-1"><Check className="w-4 h-4" /> Simpan</button>
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
                      <div className="text-xs text-gray-400 mt-1">{s.points} mata · {s.time_limit_sec} saat</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => mulaSunting(s)} title="Sunting soalan" className="text-gray-600 hover:bg-gray-100 rounded-lg px-2 py-1"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => onPadamSoalan(s)} title="Padam soalan" className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="font-semibold mb-1 flex items-center gap-2"><Upload className="w-4 h-4 text-indigo-600" /> Import format Aiken</div>
        <p className="text-xs text-gray-500 mb-2">
          Tampal soalan dalam format Aiken. Pisahkan setiap soalan dengan baris kosong.
          Baris <code className="font-mono bg-gray-100 px-1 rounded">ANSWER:</code> menentukan jawapan betul.
        </p>
        <textarea
          className="input w-full font-mono text-xs mb-2"
          rows={6}
          placeholder={"Apakah ibu negara Malaysia?\nA. Johor Bahru\nB. Kuala Lumpur\nC. Ipoh\nANSWER: B"}
          value={aiken}
          onChange={(e) => setAiken(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button onClick={onImportAiken} disabled={aikenBusy} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
            <Upload className="w-4 h-4" /> {aikenBusy ? "Mengimport…" : "Import"}
          </button>
          {aikenMsg && (
            <span className={`text-xs ${aikenMsg.ok ? "text-green-600" : "text-red-600"}`}>{aikenMsg.text}</span>
          )}
        </div>
      </div>
    </Shell>
  );
}
