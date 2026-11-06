'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import type { ArenaPlayerPublic, ArenaQType, ArenaSession, ArenaSetSettings, PresenceStatus } from '@/lib/arena/types';

interface AnswerRow {
  id: string; player_id: string; question_id: string; is_correct: boolean | null; score: number;
  elapsed_ms: number | null; created_at: string; answer: unknown | null;
}
interface SessionDetail {
  session: ArenaSession;
  set: { id: string; title: string; settings: ArenaSetSettings };
  questions: { id: string; order_idx: number; type: ArenaQType; prompt: string; points: number }[];
  players: (ArenaPlayerPublic & { joined_at: string })[];
  answers: AnswerRow[];
  teams: { team: number; score: number }[];
  coop: { total: number; target: number } | null;
}
type Action = 'start' | 'end' | 'freeze' | 'unfreeze' | 'next' | 'prev' | 'restart' | 'set_time_limit';

function errText(j: unknown, status: number): string {
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return 'Ralat ' + status;
}

async function call<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Sila log masuk semula.');
  const headers: Record<string, string> = { Authorization: 'Bearer ' + session.access_token };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errText(json, res.status));
  return json as T;
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const PRESENCE_DOT: Record<PresenceStatus, string> = { online: 'bg-emerald-500', away: 'bg-amber-400', offline: 'bg-slate-300' };
const TEAM_COLOR = ['bg-sky-500', 'bg-rose-500', 'bg-amber-500', 'bg-violet-500'];
const STATUS: Record<string, { label: string; cls: string }> = {
  lobby: { label: 'Lobi', cls: 'bg-slate-200 text-slate-700' },
  playing: { label: 'Sedang main', cls: 'bg-emerald-100 text-emerald-700' },
  ended: { label: 'Tamat', cls: 'bg-rose-100 text-rose-700' },
};
const MODE_LABEL: Record<string, string> = { sequencing: 'Ikut turutan', freestyle: 'Bebas', round: 'Pusingan (serentak)', team: 'Pasukan', coop: 'Kerjasama' };
// KZ-046: label cara main untuk setiap paparan sesi Arena.
const VIEW_LABEL: Record<string, string> = { list: 'Senarai', map: 'Peta 2D', pulau: 'Pulau Harta Karun', hantu: 'Kejar Hantu' };
const card = 'rounded-xl border border-slate-200 bg-white p-4 shadow-sm';
const ctl = 'rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40';

function answerText(a: unknown): string {
  if (a == null) return '';
  if (typeof a === 'string') return a;
  if (typeof a === 'object' && typeof (a as { text?: unknown }).text === 'string') return (a as { text: string }).text;
  return JSON.stringify(a);
}

export default function ArenaHostPage({ params }: { params: { sessionId: string } }) {
  const sessionId = params.sessionId;
  const router = useRouter();
  const [data, setData] = useState<SessionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  const [minutes, setMinutes] = useState(10);

  // tinjau setiap 2 s
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const d = await call<SessionDetail>(`/api/arena/sessions/${sessionId}`);
        if (alive) { setData(d); setErr(null); }
      } catch (e) {
        if (alive) setErr(msg(e));
      }
      if (alive) timer = setTimeout(() => void tick(), 2000);
    };
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      void tick();
    })();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [sessionId, router]);

  const code = data?.session.code;
  useEffect(() => {
    if (!code) return;
    const url = window.location.origin + '/arena/' + code;
    setJoinUrl(url);
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr).catch(() => setQr(null));
  }, [code]);

  async function control(action: Action, mins?: number) {
    if (action === 'restart' && !window.confirm('Semua pemain kembali ke titik mula; sejarah dan ranking dikekalkan')) return;
    if (action === 'end' && !window.confirm('Tamatkan sesi ini?')) return;
    setBusy(true);
    try {
      const r = await call<{ session: ArenaSession }>(`/api/arena/sessions/${sessionId}/control`, 'POST', mins !== undefined ? { action, minutes: mins } : { action });
      setData((d) => (d ? { ...d, session: r.session } : d));
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
  }

  async function grade(a: AnswerRow, isCorrect: boolean, points: number) {
    const score = isCorrect ? points : 0;
    try {
      await call(`/api/arena/answers/${a.id}/grade`, 'PATCH', { isCorrect, score });
      setData((d) => (d ? { ...d, answers: d.answers.map((x) => (x.id === a.id ? { ...x, is_correct: isCorrect, score } : x)) } : d));
    } catch (e) { setErr(msg(e)); }
  }

  const report = useMemo(() => {
    if (!data) return null;
    const qs = [...data.questions].sort((a, b) => a.order_idx - b.order_idx);
    const byKey = new Map<string, AnswerRow>();
    for (const a of data.answers) byKey.set(a.player_id + ':' + a.question_id, a);
    const rows = [...data.players].sort((a, b) => b.score - a.score).map((p) => {
      const mine = data.answers.filter((a) => a.player_id === p.id);
      const graded = mine.filter((a) => a.is_correct !== null);
      const correct = graded.filter((a) => a.is_correct === true).length;
      return {
        p,
        cells: qs.map((q) => byKey.get(p.id + ':' + q.id) ?? null),
        answered: mine.length,
        accuracy: graded.length ? Math.round((correct / graded.length) * 100) : null,
        timeSec: Math.round(mine.reduce((s, a) => s + (a.elapsed_ms ?? 0), 0) / 1000),
        completion: qs.length ? Math.round((mine.length / qs.length) * 100) : 0,
      };
    });
    const qRates = qs.map((q) => {
      const rs = data.answers.filter((a) => a.question_id === q.id && a.is_correct !== null);
      return rs.length ? Math.round((rs.filter((a) => a.is_correct).length / rs.length) * 100) : null;
    });
    return { qs, rows, qRates };
  }, [data]);

  function downloadCsv() {
    if (!data || !report) return;
    const esc = (v: string | number) => '"' + String(v).replace(/"/g, '""') + '"';
    const head = ['Nama', 'Pasukan', 'Markah', 'Dijawab', 'Ketepatan %', 'Masa (s)', 'Siap %', ...report.qs.map((_, i) => 'S' + (i + 1))];
    const lines = [head.map(esc).join(',')];
    for (const r of report.rows) {
      lines.push([
        r.p.nickname, r.p.team != null ? r.p.team + 1 : '', r.p.score, r.answered, r.accuracy ?? '', r.timeSec, r.completion,
        ...r.cells.map((c) => (c ? (c.is_correct === null ? 'menunggu' : c.is_correct ? 'betul' : 'salah') : '')),
      ].map(esc).join(','));
    }
    lines.push(['Kadar betul %', '', '', '', '', '', '', ...report.qRates.map((v) => v ?? '')].map(esc).join(','));
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arena-${data.session.code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!data || !report) {
    return <div className="mx-auto max-w-5xl p-6 text-slate-500">{err ? <span className="text-red-600">{err}</span> : 'Memuatkan...'}</div>;
  }

  const s = data.session;
  const st = STATUS[s.status] ?? STATUS.lobby;
  const qCount = report.qs.length;
  const pending = data.answers.filter((a) => a.is_correct === null);
  const qById = new Map(data.questions.map((q) => [q.id, q]));
  const nameById = new Map(data.players.map((p) => [p.id, p.nickname]));
  const remainMs = s.ends_at ? new Date(s.ends_at).getTime() - Date.now() : null;

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* KZ-046: tab Arena dibuang; kembali ke senarai Kuiz, bukan set lama. */}
        <Link href={'/educator/live'} className="text-sm text-indigo-600 hover:underline">← {data.set.title}</Link>
        <div className="flex items-center gap-2 text-sm">
          <span className={`rounded-full px-3 py-1 font-medium ${st.cls}`}>{st.label}</span>
          {s.frozen && <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-700">Dibekukan</span>}
          <span className="text-slate-500">{MODE_LABEL[s.mode] ?? s.mode} · {VIEW_LABEL[s.view] ?? 'Senarai'}</span>
        </div>
      </div>
      {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}

      {/* kod & QR */}
      <section className={card + ' flex flex-col items-center gap-4 sm:flex-row'}>
        {qr && <img src={qr} alt="Kod QR untuk sertai" className="h-40 w-40 rounded-lg ring-1 ring-slate-200" />}
        <div className="text-center sm:text-left">
          <p className="text-sm text-slate-500">Kod sertai</p>
          <p className="font-mono text-5xl font-black tracking-[0.25em] text-indigo-700">{s.code}</p>
          <p className="mt-1 break-all text-sm text-slate-600">{joinUrl}</p>
          <p className="mt-1 text-xs text-slate-400">{data.players.length} pemain · {qCount} soalan
            {s.mode === 'round' && s.current_index >= 0 ? ` · Soalan ${s.current_index + 1}/${qCount}` : ''}
            {remainMs !== null ? ` · Baki masa ${remainMs > 0 ? Math.ceil(remainMs / 60000) + ' min' : 'tamat'}` : ''}</p>
        </div>
      </section>

      {/* kawalan */}
      <section className={card + ' flex flex-wrap items-center gap-2'}>
        <button type="button" disabled={busy || s.status !== 'lobby'} onClick={() => void control('start')} className={ctl + ' bg-emerald-600 text-white'}>Mula</button>
        <button type="button" disabled={busy || s.status === 'ended'} onClick={() => void control('restart')} className={ctl + ' bg-indigo-600 text-white'}>Mula Bersama</button>
        <button type="button" disabled={busy || s.status === 'ended'} onClick={() => void control(s.frozen ? 'unfreeze' : 'freeze')} className={ctl + ' bg-sky-600 text-white'}>{s.frozen ? 'Nyahbeku' : 'Beku'}</button>
        {s.mode === 'round' && (
          <>
            <button type="button" disabled={busy || s.status !== 'playing' || s.current_index <= 0} onClick={() => void control('prev')} className={ctl + ' bg-slate-200'}>← Soalan sebelumnya</button>
            <button type="button" disabled={busy || s.status !== 'playing'} onClick={() => void control('next')} className={ctl + ' bg-slate-200'}>Soalan seterusnya →</button>
          </>
        )}
        <span className="flex items-center gap-1">
          <input type="number" min={0} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 0)} className="w-16 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button type="button" disabled={busy || s.status === 'ended'} onClick={() => void control('set_time_limit', Math.max(0, minutes))} className={ctl + ' bg-amber-500 text-white'}>Had masa (min)</button>
        </span>
        <button type="button" disabled={busy || s.status === 'ended'} onClick={() => void control('end')} className={ctl + ' ml-auto bg-rose-600 text-white'}>Tamat</button>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* pemain */}
        <section className={card}>
          <h2 className="mb-2 font-semibold text-slate-800">Pemain</h2>
          {data.players.length === 0 ? <p className="text-sm text-slate-500">Menunggu pemain menyertai...</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.players.map((p) => (
                <li key={p.id} className="flex items-center gap-2 py-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${PRESENCE_DOT[p.presence] ?? 'bg-slate-300'}`} title={p.presence} />
                  <span className="flex-1 truncate">{p.nickname}</span>
                  {p.team != null && <span className={`rounded px-1.5 text-xs text-white ${TEAM_COLOR[p.team % 4]}`}>P{p.team + 1}</span>}
                  <span className="w-14 text-right font-semibold">{p.score}</span>
                  <span className="w-12 text-right text-xs text-slate-500">{p.answered}/{qCount}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ranking / pasukan / kerjasama */}
        <section className={card + ' space-y-4'}>
          <div>
            <h2 className="mb-2 font-semibold text-slate-800">Ranking</h2>
            <ol className="space-y-1 text-sm">
              {report.rows.slice(0, 10).map((r, i) => (
                <li key={r.p.id} className="flex items-center gap-2">
                  <span className="w-6 text-right font-bold text-slate-400">{i + 1}</span>
                  <span className="flex-1 truncate">{r.p.nickname}</span>
                  <span className="font-semibold">{r.p.score}</span>
                </li>
              ))}
            </ol>
          </div>
          {s.mode === 'team' && data.teams.length > 0 && (
            <div>
              <h2 className="mb-2 font-semibold text-slate-800">Pasukan</h2>
              {data.teams.map((t) => {
                const max = Math.max(1, ...data.teams.map((x) => x.score));
                return (
                  <div key={t.team} className="mb-1 flex items-center gap-2 text-sm">
                    <span className="w-20">Pasukan {t.team + 1}</span>
                    <div className="h-3 flex-1 rounded bg-slate-100"><div className={`h-3 rounded ${TEAM_COLOR[t.team % 4]}`} style={{ width: `${(t.score / max) * 100}%` }} /></div>
                    <span className="w-14 text-right font-semibold">{t.score}</span>
                  </div>
                );
              })}
            </div>
          )}
          {s.mode === 'coop' && data.coop && (
            <div>
              <h2 className="mb-2 font-semibold text-slate-800">Kerjasama</h2>
              <div className="h-4 rounded-full bg-slate-100">
                <div className="h-4 rounded-full bg-emerald-500" style={{ width: `${Math.min(100, data.coop.target ? (data.coop.total / data.coop.target) * 100 : 0)}%` }} />
              </div>
              <p className="mt-1 text-sm text-slate-600">{data.coop.total} / {data.coop.target} mata{data.coop.total >= data.coop.target ? ' · Sasaran dicapai!' : ''}</p>
            </div>
          )}
        </section>
      </div>

      {/* esei menunggu gred */}
      {pending.length > 0 && (
        <section className={card + ' space-y-2 border-amber-200'}>
          <h2 className="font-semibold text-slate-800">Esei menunggu gred ({pending.length})</h2>
          {pending.map((a) => {
            const q = qById.get(a.question_id);
            return (
              <div key={a.id} className="rounded-lg bg-amber-50 p-3 text-sm">
                <p className="text-xs text-slate-500">{nameById.get(a.player_id) ?? '?'} · {q?.prompt ?? ''}</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{answerText(a.answer)}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void grade(a, true, q?.points ?? 100)} className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Betul</button>
                  <button type="button" onClick={() => void grade(a, false, q?.points ?? 100)} className="rounded-md bg-rose-600 px-3 py-1 text-xs font-semibold text-white">Salah</button>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* laporan */}
      <section className={card}>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Laporan</h2>
          <button type="button" onClick={downloadCsv} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white">Muat turun CSV</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-center text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-2 py-1 text-left">Pemain</th>
                {report.qs.map((q, i) => <th key={q.id} className="px-1 py-1" title={q.prompt}>S{i + 1}</th>)}
                <th className="px-2 py-1">Ketepatan</th>
                <th className="px-2 py-1">Masa</th>
                <th className="px-2 py-1">Siap</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.p.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-2 py-1 text-left">{r.p.nickname}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={`px-1 py-1 ${c ? (c.is_correct === null ? 'text-amber-500' : c.is_correct ? 'text-emerald-600' : 'text-rose-600') : ''}`}>
                      {c ? (c.is_correct === null ? '⏳' : c.is_correct ? '✓' : '✗') : ''}
                    </td>
                  ))}
                  <td className="px-2 py-1">{r.accuracy !== null ? r.accuracy + '%' : '-'}</td>
                  <td className="px-2 py-1">{r.timeSec}s</td>
                  <td className="px-2 py-1">{r.completion}%</td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 bg-slate-50 font-medium">
                <td className="px-2 py-1 text-left">Kadar betul</td>
                {report.qRates.map((v, i) => <td key={i} className="px-1 py-1">{v !== null ? v + '%' : '-'}</td>)}
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
