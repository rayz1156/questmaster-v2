"use client";

/**
 * Skrin pemain Speed Race (KZ-012).
 *
 * Pemain menjawab ikut rentak sendiri. Semua pengiraan berlaku di pelayan
 * (qm_race_submit); komponen ini hanya memaparkan keadaan daripada laluan
 * /api/live/play/[code]/race dan menghantar pilihan pemain.
 *
 * Teks soalan datang daripada cache klien sedia ada (laluan /questions,
 * tanpa correct_key). Susunan pilihan dikocok setiap kali soalan dihidang
 * supaya pelajar bersebelahan tidak boleh menyalin huruf.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Flag, Flame, Snowflake, Timer, Trophy, Check, X } from "lucide-react";
import { BONUS_LALAI_SEC, formatJam, kocok, bonusBaki, ordinal } from "@/lib/lumba-laju";
import QuestionReviewPlayer, { type ReviewPemain } from "@/components/QuestionReviewPlayer";

interface Pilihan { key: string; text: string }
export interface SoalanLumba { id: string; prompt: string; options: Pilihan[]; timeLimitSec?: number }
interface KeadaanLumba {
  status: string;
  endsAt: string | null;
  serverNow: string;
  distance: number | string;
  score: number;
  streak: number;
  wrongStreak: number;
  frozenUntil: string | null;
  rank: number | null;
  position: number;
  playerCount: number;
  finishedCount: number;
  questionId: string | null;
  servedAt: string | null;
  bonusSec: number | null;
  review: ReviewPemain | null;
}
interface Maklum {
  betul: boolean;
  dipilih: string;
  kunciBetul: string | null;
  mesej: string;
}

interface Props {
  kod: string;
  playerId: string;
  playerToken: string;
  nickname: string;
  soalan: SoalanLumba[];
  onKeluar: () => void;
}

const WARNA_PILIHAN = [
  "bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-slate-500",
];

export default function RacePlayer({ kod, playerId, playerToken, nickname, soalan, onKeluar }: Props) {
  const [k, setK] = useState<KeadaanLumba | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [kunci, setKunci] = useState(false);
  const [maklum, setMaklum] = useState<Maklum | null>(null);
  const [kini, setKini] = useState(() => Date.now());
  const sorokRef = useRef(0); // beza jam pelayar dengan pelayan (ms)
  const kunciRef = useRef(false);
  // Nombor jujukan: balasan tinjauan yang dihantar sebelum jawapan terakhir
  // dibuang, supaya soalan yang sudah dijawab tidak muncul semula.
  const jujukanRef = useRef(0);
  const jujukanJawabRef = useRef(0);

  const muat = useCallback(async () => {
    const nombor = ++jujukanRef.current;
    try {
      const r = await fetch(
        `/api/live/play/${kod}/race?playerId=${encodeURIComponent(playerId)}`,
        { headers: { "x-player-token": playerToken }, cache: "no-store" },
      );
      const j = await r.json();
      if (nombor <= jujukanJawabRef.current) return; // balasan lapuk
      if (!r.ok) { setErr(j.error || "Could not read the race."); return; }
      setErr(null);
      if (j.serverNow) sorokRef.current = Date.now() - new Date(j.serverNow).getTime();
      // Jangan tukar soalan di tengah-tengah paparan maklum balas.
      if (!kunciRef.current) setK(j as KeadaanLumba);
      else setK((lama) => (lama ? { ...(j as KeadaanLumba), questionId: lama.questionId, servedAt: lama.servedAt } : (j as KeadaanLumba)));
    } catch { /* cuba lagi pada kitaran seterusnya */ }
  }, [kod, playerId, playerToken]);

  useEffect(() => {
    muat();
    const t = setInterval(muat, 1500);
    return () => clearInterval(t);
  }, [muat]);

  // Jam tempatan untuk bar nitro, jam baki dan kiraan beku.
  useEffect(() => {
    const t = setInterval(() => setKini(Date.now()), 100);
    return () => clearInterval(t);
  }, []);

  const soalanSemasa = useMemo(
    () => (k?.questionId ? soalan.find((q) => q.id === k.questionId) ?? null : null),
    [k?.questionId, soalan],
  );
  // Kocok semula setiap kali soalan dihidang (servedAt berubah walaupun soalan sama).
  const pilihanKocok = useMemo(
    () => (soalanSemasa ? kocok(soalanSemasa.options) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [soalanSemasa?.id, k?.servedAt],
  );

  const jamPelayan = kini - sorokRef.current;
  const bekuMs = k?.frozenUntil ? Date.parse(k.frozenUntil) - jamPelayan : 0;
  const beku = bekuMs > 0;
  // KZ-032: bar bonus kelajuan ikut tempoh dipilih guru (lalai 30 saat),
  // bukan had masa soalan. Jawapan selepas bar habis tetap diterima.
  const bonusSec = k?.bonusSec ?? BONUS_LALAI_SEC;
  const laluMs = k?.servedAt ? Math.max(0, jamPelayan - Date.parse(k.servedAt)) : 0;
  const bonus = k?.servedAt && soalanSemasa && !kunci && !beku
    ? bonusBaki(Date.parse(k.servedAt), jamPelayan, bonusSec)
    : 0;
  const bakiBonusSaat = Math.ceil(Math.max(0, bonusSec * 1000 - laluMs) / 1000);
  const bakiMs = k?.endsAt ? Date.parse(k.endsAt) - jamPelayan : null;

  const jawab = async (kunciPilihan: string) => {
    if (!k || !k.questionId || kunciRef.current || beku) return;
    kunciRef.current = true;
    setKunci(true);
    // Semua tinjauan yang sudah dihantar sebelum saat ini kini lapuk.
    jujukanJawabRef.current = jujukanRef.current;
    let tunggu = 600;
    try {
      const r = await fetch(`/api/live/play/${kod}/race`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId, playerToken, questionId: k.questionId, choiceKey: kunciPilihan }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "Your answer was not accepted.");
        tunggu = 800;
      } else if (j.ok === false) {
        // stale, frozen, finished atau ended: muat semula keadaan sahaja.
        tunggu = 0;
      } else {
        const betul = j.correct === true;
        const maju = Number(j.advance) || 0;
        let mesej: string;
        if (betul) {
          mesej = `Correct! +${maju.toFixed(1)}%${Number(j.nitro) > 0.05 ? " with nitro" : ""}${j.streakBonus ? " + streak bonus" : ""}`;
        } else if (j.frozenUntil) {
          mesej = "Wrong again. You skidded!";
        } else {
          mesej = `Wrong. ${j.wrongStreak}/3`;
        }
        setMaklum({ betul, dipilih: kunciPilihan, kunciBetul: j.correctKey ?? null, mesej });
        tunggu = betul ? 600 : 1000;
      }
    } catch {
      setErr("Could not send your answer. Please try again.");
      tunggu = 800;
    }
    window.setTimeout(async () => {
      kunciRef.current = false;
      setKunci(false);
      setMaklum(null);
      await muat();
    }, tunggu);
  };

  if (!k) {
    return (
      <div className="card text-center">
        <p className="text-sm text-gray-500">Connecting to the race…</p>
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </div>
    );
  }

  const jarak = Math.max(0, Math.min(100, Number(k.distance) || 0));

  // ---------- Lobi ----------
  if (k.status === "lobby") {
    return (
      <div className="card text-center">
        <Flag className="w-9 h-9 mx-auto text-violet-600 mb-2" />
        <h1 className="text-xl font-bold mb-1">Get ready!</h1>
        <p className="text-sm text-gray-500 mb-3">
          The race starts when your teacher presses Start. Answer at your own pace: correct and fast
          answers move your car further.
        </p>
        <div className="text-xs text-gray-400">Racing as <span className="font-semibold text-gray-700">{nickname}</span></div>
      </div>
    );
  }

  // ---------- Tamat: perbincangan (komponen kongsi KZ-013) atau keputusan ----------
  if (k.status === "ended") {
    const rv = k.review;
    const q = rv ? soalan.find((s) => s.id === rv.questionId) ?? null : null;
    if (rv && q) {
      return <QuestionReviewPlayer rv={rv} q={q} />;
    }
    return (
      <div className="space-y-3">
        <div className="card text-center">
          <Trophy className="w-10 h-10 mx-auto text-amber-500 mb-2" />
          <h1 className="text-xl font-bold mb-1">
            {k.rank ? `You finished ${ordinal(k.rank)}!` : "Race over"}
          </h1>
          <p className="text-sm text-gray-500 mb-3">
            {k.rank
              ? `Final position: ${ordinal(k.position)} of ${k.playerCount}.`
              : `You reached ${Math.round(jarak)}% of the track. Final position: ${ordinal(k.position)} of ${k.playerCount}.`}
          </p>
          <div className="text-3xl font-bold text-violet-700">{k.score.toLocaleString()}</div>
          <div className="text-xs text-gray-500">points</div>
        </div>
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-sm text-violet-900">
          Your teacher may now go through the questions with the class. Keep this screen open.
        </div>
        <button onClick={onKeluar} className="btn-primary w-full py-2">Exit</button>
      </div>
    );
  }

  // ---------- Sampai penamat (lumba masih berjalan untuk orang lain) ----------
  if (k.rank) {
    return (
      <div className="card text-center">
        <Flag className="w-10 h-10 mx-auto text-violet-600 mb-2" />
        <h1 className="text-2xl font-bold mb-1">You finished {ordinal(k.rank)}!</h1>
        <div className="text-3xl font-bold text-violet-700 mt-2">{k.score.toLocaleString()}</div>
        <div className="text-xs text-gray-500 mb-3">points</div>
        <p className="text-sm text-gray-500">Watch the track on the big screen while the others finish.</p>
        {bakiMs !== null && (
          <p className="text-xs text-gray-400 mt-2">Race ends in {formatJam(bakiMs)}</p>
        )}
      </div>
    );
  }

  // ---------- Berlumba ----------
  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold">
          {ordinal(k.position)} <span className="text-xs font-medium text-gray-500">of {k.playerCount}</span>
        </div>
        <div className="font-mono font-bold text-violet-700 tabular-nums">{k.score.toLocaleString()} pts</div>
      </div>
      <div className="h-2.5 rounded-full bg-violet-100 mt-2 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 motion-safe:transition-all motion-safe:duration-300"
          style={{ width: `${jarak}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-gray-500 mt-1 tabular-nums">
        <span>Track {Math.round(jarak)}%</span>
        <span className="inline-flex items-center gap-1">
          {k.streak >= 3 && <Flame className="w-3.5 h-3.5 text-orange-500" />}Streak: {k.streak}
        </span>
        {bakiMs !== null && (
          <span className="inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{formatJam(bakiMs)}</span>
        )}
      </div>

      {/* KZ-032: bar bonus kelajuan ikut tempoh guru, bukan had masa. */}
      <div className="mt-3 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-orange-600">
        <span>Speed bonus</span>
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-orange-500 to-yellow-400" style={{ width: `${bonus * 100}%` }} />
        </div>
        <span className="normal-case font-medium text-gray-500">
          {bonus > 0 ? `${bakiBonusSaat}s` : "No bonus, keep going"}
        </span>
      </div>

      {soalanSemasa ? (
        <>
          <div className="font-semibold mt-4 mb-3 min-h-[3rem]">{soalanSemasa.prompt}</div>
          <div className="grid grid-cols-1 gap-2">
            {pilihanKocok.map((o, i) => {
              const dipilih = maklum?.dipilih === o.key;
              const betul = maklum && o.key === maklum.kunciBetul;
              return (
                <button
                  key={o.key}
                  onClick={() => jawab(o.key)}
                  disabled={kunci || beku}
                  className={`rounded-xl border px-3 py-3 text-left text-sm flex items-center gap-3 transition
                    ${betul ? "border-green-500 bg-green-50" : dipilih ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-violet-400 hover:bg-violet-50"}
                    ${kunci && !dipilih && !betul ? "opacity-50" : ""}`}
                >
                  {/* Tiada huruf semasa lumba: pilihan dikocok, jadi huruf kedudukan
                      tidak sepadan dengan huruf asal yang dipapar semasa perbincangan. */}
                  <span aria-hidden className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 ${WARNA_PILIHAN[i % WARNA_PILIHAN.length]}`}>
                    <span className="w-2.5 h-2.5 rounded-full bg-white/90" />
                  </span>
                  <span className="flex-1">{o.text}</span>
                  {betul && <Check className="w-4 h-4 text-green-600" />}
                  {dipilih && !betul && <X className="w-4 h-4 text-red-500" />}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-500 mt-4">Loading the next question…</p>
      )}

      <div
        className={`mt-3 min-h-[1.25rem] text-center text-sm font-semibold ${maklum?.betul ? "text-green-700" : "text-red-600"}`}
        aria-live="polite"
      >
        {maklum?.mesej || err || ""}
      </div>

      {beku && (
        <div className="absolute inset-0 bg-sky-50/95 grid place-items-center text-center p-6">
          <div>
            <Snowflake className="w-8 h-8 mx-auto text-sky-600" />
            <div className="font-mono text-5xl font-bold text-sky-600 mt-1">{Math.ceil(bekuMs / 1000)}</div>
            <div className="text-lg font-bold text-sky-700 mt-1">You skidded!</div>
            <p className="text-sm text-sky-800 mt-1">Too many wrong answers. Take a breath and read carefully.</p>
          </div>
        </div>
      )}
    </div>
  );
}
