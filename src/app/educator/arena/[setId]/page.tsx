'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import QuestionEditor, { QTYPE_LABEL } from '@/components/arena/QuestionEditor';
import { ARENA_MAPS } from '@/lib/arena/maps';
import { ARENA_QTYPES, DEFAULT_SET_SETTINGS } from '@/lib/arena/types';
import type {
  AnswerRevealMode, ArenaMode, ArenaQType, ArenaQuestion, ArenaQuestionInput,
  ArenaSession, ArenaSet, ArenaSetSettings, ArenaView,
} from '@/lib/arena/types';

class ApiError extends Error {
  status: number;
  /** Badan JSON asal balasan ralat, contoh {errors:[{row,message}]}. */
  body: unknown;
  constructor(msg: string, status: number, body?: unknown) { super(msg); this.status = status; this.body = body; }
}

function errText(j: unknown, status: number): string {
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return 'Ralat ' + status;
}

// panggil API dengan token sesi semasa (auto-refresh oleh supabase-js)
async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError('Sila log masuk semula.', 401);
  const headers: Record<string, string> = { Authorization: 'Bearer ' + session.access_token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errText(json, res.status), res.status, json);
  return json as T;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const toInput = (q: ArenaQuestion): ArenaQuestionInput => ({
  type: q.type, prompt: q.prompt, data: q.data, hint: q.hint, points: q.points, time_limit_sec: q.time_limit_sec, origin: q.origin,
});

const MODES: { id: ArenaMode; label: string }[] = [
  { id: 'sequencing', label: 'Ikut turutan' },
  { id: 'freestyle', label: 'Bebas' },
  { id: 'round', label: 'Pusingan (serentak)' },
  { id: 'team', label: 'Pasukan' },
  { id: 'coop', label: 'Kerjasama' },
];
const STATUS_LABEL: Record<string, string> = { lobby: 'Lobi', playing: 'Sedang main', ended: 'Tamat' };

const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none';
const btn = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50';
const smallBtn = 'rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 disabled:opacity-40';

export default function ArenaSetEditorPage({ params }: { params: { setId: string } }) {
  const setId = params.setId;
  const router = useRouter();
  const [set, setSet] = useState<ArenaSet | null>(null);
  const [questions, setQuestions] = useState<ArenaQuestion[]>([]);
  const [sessions, setSessions] = useState<ArenaSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [settings, setSettings] = useState<ArenaSetSettings>(DEFAULT_SET_SETTINGS);
  const [savingSet, setSavingSet] = useState(false);
  const [editing, setEditing] = useState<string | null>(null); // id soalan atau 'new'

  // AI
  const [aiTopic, setAiTopic] = useState('');
  const [aiSource, setAiSource] = useState('');
  const [aiCount, setAiCount] = useState(5);
  const [aiTypes, setAiTypes] = useState<ArenaQType[]>(['multiple', 'ox', 'subjective']);
  const [aiLang, setAiLang] = useState<'ms' | 'en'>('ms');
  const [aiDiff, setAiDiff] = useState<'mudah' | 'sederhana' | 'sukar'>('sederhana');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<ArenaQuestionInput[]>([]);
  const [aiPicked, setAiPicked] = useState<boolean[]>([]);
  const [aiInfo, setAiInfo] = useState<string | null>(null);

  // import soalan (CSV templat, xlsx, Aiken)
  const [impBusy, setImpBusy] = useState(false);
  const [impMsg, setImpMsg] = useState<string | null>(null);
  const [impErr, setImpErr] = useState<string | null>(null);
  const [impRows, setImpRows] = useState<{ row: number; message: string }[] | null>(null);
  const [aikenText, setAikenText] = useState('');

  // mula sesi
  const [mode, setMode] = useState<ArenaMode>('sequencing');
  const [view, setView] = useState<ArenaView>('list');
  const [mapId, setMapId] = useState<string>(ARENA_MAPS[0]?.id ?? 'kampus');
  const [teamCount, setTeamCount] = useState(2);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await call<{ set: ArenaSet; questions: ArenaQuestion[] }>(`/api/arena/sets/${setId}`);
      setSet(d.set);
      setQuestions([...d.questions].sort((a, b) => a.order_idx - b.order_idx));
      setTitle(d.set.title);
      setDescription(d.set.description ?? '');
      setSettings({ ...DEFAULT_SET_SETTINGS, ...d.set.settings });
      const s = await call<{ sessions: ArenaSession[] }>(`/api/arena/sets/${setId}/sessions`);
      setSessions(s.sessions ?? []);
    } catch (e) {
      setError(msg(e));
    }
  }, [setId]);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      await load();
    })();
  }, [load, router]);

  async function saveSet() {
    setSavingSet(true); setNotice(null); setError(null);
    try {
      const r = await call<{ set: ArenaSet }>(`/api/arena/sets/${setId}`, 'PATCH', { title: title.trim(), description: description.trim() || null, settings });
      setSet(r.set);
      setNotice('Tetapan disimpan.');
    } catch (e) { setError(msg(e)); } finally { setSavingSet(false); }
  }

  async function addQuestion(q: ArenaQuestionInput) {
    const r = await call<{ questions: ArenaQuestion[] }>(`/api/arena/sets/${setId}/questions`, 'POST', q);
    setQuestions((prev) => [...prev, ...r.questions]);
    setEditing(null);
  }

  async function updateQuestion(id: string, q: ArenaQuestionInput) {
    const r = await call<{ question: ArenaQuestion }>(`/api/arena/questions/${id}`, 'PATCH', q);
    setQuestions((prev) => prev.map((x) => (x.id === id ? r.question : x)));
    setEditing(null);
  }

  async function deleteQuestion(id: string) {
    if (!window.confirm('Padam soalan ini?')) return;
    try {
      await call(`/api/arena/questions/${id}`, 'DELETE');
      setQuestions((prev) => prev.filter((x) => x.id !== id));
    } catch (e) { setError(msg(e)); }
  }

  async function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestions(next);
    try {
      await call(`/api/arena/sets/${setId}/questions`, 'PUT', { order: next.map((q) => q.id) });
    } catch (e) { setError(msg(e)); void load(); }
  }

  async function generate() {
    if (!aiTopic.trim()) { setAiError('Masukkan topik.'); return; }
    setAiBusy(true); setAiError(null); setAiInfo(null); setAiPreview([]);
    try {
      const r = await call<{ questions: ArenaQuestionInput[]; model: string; rejected: number }>(
        `/api/arena/sets/${setId}/ai-generate`, 'POST',
        { topic: aiTopic.trim(), sourceText: aiSource.trim() || undefined, count: Math.min(20, Math.max(1, aiCount)), types: aiTypes, language: aiLang, difficulty: aiDiff },
      );
      setAiPreview(r.questions);
      setAiPicked(r.questions.map(() => true));
      setAiInfo(`${r.questions.length} soalan dijana oleh ${r.model}${r.rejected ? ` (${r.rejected} ditolak kerana tidak sah)` : ''}.`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) {
        setAiError('Penjanaan AI belum dikonfigurasi pada pelayan (ANTHROPIC_API_KEY belum ditetapkan). Sila hubungi pentadbir. ' + e.message);
      } else setAiError(msg(e));
    } finally { setAiBusy(false); }
  }

  async function saveAi() {
    const chosen = aiPreview.filter((_, i) => aiPicked[i]);
    if (chosen.length === 0) return;
    setAiBusy(true); setAiError(null);
    try {
      const r = await call<{ questions: ArenaQuestion[] }>(`/api/arena/sets/${setId}/questions`, 'POST', { questions: chosen });
      setQuestions((prev) => [...prev, ...r.questions]);
      setAiPreview([]); setAiPicked([]);
      setAiInfo(`${r.questions.length} soalan disimpan.`);
    } catch (e) { setAiError(msg(e)); } finally { setAiBusy(false); }
  }

  // import soalan (KZ-044): xlsx sebagai base64, csv/aiken sebagai teks
  async function doImport(format: 'xlsx' | 'csv' | 'aiken', content: string) {
    setImpBusy(true); setImpErr(null); setImpMsg(null); setImpRows(null);
    try {
      const r = await call<{ created: number; skipped: number }>(`/api/arena/sets/${setId}/import`, 'POST', { format, content });
      setImpMsg(r.created + ' soalan ditambah' + (r.skipped ? `, ${r.skipped} blok Aiken dilangkau` : '') + '.');
      setAikenText('');
      await load(); // muat semula senarai soalan
    } catch (e) {
      const raw = e instanceof ApiError ? e.body : null;
      const errs = raw && typeof raw === 'object' && Array.isArray((raw as { errors?: unknown }).errors)
        ? ((raw as { errors: { row: number; message: string }[] }).errors)
        : null;
      if (errs && errs.length > 0) setImpRows(errs);
      else setImpErr(msg(e));
    } finally { setImpBusy(false); }
  }

  async function importFile(f: File) {
    if (f.size > 2 * 1024 * 1024) { setImpErr('Fail melebihi 2 MB.'); return; }
    if (/\.xlsx$/i.test(f.name)) {
      // .xlsx dibaca sebagai ArrayBuffer lalu base64 (bukan teks)
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      await doImport('xlsx', btoa(bin));
    } else {
      await doImport('csv', await f.text());
    }
  }

  async function importAikenFile(f: File) {
    if (f.size > 2 * 1024 * 1024) { setImpErr('Fail melebihi 2 MB.'); return; }
    setAikenText(await f.text());
  }

  async function startSession() {
    if (questions.length === 0) { setError('Tambah sekurang-kurangnya satu soalan dahulu.'); return; }
    setStarting(true); setError(null);
    try {
      const body: Record<string, unknown> = { mode, view };
      if (view === 'map') body.mapId = mapId;
      if (mode === 'team') body.teamCount = teamCount;
      const r = await call<{ session: ArenaSession }>(`/api/arena/sets/${setId}/sessions`, 'POST', body);
      router.push('/educator/arena/session/' + r.session.id);
    } catch (e) { setError(msg(e)); setStarting(false); }
  }

  const setS = <K extends keyof ArenaSetSettings>(k: K, v: ArenaSetSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  if (!set) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        {error ? <p className="text-red-600">{error}</p> : <p className="text-slate-500">Memuatkan...</p>}
        <Link href="/educator/arena" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">← Kembali</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <Link href="/educator/arena" className="text-sm text-indigo-600 hover:underline">← Kuizen Arena</Link>
        <span className="text-xs text-slate-400">{questions.length} soalan</span>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      {/* maklumat & tetapan set */}
      <section className={card + ' space-y-3'}>
        <input className={inputCls + ' text-lg font-semibold'} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <textarea className={inputCls} rows={2} placeholder="Penerangan (pilihan)" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.allowPass} onChange={(e) => setS('allowPass', e.target.checked)} /> Benarkan langkau soalan</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.shuffleQuestions} onChange={(e) => setS('shuffleQuestions', e.target.checked)} /> Kocok soalan</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.showRanking} onChange={(e) => setS('showRanking', e.target.checked)} /> Tunjuk ranking kepada peserta</label>
          <label className="flex items-center gap-2">Dedah jawapan:
            <select className="rounded-md border border-slate-300 px-2 py-1" value={settings.answerRevealMode} onChange={(e) => setS('answerRevealMode', e.target.value as AnswerRevealMode)}>
              <option value="never">Tidak sekali-kali</option>
              <option value="incorrect_only">Jika salah sahaja</option>
              <option value="always">Sentiasa</option>
            </select>
          </label>
          <label className="flex items-center gap-2">Sasaran Kerjasama (%):
            <input type="number" min={1} max={100} className="w-20 rounded-md border border-slate-300 px-2 py-1" value={settings.coopTargetPct}
              onChange={(e) => setS('coopTargetPct', Math.min(100, Math.max(1, Number(e.target.value) || 70)))} />
          </label>
        </div>
        <div className="flex justify-end">
          <button type="button" className={btn} disabled={savingSet || !title.trim()} onClick={() => void saveSet()}>{savingSet ? 'Menyimpan...' : 'Simpan tetapan'}</button>
        </div>
      </section>

      {/* mula sesi */}
      <section className={card + ' space-y-3 border-emerald-200 bg-emerald-50/40'}>
        <h2 className="font-semibold text-slate-800">Mulakan sesi</h2>
        <div className="grid gap-3 text-sm sm:grid-cols-4">
          <label>Mod
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as ArenaMode)}>
              {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label>Paparan
            <select className={inputCls} value={view} onChange={(e) => setView(e.target.value as ArenaView)}>
              <option value="list">Senarai</option>
              <option value="map">Peta 2D</option>
            </select>
          </label>
          {view === 'map' && (
            <label>Peta
              <select className={inputCls} value={mapId} onChange={(e) => setMapId(e.target.value)}>
                {ARENA_MAPS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
          {mode === 'team' && (
            <label>Bilangan pasukan
              <select className={inputCls} value={teamCount} onChange={(e) => setTeamCount(Number(e.target.value))}>
                {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
        </div>
        <button type="button" className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          disabled={starting} onClick={() => void startSession()}>{starting ? 'Mencipta sesi...' : 'Cipta sesi & buka papan pemuka'}</button>
        {sessions.length > 0 && (
          <div className="pt-2">
            <p className="mb-1 text-xs font-medium uppercase text-slate-500">Sesi terdahulu</p>
            <ul className="space-y-1 text-sm">
              {sessions.map((s) => (
                <li key={s.id}>
                  <Link className="text-indigo-600 hover:underline" href={'/educator/arena/session/' + s.id}>
                    {s.code} · {MODES.find((m) => m.id === s.mode)?.label ?? s.mode} · {STATUS_LABEL[s.status] ?? s.status} · {new Date(s.created_at).toLocaleString('ms-MY')}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* soalan */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Soalan</h2>
          <button type="button" className={btn} onClick={() => setEditing('new')} disabled={editing === 'new'}>+ Tambah soalan</button>
        </div>
        {editing === 'new' && <QuestionEditor onSave={addQuestion} onCancel={() => setEditing(null)} />}
        {questions.length === 0 && editing !== 'new' && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Belum ada soalan. Tambah secara manual atau jana dengan AI.</p>
        )}
        <ol className="space-y-2">
          {questions.map((q, i) => (
            <li key={q.id}>
              {editing === q.id ? (
                <QuestionEditor initial={toInput(q)} onSave={(v) => updateQuestion(q.id, v)} onCancel={() => setEditing(null)} />
              ) : (
                <div className={card + ' flex items-start gap-3'}>
                  <span className="mt-0.5 w-6 text-right text-sm font-semibold text-slate-400">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <span className="mr-2 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">{QTYPE_LABEL[q.type]}</span>
                    {q.origin === 'ai' && <span className="mr-2 inline-block rounded-full bg-fuchsia-100 px-2 py-0.5 text-xs text-fuchsia-700">AI</span>}
                    <span className="text-xs text-slate-500">{q.points} mata · {q.time_limit_sec}s</span>
                    <p className="mt-1 break-words text-sm text-slate-800">{q.prompt}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" className={smallBtn} disabled={i === 0} onClick={() => void move(i, -1)}>↑</button>
                    <button type="button" className={smallBtn} disabled={i === questions.length - 1} onClick={() => void move(i, 1)}>↓</button>
                    <button type="button" className={smallBtn} onClick={() => setEditing(q.id)}>Sunting</button>
                    <button type="button" className={smallBtn + ' text-red-600'} onClick={() => void deleteQuestion(q.id)}>Padam</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* import soalan */}
      <section className={card + ' space-y-3'}>
        <h2 className="font-semibold text-slate-800">Import soalan</h2>
        <p className="text-sm text-slate-600">
          Muat turun templat di bawah, isikan dalam Excel, kemudian muat naik fail .xlsx atau .csv yang sama.
          Templat menyertakan satu contoh bagi setiap jenis. Maksimum 200 soalan setiap import.
        </p>
        <ul className="grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
          <li><b>aneka</b>: pilihan dalam pilihan_a dan seterusnya; jawapan = huruf atau huruf dipisah koma (contoh A,C)</li>
          <li><b>pendek</b>: jawapan yang diterima dipisah dengan | (contoh Hijau|hijau muda)</li>
          <li><b>betul_salah</b>: jawapan Betul atau Salah (juga B/S, O/X, True/False)</li>
          <li><b>esei</b>: jawapan = rubrik gred (pilihan)</li>
          <li><b>padanan</b>: setiap pilihan berbentuk kiri = kanan (2 hingga 5 pasangan)</li>
          <li><b>susunan</b>: pilihan_a hingga pilihan_e dalam turutan yang betul (2 hingga 5 item)</li>
        </ul>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a href="/api/arena/template" className="text-indigo-600 hover:underline">Muat turun templat Excel</a>
          <label className={btn + ' cursor-pointer'}>
            {impBusy ? 'Sedang mengimport...' : 'Muat naik Excel / CSV'}
            <input type="file" accept=".xlsx,.csv" className="hidden" disabled={impBusy}
              onChange={(e) => { const f = e.currentTarget.files?.[0] ?? null; e.currentTarget.value = ''; if (f) void importFile(f); }} />
          </label>
        </div>

        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">Teks Aiken</p>
          <p className="text-xs text-slate-500">Contoh format: satu blok bagi setiap soalan, baris kosong memisahkan blok.</p>
          <pre className="overflow-x-auto rounded bg-white p-2 text-xs text-slate-600 ring-1 ring-slate-200">{'Berapakah 2 + 2?\nA. 3\nB. 4\nANSWER: B'}</pre>
          <textarea className={inputCls} rows={4} placeholder="Tampal soalan format Aiken di sini"
            value={aikenText} onChange={(e) => setAikenText(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <label className={smallBtn + ' cursor-pointer font-semibold'}>
              Muat naik fail Aiken (.txt)
              <input type="file" accept=".txt,.text" className="hidden" disabled={impBusy}
                onChange={(e) => { const f = e.currentTarget.files?.[0] ?? null; e.currentTarget.value = ''; if (f) void importAikenFile(f); }} />
            </label>
            <button type="button" className={btn} disabled={impBusy || !aikenText.trim()} onClick={() => void doImport('aiken', aikenText)}>
              Import Aiken
            </button>
          </div>
        </div>

        {impMsg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{impMsg}</p>}
        {impErr && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{impErr}</p>}
        {impRows && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <p className="font-medium">Tiada soalan diimport. Baiki baris berikut dan muat naik semula:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {impRows.map((r, i) => (
                <li key={i}>Baris {r.row}: {r.message}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* AI */}
      <section className={card + ' space-y-3 border-fuchsia-200 bg-fuchsia-50/30'}>
        <h2 className="font-semibold text-slate-800">Jana dengan AI (Claude)</h2>
        <input className={inputCls} placeholder="Topik, cth. Fotosintesis" value={aiTopic} onChange={(e) => setAiTopic(e.target.value)} />
        <textarea className={inputCls} rows={3} placeholder="Teks sumber (pilihan): tampal nota atau petikan" value={aiSource} onChange={(e) => setAiSource(e.target.value)} />
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <label>Bilangan (1-20)
            <input type="number" min={1} max={20} className={inputCls} value={aiCount} onChange={(e) => setAiCount(Number(e.target.value) || 1)} />
          </label>
          <label>Bahasa
            <select className={inputCls} value={aiLang} onChange={(e) => setAiLang(e.target.value as 'ms' | 'en')}>
              <option value="ms">Bahasa Melayu</option>
              <option value="en">English</option>
            </select>
          </label>
          <label>Kesukaran
            <select className={inputCls} value={aiDiff} onChange={(e) => setAiDiff(e.target.value as 'mudah' | 'sederhana' | 'sukar')}>
              <option value="mudah">Mudah</option>
              <option value="sederhana">Sederhana</option>
              <option value="sukar">Sukar</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {ARENA_QTYPES.map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input type="checkbox" checked={aiTypes.includes(t)}
                onChange={(e) => setAiTypes((prev) => (e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)))} />
              {QTYPE_LABEL[t]}
            </label>
          ))}
        </div>
        <button type="button" className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-700 disabled:opacity-50"
          disabled={aiBusy || aiTypes.length === 0} onClick={() => void generate()}>{aiBusy ? 'Sedang menjana...' : 'Jana soalan'}</button>
        {aiError && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{aiError}</p>}
        {aiInfo && <p className="text-sm text-slate-600">{aiInfo}</p>}
        {aiPreview.length > 0 && (
          <div className="space-y-2">
            <ul className="space-y-2">
              {aiPreview.map((q, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                  <input type="checkbox" className="mt-1" checked={aiPicked[i] ?? false}
                    onChange={(e) => setAiPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))} />
                  <div className="text-sm">
                    <span className="mr-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{QTYPE_LABEL[q.type]}</span>
                    {q.prompt}
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className={btn} disabled={aiBusy || !aiPicked.some(Boolean)} onClick={() => void saveAi()}>
              Simpan yang dipilih ({aiPicked.filter(Boolean).length})
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
