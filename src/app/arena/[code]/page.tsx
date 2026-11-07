'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import clsx from 'clsx';
import { Lock, Snowflake, Trophy, WifiOff } from 'lucide-react';
import ArenaMap from '@/components/arena/ArenaMap';
import QuestionPopup, { LABEL_JENIS, WARNA_AVATAR, bacaRalat, ralatBM } from '@/components/arena/QuestionPopup';
import type { PemainPulau } from '@/components/arena/games/PulauHartaKarun';
import type { AnswerResponse, PlayStateResponse, PresenceStatus, PublicQuestion } from '@/lib/arena/types';

// KZ-046: permainan Pulau Harta Karun / Kejar Hantu dimuat dengan
// next/dynamic ssr:false supaya bundel halaman lain tidak membesar;
// kanvas digambar di klien sahaja.
const PulauHartaKarun = dynamic(() => import('@/components/arena/games/PulauHartaKarun'), { ssr: false });
const KejarHantu = dynamic(() => import('@/components/arena/games/KejarHantu'), { ssr: false });

interface Simpanan {
  playerToken: string;
  playerId: string;
  nickname: string;
}
interface SoalanResp {
  questions: PublicQuestion[];
  available: string[];
  locked: string[];
}

const WARNA_PASUKAN = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
const WARNA_HADIR: Record<PresenceStatus, string> = { online: '#22c55e', away: '#f59e0b', offline: '#94a3b8' };

function kunciStore(code: string): string {
  return 'arena:' + code;
}

function bacaSimpanan(code: string): Simpanan | null {
  try {
    const raw = localStorage.getItem(kunciStore(code));
    if (!raw) return null;
    const o = JSON.parse(raw) as Partial<Simpanan>;
    if (typeof o.playerToken === 'string' && typeof o.playerId === 'string') {
      return { playerToken: o.playerToken, playerId: o.playerId, nickname: typeof o.nickname === 'string' ? o.nickname : '' };
    }
  } catch {
    /* abaikan */
  }
  return null;
}

function formatMasa(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Bulatan({ avatar, size = 28 }: { avatar: number; size?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-full border-2 border-white shadow"
      style={{ width: size, height: size, background: WARNA_AVATAR[avatar % WARNA_AVATAR.length] }}
    />
  );
}

function Skrin({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-600 to-violet-700 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">{children}</div>
    </main>
  );
}

// Borang masuk sebaris (tiada token tersimpan)
function BorangMasuk({
  code,
  mode,
  teamCount,
  onMasuk,
}: {
  code: string;
  mode: string;
  teamCount: number;
  onMasuk: (s: Simpanan) => void;
}) {
  const [nama, setNama] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [pasukan, setPasukan] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);

  async function hantar(e: FormEvent) {
    e.preventDefault();
    const n = nama.trim();
    if (!n) {
      setRalat('Sila isi nama samaran.');
      return;
    }
    setSibuk(true);
    setRalat(null);
    try {
      const body: Record<string, unknown> = { nickname: n, avatar };
      if (mode === 'team') body.team = pasukan;
      const res = await fetch(`/api/arena/play/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setRalat(res.status === 404 ? 'Kod permainan tidak dijumpai.' : ralatBM(bacaRalat(j, res.status)));
        return;
      }
      const d = j as { playerId: string; playerToken: string; nickname: string };
      onMasuk({ playerToken: d.playerToken, playerId: d.playerId, nickname: d.nickname });
    } catch {
      setRalat('Tiada sambungan internet. Cuba lagi.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-600 to-violet-700 px-4 py-10">
      <form onSubmit={hantar} className="mx-auto w-full max-w-md space-y-5 rounded-2xl bg-white p-5 shadow-xl">
        <h1 className="text-center text-2xl font-black text-slate-900">Masuk ke {code}</h1>
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value.slice(0, 20))}
          maxLength={20}
          placeholder="Nama samaran"
          className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-lg focus:border-indigo-600 focus:outline-none"
        />
        <div>
          <div className="text-sm font-semibold text-slate-700">Pilih avatar</div>
          <div className="mt-2 grid grid-cols-4 gap-3">
            {WARNA_AVATAR.map((w, i) => (
              <button
                key={w}
                type="button"
                onClick={() => setAvatar(i)}
                aria-label={'Avatar ' + (i + 1)}
                aria-pressed={avatar === i}
                className={clsx('mx-auto h-14 w-14 rounded-full border-4', avatar === i ? 'scale-110 border-slate-900' : 'border-white shadow')}
                style={{ background: w }}
              />
            ))}
          </div>
        </div>
        {mode === 'team' && (
          <div>
            <div className="text-sm font-semibold text-slate-700">Pilih pasukan</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {Array.from({ length: Math.max(2, Math.min(4, teamCount)) }, (_, t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPasukan(t)}
                  className={clsx('rounded-xl border-4 py-3 font-bold text-white', pasukan === t ? 'border-slate-900' : 'border-transparent')}
                  style={{ background: WARNA_PASUKAN[t] }}
                >
                  Pasukan {t + 1}
                </button>
              ))}
            </div>
          </div>
        )}
        {ralat && <p className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{ralat}</p>}
        <button
          type="submit"
          disabled={sibuk}
          className="w-full rounded-xl bg-indigo-600 py-4 text-xl font-bold text-white shadow disabled:opacity-60"
        >
          {sibuk ? 'Sedang masuk…' : 'Masuk'}
        </button>
      </form>
    </main>
  );
}

// Widget sisi: ranking, pasukan, coop
function Widget({ st }: { st: PlayStateResponse }) {
  const s = st.session;
  return (
    <div className="space-y-3">
      {s.mode === 'team' && st.teams.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-2 font-bold text-slate-800">Markah pasukan</div>
          {st.teams.map((t) => (
            <div key={t.team} className="flex items-center justify-between py-1">
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: WARNA_PASUKAN[t.team % WARNA_PASUKAN.length] }} />
                Pasukan {t.team + 1}
              </span>
              <b>{t.score}</b>
            </div>
          ))}
        </div>
      )}
      {s.mode === 'coop' && st.coop && (
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-2 font-bold text-slate-800">Sasaran kelas</div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${st.coop.target > 0 ? Math.min(100, (st.coop.total / st.coop.target) * 100) : 0}%` }}
            />
          </div>
          <div className="mt-1 text-sm text-slate-600">
            {st.coop.total} / {st.coop.target} mata {st.coop.total >= st.coop.target ? '· Sasaran dicapai!' : ''}
          </div>
        </div>
      )}
      {st.settings.showRanking && st.ranking.length > 0 && (
        <div className="rounded-2xl bg-white p-4 shadow">
          <div className="mb-2 flex items-center gap-2 font-bold text-slate-800">
            <Trophy className="h-4 w-4 text-amber-500" /> Kedudukan
          </div>
          <ol className="space-y-1 text-sm">
            {st.ranking.slice(0, 10).map((r, i) => (
              <li
                key={r.nickname + i}
                className={clsx('flex justify-between rounded-lg px-2 py-1', r.nickname === st.me?.nickname && 'bg-indigo-50 font-semibold')}
              >
                <span>
                  {i + 1}. {r.nickname}
                </span>
                <b>{r.score}</b>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

export default function ArenaPlayPage({ params }: { params: { code: string } }) {
  const code = (params.code || '').toUpperCase();
  const [sedia, setSedia] = useState(false);
  const [simpanan, setSimpanan] = useState<Simpanan | null>(null);
  const simpananRef = useRef<Simpanan | null>(null);
  const [st, setSt] = useState<PlayStateResponse | null>(null);
  const [tiadaSesi, setTiadaSesi] = useState(false);
  const [putus, setPutus] = useState(false);
  const [soalan, setSoalan] = useState<SoalanResp>({ questions: [], available: [], locked: [] });
  const [buka, setBuka] = useState<PublicQuestion | null>(null);
  // KZ-046: hasil jawapan terakhir, dipetakan ke prop powerUp permainan
  // (pulau/hantu). Jawapan yang menunggu penilaian guru dianggap salah
  // bagi tujuan permainan sahaja.
  const [powerUp, setPowerUp] = useState<{ questionId: string; correct: boolean; seq: number } | null>(null);
  // salinan ref soalan yang sedang dibuka, untuk questionId powerUp
  const bukaRef = useRef<PublicQuestion | null>(null);
  const [offset, setOffset] = useState(0);
  const [kini, setKini] = useState<number>(() => Date.now());
  const autoBuka = useRef<Set<string>>(new Set());

  useEffect(() => {
    bukaRef.current = buka;
  }, [buka]);

  const tetapSimpanan = useCallback(
    (s: Simpanan | null) => {
      simpananRef.current = s;
      setSimpanan(s);
      try {
        if (s) localStorage.setItem(kunciStore(code), JSON.stringify(s));
        else localStorage.removeItem(kunciStore(code));
      } catch {
        /* abaikan */
      }
    },
    [code],
  );

  useEffect(() => {
    const s = bacaSimpanan(code);
    simpananRef.current = s;
    setSimpanan(s);
    setSedia(true);
  }, [code]);

  const muatState = useCallback(async () => {
    const tk = simpananRef.current;
    try {
      const res = await fetch(`/api/arena/play/${code}/state`, {
        headers: tk ? { 'x-player-token': tk.playerToken } : undefined,
        cache: 'no-store',
      });
      if (res.status === 404) {
        setTiadaSesi(true);
        return;
      }
      if ((res.status === 401 || res.status === 403) && tk) {
        // token ditolak: buang, papar borang masuk
        if (simpananRef.current?.playerToken === tk.playerToken) tetapSimpanan(null);
        return;
      }
      if (!res.ok) {
        setPutus(true);
        return;
      }
      const j = (await res.json()) as PlayStateResponse;
      const t = Date.parse(j.serverTime);
      if (!Number.isNaN(t)) setOffset(t - Date.now());
      if (tk && !j.me && simpananRef.current?.playerToken === tk.playerToken) tetapSimpanan(null);
      setTiadaSesi(false);
      setPutus(false);
      setSt(j);
    } catch {
      // jangan buang pemain; cuba lagi pada tinjauan seterusnya
      setPutus(true);
    }
  }, [code, tetapSimpanan]);

  const muatSoalan = useCallback(async () => {
    const tk = simpananRef.current;
    if (!tk) return;
    try {
      const res = await fetch(`/api/arena/play/${code}/questions`, {
        headers: { 'x-player-token': tk.playerToken },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const j = (await res.json()) as SoalanResp;
      setSoalan({ questions: j.questions ?? [], available: j.available ?? [], locked: j.locked ?? [] });
    } catch {
      /* abaikan */
    }
  }, [code]);

  // tinjauan setiap 1.5 s + segar semula bila kembali kelihatan / dalam talian
  useEffect(() => {
    if (!sedia) return;
    void muatState();
    const t = window.setInterval(() => void muatState(), 1500);
    const segar = () => {
      if (document.visibilityState === 'visible') {
        void muatState();
        void muatSoalan();
      }
    };
    const dalTalian = () => {
      void muatState();
      void muatSoalan();
    };
    document.addEventListener('visibilitychange', segar);
    window.addEventListener('online', dalTalian);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', segar);
      window.removeEventListener('online', dalTalian);
    };
  }, [sedia, muatState, muatSoalan]);

  useEffect(() => {
    const t = window.setInterval(() => setKini(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const status = st?.session.status;
  const indeks = st?.session.current_index;
  const adaToken = simpanan?.playerToken;
  useEffect(() => {
    if (status === 'playing' && adaToken) void muatSoalan();
  }, [status, indeks, adaToken, muatSoalan]);

  // mod round: buka soalan semasa secara automatik jika belum dijawab
  const rq = st?.roundQuestion ?? null;
  const rqDijawab = rq ? Boolean(st?.myAnswers[rq.id]) : false;
  const modRound = st?.session.mode === 'round' && status === 'playing';
  useEffect(() => {
    if (!modRound || !rq || rqDijawab || !adaToken) return;
    if (autoBuka.current.has(rq.id)) return;
    autoBuka.current.add(rq.id);
    setBuka(rq);
  }, [modRound, rq, rqDijawab, adaToken]);

  const me = st?.me ?? null;
  const meId = me?.id;
  const petaMe = useMemo(
    () => (me ? { id: me.id, nickname: me.nickname, avatar: me.avatar, x: me.x, y: me.y } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meId],
  );

  const petaSoalan = useMemo(
    () =>
      soalan.questions.map((q) => ({
        id: q.id,
        order_idx: q.order_idx,
        answered: Boolean(st?.myAnswers[q.id]),
        locked: soalan.locked.includes(q.id),
      })),
    [soalan, st?.myAnswers],
  );

  // KZ-046: pemain untuk Pulau Harta Karun (PemainPulau), kedudukan terkini.
  const pemainPulau: PemainPulau[] = (st?.players ?? []).map((p) => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    x: p.x,
    y: p.y,
    presence: p.presence,
  }));

  const hantarGerak = useCallback(
    (x: number, y: number) => {
      const tk = simpananRef.current;
      if (!tk) return;
      void fetch(`/api/arena/play/${code}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-player-token': tk.playerToken },
        body: JSON.stringify({ x, y }),
      }).catch(() => undefined);
    },
    [code],
  );

  const bukaSoalan = useCallback(
    (id: string) => {
      if (st?.myAnswers[id] || soalan.locked.includes(id)) return;
      const q = soalan.questions.find((x) => x.id === id) ?? (rq && rq.id === id ? rq : null);
      if (q) setBuka(q);
    },
    [soalan, st, rq],
  );

  const selepasJawab = useCallback(
    (r: AnswerResponse) => {
      setSt((s) => (s && s.me ? { ...s, me: { ...s.me, score: r.totalScore } } : s));
      // KZ-046: hasil jawapan untuk permainan pulau/hantu. isCorrect null
      // bermakna menunggu penilaian guru: dianggap salah untuk permainan.
      const idSoalan = bukaRef.current?.id ?? '';
      const betul = r.result.isCorrect === true;
      setPowerUp((p) => ({ questionId: idSoalan, correct: betul, seq: (p?.seq ?? 0) + 1 }));
      void muatState();
      void muatSoalan();
    },
    [muatState, muatSoalan],
  );

  // ---------------------------------------------------------------- paparan
  if (!sedia) return <Skrin>Memuatkan…</Skrin>;

  if (tiadaSesi) {
    return (
      <Skrin>
        <p className="text-lg font-semibold text-slate-800">Kod permainan {code} tidak dijumpai.</p>
        <Link href="/arena" className="mt-4 inline-block rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white">
          Masukkan kod lain
        </Link>
      </Skrin>
    );
  }

  if (!st) {
    return (
      <Skrin>
        <p className="text-slate-700">{putus ? 'Menyambung semula…' : 'Memuatkan permainan…'}</p>
      </Skrin>
    );
  }

  const s = st.session;

  if (s.status === 'ended') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-indigo-600 to-violet-700 px-4 py-8">
        <div className="mx-auto w-full max-w-md space-y-4">
          <div className="rounded-2xl bg-white p-6 text-center shadow-xl">
            <Trophy className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-2 text-2xl font-black text-slate-900">Permainan tamat</h1>
            <p className="text-slate-500">{s.title}</p>
            {me && (
              <p className="mt-4 text-lg">
                Markah anda: <b className="text-3xl text-indigo-700">{me.score}</b>
              </p>
            )}
          </div>
          <Widget st={st} />
          <Link href="/arena" className="block rounded-xl bg-white/20 py-3 text-center font-bold text-white">
            Main permainan lain
          </Link>
        </div>
      </main>
    );
  }

  if (!simpanan) {
    return (
      <BorangMasuk
        code={code}
        mode={s.mode}
        teamCount={s.team_count}
        onMasuk={(x) => {
          tetapSimpanan(x);
          void muatState();
        }}
      />
    );
  }

  if (!me) {
    return (
      <Skrin>
        <p className="text-slate-700">Menyambung semula…</p>
      </Skrin>
    );
  }

  const sekarang = kini + offset;
  const bakiTamat = s.ends_at ? Date.parse(s.ends_at) - sekarang : null;
  const bakiPusingan =
    s.mode === 'round' && s.round_started_at && rq && rq.time_limit_sec > 0
      ? Date.parse(s.round_started_at) + rq.time_limit_sec * 1000 - sekarang
      : null;

  return (
    <main className="min-h-screen bg-slate-100 pb-10">
      <header className="sticky top-0 z-30 bg-indigo-700 px-4 py-3 text-white shadow">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-bold">{s.title}</div>
            <div className="flex items-center gap-2 text-xs text-indigo-200">
              <Bulatan avatar={me.avatar} size={14} /> {me.nickname} · {code}
            </div>
          </div>
          <div className="flex items-center gap-3 text-right">
            {putus && <WifiOff className="h-5 w-5 text-amber-300" aria-label="Menyambung semula" />}
            {bakiTamat !== null && s.status === 'playing' && (
              <div className={clsx('rounded-lg px-2 py-1 font-mono text-lg font-bold', bakiTamat < 60000 ? 'bg-rose-500' : 'bg-white/15')}>
                {formatMasa(bakiTamat)}
              </div>
            )}
            <div>
              <div className="text-[10px] uppercase text-indigo-200">Markah</div>
              <div className="text-xl font-black">{me.score}</div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pt-4">
        {s.status === 'lobby' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-6 text-center shadow">
              <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              <p className="text-lg font-semibold text-slate-800">Menunggu guru memulakan permainan…</p>
              <p className="mt-1 text-sm text-slate-500">{st.players.length} pemain sudah masuk</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow">
              <div className="mb-2 font-bold text-slate-800">Pemain</div>
              <div className="flex flex-wrap gap-2">
                {st.players.map((p) => (
                  <span
                    key={p.id}
                    className={clsx('flex items-center gap-2 rounded-full border px-3 py-1 text-sm', p.id === me.id ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200')}
                  >
                    <Bulatan avatar={p.avatar} size={18} />
                    {p.nickname}
                    <span className="h-2 w-2 rounded-full" style={{ background: WARNA_HADIR[p.presence] }} />
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {s.status === 'playing' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {s.mode === 'round' && (
                <div className="rounded-2xl bg-white p-4 shadow">
                  {rq ? (
                    <>
                      <div className="flex items-center justify-between text-sm text-slate-500">
                        <span>
                          Soalan {s.current_index + 1} / {s.questionCount}
                        </span>
                        {bakiPusingan !== null && (
                          <span className={clsx('rounded-lg px-2 py-1 font-mono font-bold', bakiPusingan < 5000 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100')}>
                            {Math.max(0, Math.ceil(bakiPusingan / 1000))} s
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{rq.prompt}</p>
                      {rqDijawab ? (
                        <p className="mt-3 font-semibold text-emerald-700">Jawapan dihantar. Tunggu soalan seterusnya…</p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setBuka(rq)}
                          className="mt-3 w-full rounded-xl bg-indigo-600 py-4 text-lg font-bold text-white"
                        >
                          Jawab sekarang
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-center text-slate-600">Tunggu soalan seterusnya daripada guru…</p>
                  )}
                </div>
              )}

              {s.view === 'map' && (
                <div className="overflow-hidden rounded-2xl bg-white shadow">
                  <ArenaMap
                    mapId={s.map_id}
                    me={petaMe}
                    players={st.players}
                    questions={petaSoalan}
                    frozen={s.frozen}
                    resetSeq={s.reset_seq}
                    onMove={hantarGerak}
                    onTouchQuestion={bukaSoalan}
                  />
                </div>
              )}

              {/* KZ-046: permainan Pulau Harta Karun / Kejar Hantu. */}
              {s.view === 'pulau' && (
                <div className="overflow-hidden rounded-2xl bg-white shadow">
                  <PulauHartaKarun
                    sessionId={s.id}
                    code={code}
                    mapId={s.map_id}
                    me={petaMe}
                    players={pemainPulau}
                    meX={me.x}
                    meY={me.y}
                    questions={petaSoalan}
                    frozen={s.frozen}
                    resetSeq={s.reset_seq}
                    paused={buka !== null}
                    powerUp={powerUp}
                    onTouchQuestion={bukaSoalan}
                    onMove={hantarGerak}
                  />
                </div>
              )}

              {s.view === 'hantu' && (
                <div className="overflow-hidden rounded-2xl bg-white shadow">
                  <KejarHantu
                    me={petaMe}
                    questions={petaSoalan}
                    frozen={s.frozen}
                    resetSeq={s.reset_seq}
                    paused={buka !== null}
                    powerUp={powerUp}
                    onTouchQuestion={bukaSoalan}
                  />
                </div>
              )}

              {/* Grid senarai lama: hanya untuk view 'list', bukan pulau/hantu. */}
              {s.view === 'list' && s.mode !== 'round' && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {soalan.questions.map((q, i) => {
                    const a = st.myAnswers[q.id];
                    const dikunci = !a && soalan.locked.includes(q.id);
                    return (
                      <button
                        key={q.id}
                        type="button"
                        disabled={Boolean(a) || dikunci || s.frozen}
                        onClick={() => setBuka(q)}
                        className={clsx(
                          'flex min-h-[110px] flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-center shadow-sm transition',
                          a
                            ? a.isCorrect === null
                              ? 'border-amber-300 bg-amber-50'
                              : a.isCorrect
                                ? 'border-emerald-400 bg-emerald-50'
                                : 'border-rose-300 bg-rose-50'
                            : dikunci
                              ? 'border-slate-200 bg-slate-100 text-slate-400'
                              : 'border-indigo-200 bg-white hover:border-indigo-500 active:scale-95',
                        )}
                      >
                        <span className="text-3xl font-black">{i + 1}</span>
                        <span className="text-xs text-slate-500">{LABEL_JENIS[q.type]}</span>
                        <span className="text-lg font-bold">
                          {a ? (
                            a.isCorrect === null ? (
                              '⏳'
                            ) : a.isCorrect ? (
                              <span className="text-emerald-600">✓</span>
                            ) : (
                              <span className="text-rose-600">✗</span>
                            )
                          ) : dikunci ? (
                            <Lock className="h-5 w-5" />
                          ) : (
                            <span className="text-xs font-semibold text-indigo-600">{q.points} mata</span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                  {soalan.questions.length === 0 && (
                    <p className="col-span-full rounded-2xl bg-white p-6 text-center text-slate-500 shadow">Memuatkan soalan…</p>
                  )}
                </div>
              )}
            </div>
            <Widget st={st} />
          </div>
        )}
      </div>

      {buka && (
        <QuestionPopup
          key={buka.id}
          code={code}
          token={simpanan.playerToken}
          question={buka}
          onClose={() => {
            setBuka(null);
            void muatSoalan();
          }}
          onAnswered={selepasJawab}
        />
      )}

      {s.frozen && s.status === 'playing' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-sky-900/70 px-6 text-center">
          <div className="rounded-2xl bg-white p-6 shadow-xl">
            <Snowflake className="mx-auto h-12 w-12 text-sky-500" />
            <p className="mt-2 text-xl font-bold text-slate-900">Guru membekukan permainan</p>
            <p className="mt-1 text-sm text-slate-500">Tunggu sebentar…</p>
          </div>
        </div>
      )}
    </main>
  );
}
