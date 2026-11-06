'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp, Lightbulb, X } from 'lucide-react';
import type {
  AnswerResponse,
  ArenaAnswer,
  ArenaHint,
  ArenaQType,
  ArenaReveal,
  PublicQuestion,
} from '@/lib/arena/types';

/** Palet avatar (sama seperti ArenaMap). */
export const WARNA_AVATAR = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

/** Label jenis soalan dalam BM. */
export const LABEL_JENIS: Record<ArenaQType, string> = {
  multiple: 'Aneka pilihan',
  subjective: 'Jawapan pendek',
  ox: 'Betul/Salah',
  essay: 'Esei',
  match: 'Padanan',
  order: 'Susunan',
};

/** Ambil mesej ralat daripada badan respons API. */
export function bacaRalat(j: unknown, status: number): string {
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return 'Ralat pelayan (' + status + ')';
}

/** Terjemah ralat API (Inggeris) ke BM. */
export function ralatBM(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already answered')) return 'Anda sudah menjawab soalan ini.';
  if (m.includes('locked')) return 'Soalan ini masih dikunci.';
  if (m.includes('frozen')) return 'Guru sedang membekukan permainan.';
  if (m.includes('time is up')) return 'Masa sudah tamat.';
  if (m.includes('not running')) return 'Permainan belum bermula atau sudah tamat.';
  if (m.includes('nickname taken')) return 'Nama samaran sudah digunakan. Pilih nama lain.';
  if (m.includes('session ended')) return 'Sesi ini sudah tamat.';
  if (m.includes('not found')) return 'Kod permainan tidak dijumpai.';
  if (m.includes('token')) return 'Sesi pemain tidak sah. Sila masuk semula.';
  return msg;
}

/** Jawapan betul dalam bentuk ayat. */
function teksReveal(q: PublicQuestion, r: ArenaReveal): string {
  switch (r.type) {
    case 'multiple':
      return r.keys.map((k) => q.options?.find((o) => o.key === k)?.text ?? k).join(', ');
    case 'subjective':
      return r.texts.join(' / ');
    case 'ox':
      return r.value === 'o' ? 'Betul (O)' : 'Salah (X)';
    case 'essay':
      return '';
    case 'match':
      return r.pairs
        .map((p) => `${q.left?.find((l) => l.key === p.left)?.text ?? p.left} → ${q.right?.find((x) => x.key === p.right)?.text ?? p.right}`)
        .join('; ');
    case 'order':
      return r.keys.map((k, i) => `${i + 1}. ${q.items?.find((it) => it.key === k)?.text ?? k}`).join('   ');
    default:
      return '';
  }
}

function PaparHint({ hint }: { hint: ArenaHint }) {
  if (hint.type === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={hint.value} alt="Petunjuk" className="mt-2 max-h-48 rounded-lg" />;
  }
  if (hint.type === 'youtube') {
    const url = /^https?:\/\//i.test(hint.value)
      ? hint.value
      : 'https://www.youtube.com/watch?v=' + encodeURIComponent(hint.value);
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-indigo-600 underline">
        Tonton video petunjuk
      </a>
    );
  }
  return <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{hint.value}</p>;
}

interface Props {
  code: string;
  token: string;
  question: PublicQuestion;
  onClose: () => void;
  onAnswered: (r: AnswerResponse) => void;
}

export default function QuestionPopup({ code, token, question, onClose, onAnswered }: Props) {
  const mulaRef = useRef<number>(Date.now());
  const [kini, setKini] = useState<number>(() => Date.now());
  const [pilih, setPilih] = useState<string[]>([]);
  const [teks, setTeks] = useState('');
  const [ox, setOx] = useState<'o' | 'x' | null>(null);
  const [padan, setPadan] = useState<Record<string, string>>({});
  const [susun, setSusun] = useState<string[]>(() => (question.items ?? []).map((it) => it.key));
  const [tunjukHint, setTunjukHint] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);
  const [hasil, setHasil] = useState<AnswerResponse | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setKini(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const had = question.time_limit_sec > 0 ? question.time_limit_sec : 0;
  const baki = had ? Math.max(0, had - (kini - mulaRef.current) / 1000) : 0;
  const maxLen = question.maxLength || 1000;

  function togol(k: string) {
    if (question.multiSelect) setPilih((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
    else setPilih([k]);
  }

  function gerak(i: number, d: -1 | 1) {
    setSusun((s) => {
      const j = i + d;
      const n = s.slice();
      const a = n[i];
      const b = n[j];
      if (a === undefined || b === undefined) return s;
      n[i] = b;
      n[j] = a;
      return n;
    });
  }

  function binaJawapan(): ArenaAnswer | null {
    switch (question.type) {
      case 'multiple':
        return pilih.length ? { type: 'multiple', keys: pilih } : null;
      case 'subjective':
        return teks.trim() ? { type: 'subjective', text: teks.trim() } : null;
      case 'ox':
        return ox ? { type: 'ox', value: ox } : null;
      case 'essay':
        return teks.trim() ? { type: 'essay', text: teks.trim().slice(0, maxLen) } : null;
      case 'match': {
        const pairs: { left: string; right: string }[] = [];
        for (const l of question.left ?? []) {
          const r = padan[l.key];
          if (!r) return null;
          pairs.push({ left: l.key, right: r });
        }
        return pairs.length ? { type: 'match', pairs } : null;
      }
      case 'order':
        return susun.length ? { type: 'order', keys: susun } : null;
      default:
        return null;
    }
  }

  async function hantar() {
    if (sibuk || hasil) return;
    const answer = binaJawapan();
    if (!answer) {
      setRalat('Sila lengkapkan jawapan anda dahulu.');
      return;
    }
    setSibuk(true);
    setRalat(null);
    try {
      const res = await fetch(`/api/arena/play/${code}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-player-token': token },
        body: JSON.stringify({ questionId: question.id, answer, elapsedMs: Date.now() - mulaRef.current }),
      });
      const j: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setRalat(ralatBM(bacaRalat(j, res.status)));
        return;
      }
      setHasil(j as AnswerResponse);
    } catch {
      setRalat('Tiada sambungan internet. Cuba lagi.');
    } finally {
      setSibuk(false);
    }
  }

  function tutup() {
    if (hasil) onAnswered(hasil);
    onClose();
  }

  const btnPilihan = 'flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left text-base transition';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            {LABEL_JENIS[question.type]} · {question.points} mata
          </span>
          <button type="button" onClick={tutup} aria-label="Tutup" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {had > 0 && !hasil && (
          <div className="mb-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={clsx('h-full transition-all', baki / had > 0.3 ? 'bg-emerald-500' : 'bg-rose-500')}
                style={{ width: `${Math.max(0, Math.min(100, (baki / had) * 100))}%` }}
              />
            </div>
            <div className="mt-1 text-right text-xs text-slate-500">{Math.ceil(baki)} s</div>
          </div>
        )}

        <p className="whitespace-pre-wrap text-lg font-semibold text-slate-900">{question.prompt}</p>

        {question.hint && !hasil && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setTunjukHint((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              <Lightbulb className="h-4 w-4" /> Petunjuk
            </button>
            {tunjukHint && <PaparHint hint={question.hint} />}
          </div>
        )}

        {!hasil && (
          <div className="mt-4 space-y-3">
            {question.type === 'multiple' && (
              <div className="space-y-2">
                {question.multiSelect && <p className="text-xs text-slate-500">Pilih semua jawapan yang betul.</p>}
                {(question.options ?? []).map((o) => {
                  const on = pilih.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role={question.multiSelect ? 'checkbox' : 'radio'}
                      aria-checked={on}
                      onClick={() => togol(o.key)}
                      className={clsx(btnPilihan, on ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white')}
                    >
                      <span
                        className={clsx(
                          'flex h-6 w-6 shrink-0 items-center justify-center border-2',
                          question.multiSelect ? 'rounded-md' : 'rounded-full',
                          on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300',
                        )}
                      >
                        {on ? '✓' : ''}
                      </span>
                      <span className="flex-1">
                        {o.text}
                        {o.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={o.imageUrl} alt="" className="mt-2 max-h-32 rounded-lg" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {question.type === 'subjective' && (
              <input
                value={teks}
                onChange={(e) => setTeks(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void hantar();
                }}
                maxLength={200}
                placeholder="Taip jawapan anda"
                className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base focus:border-indigo-600 focus:outline-none"
              />
            )}

            {question.type === 'ox' && (
              <div className="grid grid-cols-2 gap-3">
                {(['o', 'x'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setOx(v)}
                    className={clsx(
                      'flex flex-col items-center rounded-2xl border-4 py-6 text-white transition',
                      v === 'o' ? 'bg-emerald-500' : 'bg-rose-500',
                      ox === v ? 'border-slate-900 scale-[1.02]' : 'border-transparent opacity-90',
                    )}
                  >
                    <span className="text-5xl font-black">{v === 'o' ? 'O' : 'X'}</span>
                    <span className="mt-1 text-lg font-bold">{v === 'o' ? 'Betul' : 'Salah'}</span>
                  </button>
                ))}
              </div>
            )}

            {question.type === 'essay' && (
              <div>
                <textarea
                  value={teks}
                  onChange={(e) => setTeks(e.target.value.slice(0, maxLen))}
                  maxLength={maxLen}
                  rows={6}
                  placeholder="Tulis jawapan anda"
                  className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-base focus:border-indigo-600 focus:outline-none"
                />
                <div className="text-right text-xs text-slate-500">
                  {teks.length}/{maxLen}
                </div>
              </div>
            )}

            {question.type === 'match' && (
              <div className="space-y-2">
                {(question.left ?? []).map((l) => {
                  const dipakai = new Set(
                    Object.entries(padan)
                      .filter(([k]) => k !== l.key)
                      .map(([, v]) => v),
                  );
                  return (
                    <div key={l.key} className="rounded-xl border-2 border-slate-200 p-3">
                      <div className="font-medium text-slate-800">{l.text}</div>
                      <select
                        value={padan[l.key] ?? ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPadan((p) => ({ ...p, [l.key]: v }));
                        }}
                        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base"
                      >
                        <option value="">— Pilih padanan —</option>
                        {(question.right ?? []).map((r) => (
                          <option key={r.key} value={r.key} disabled={dipakai.has(r.key)}>
                            {r.text}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {question.type === 'order' && (
              <ol className="space-y-2">
                {susun.map((k, i) => (
                  <li key={k} className="flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white p-2">
                    <span className="w-6 text-center font-bold text-slate-500">{i + 1}</span>
                    <span className="flex-1">{question.items?.find((it) => it.key === k)?.text ?? k}</span>
                    <button
                      type="button"
                      onClick={() => gerak(i, -1)}
                      disabled={i === 0}
                      aria-label="Naik"
                      className="rounded-lg bg-slate-100 p-2 disabled:opacity-30"
                    >
                      <ChevronUp className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => gerak(i, 1)}
                      disabled={i === susun.length - 1}
                      aria-label="Turun"
                      className="rounded-lg bg-slate-100 p-2 disabled:opacity-30"
                    >
                      <ChevronDown className="h-5 w-5" />
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {ralat && <p className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{ralat}</p>}

            <button
              type="button"
              onClick={() => void hantar()}
              disabled={sibuk}
              className="w-full rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
            >
              {sibuk ? 'Menghantar…' : 'Hantar'}
            </button>
          </div>
        )}

        {hasil && (
          <div className="mt-4 space-y-3 text-center">
            {hasil.result.pending || hasil.result.isCorrect === null ? (
              <div className="text-2xl font-bold text-amber-600">⏳ Menunggu semakan guru</div>
            ) : hasil.result.isCorrect ? (
              <div className="text-3xl font-extrabold text-emerald-600">Betul! +{hasil.result.score}</div>
            ) : (
              <div className="text-3xl font-extrabold text-rose-600">Salah</div>
            )}
            {hasil.reveal && hasil.reveal.type !== 'essay' && (
              <div className="rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-700">
                <div className="font-semibold">Jawapan betul:</div>
                <div className="mt-1">{teksReveal(question, hasil.reveal)}</div>
              </div>
            )}
            <div className="text-sm text-slate-500">
              Jumlah markah anda: <b className="text-slate-900">{hasil.totalScore}</b>
            </div>
            <button
              type="button"
              onClick={tutup}
              className="w-full rounded-xl bg-slate-900 py-4 text-lg font-bold text-white hover:bg-slate-800"
            >
              Tutup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
