"use client";

/**
 * Skrin pemain Lawan Raksasa (KZ-013). Corak penuh diambil daripada
 * RacePlayer: nombor jujukan tinjauan, kocok pilihan setiap kali dihidang,
 * tiada huruf A-D semasa bermain, tinjau 1500 ms.
 *
 * Semua pengiraan (kerosakan, kritikal, pulih, nyawa) berlaku di pelayan
 * (qm_boss_submit); komponen ini hanya memaparkan keadaan daripada laluan
 * /api/live/play/[code]/boss dan menghantar pilihan pemain. Teks soalan
 * datang daripada cache klien sedia ada (laluan /questions, tanpa
 * correct_key).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Swords, Flame, Snowflake, Timer, Zap, Trophy, Check, X } from "lucide-react";
import { formatJam, kocok, nitroBaki, ordinal } from "@/lib/lumba-laju";
import QuestionReviewPlayer, { type ReviewPemain } from "@/components/QuestionReviewPlayer";

interface Pilihan { key: string; text: string }
export interface SoalanRaksasa { id: string; prompt: string; options: Pilihan[]; timeLimitSec?: number }

interface KeadaanRaksasa {
  status: string;
  endsAt: string | null;
  serverNow: string;
  hp: number;
  maxHp: number;
  result: string | null;
  myDamage: number;
  score: number;
  streak: number;
  wrongStreak: number;
  frozenUntil: string | null;
  position: number;
  playerCount: number;
  questionId: string | null;
  servedAt: string | null;
  lastHitByMe: boolean | null;
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
  soalan: SoalanRaksasa[];
  onKeluar: () => void;
}

const WARNA_PILIHAN = [
  "bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-emerald-500", "bg-violet-500", "bg-slate-500",
];

export default function BossPlayer({ kod, playerId, playerToken, nickname, soalan, onKeluar }: Props) {
  const [k, setK] = useState<KeadaanRaksasa | null>(null);
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
        `/api/live/play/${kod}/boss?playerId=${encodeURIComponent(playerId)}`,
        { headers: { "x-player-token": playerToken }, cache: "no-store" },
      );
      const j = await r.json();
      if (nombor <= jujukanJawabRef.current) return; // balasan lapuk
      if (!r.ok) { setErr(j.error || "Could not read the battle."); return; }
      setErr(null);
      if (j.serverNow) sorokRef.current = Date.now() - new Date(j.serverNow).getTime();
      // Jangan tukar soalan di tengah-tengah paparan maklum balas.
      if (!kunciRef.current) setK(j as KeadaanRaksasa);
      else setK((lama) => (lama ? { ...(j as KeadaanRaksasa), questionId: lama.questionId, servedAt: lama.servedAt } : (j as KeadaanRaksasa)));
    } catch { /* cuba lagi pada kitaran seterusnya */ }
  }, [kod, playerId, playerToken]);

  useEffect(() => {
    muat();
    const t = setInterval(muat, 1500);
    return () => clearInterval(t);
  }, [muat]);

  // Jam tempatan untuk bar kritikal, jam baki dan kiraan pengsan.
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
  const pengsanMs = k?.frozenUntil ? Date.parse(k.frozenUntil) - jamPelayan : 0;
  const pengsan = pengsanMs > 0;
  const kritikal = k?.servedAt && soalanSemasa && !kunci && !pengsan
    ? nitroBaki(Date.parse(k.servedAt), jamPelayan, soalanSemasa.timeLimitSec ?? 20)
    : 0;
  const bakiMs = k?.endsAt ? Date.parse(k.endsAt) - jamPelayan : null;
  const nisbahHp = k && k.maxHp > 0 ? Math.max(0, Math.min(100, (k.hp / k.maxHp) * 100)) : 0;

  const jawab = async (kunciPilihan: string) => {
    if (!k || !k.questionId || kunciRef.current || pengsan) return;
    kunciRef.current = true;
    setKunci(true);
    // Semua tinjauan yang sudah dihantar sebelum saat ini kini lapuk.
    jujukanJawabRef.current = jujukanRef.current;
    let tunggu = 600;
    try {
      const r = await fetch(`/api/live/play/${kod}/boss`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ playerId, playerToken, questionId: k.questionId, choiceKey: kunciPilihan }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error || "Your answer was not accepted.");
        tunggu = 800;
      } else if (j.ok === false) {
        // stale, frozen, not_started atau ended: muat semula keadaan sahaja.
        tunggu = 0;
      } else {
        const betul = j.correct === true;
        let mesej: string;
        if (betul) {
          const pukulan = Number(j.damage) || 0;
          mesej = `${j.crit ? "Critical hit!" : "Hit!"} -${pukulan} HP${j.streakBonus ? " + streak bonus" : ""}`;
        } else {
          const pulih = Number(j.heal) || 0;
          mesej = `Wrong. The boss healed +${pulih} (${j.wrongStreak}/3)`;
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
        <p className="text-sm text-gray-500">Connecting to the battle…</p>
        {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      </div>
    );
  }

  // ---------- Lobi ----------
  if (k.status === "lobby") {
    return (
      <div className="card text-center">
        <Swords className="w-9 h-9 mx-auto text-violet-600 mb-2" />
        <h1 className="text-xl font-bold mb-1">Get ready to fight!</h1>
        <p className="text-sm text-gray-500 mb-3">
          The battle starts when your teacher presses Start. Correct answers hit the boss; fast
          answers land critical hits. Wrong answers heal it.
        </p>
        <div className="text-xs text-gray-400">Fighting as <span className="font-semibold text-gray-700">{nickname}</span></div>
      </div>
    );
  }

  // ---------- Tamat: perbincangan atau keputusan ----------
  if (k.status === "ended") {
    const rv = k.review;
    const q = rv ? soalan.find((s) => s.id === rv.questionId) ?? null : null;
    if (rv && q) {
      return <QuestionReviewPlayer rv={rv} q={q} />;
    }
    const menang = k.result === "win";
    return (
      <div className="space-y-3">
        <div className="card text-center">
          <Trophy className={`w-10 h-10 mx-auto mb-2 ${menang ? "text-amber-500" : "text-gray-400"}`} />
          <h1 className="text-xl font-bold mb-1">{menang ? "We won!" : "The boss survived"}</h1>
          <p className="text-sm text-gray-500">
            You dealt <span className="font-semibold text-gray-800">{k.myDamage.toLocaleString()}</span> damage
            ({ordinal(k.position)} in class).
          </p>
          {k.lastHitByMe && (
            <p className="text-sm font-semibold text-amber-600 mt-1">You landed the final blow!</p>
          )}
          <p className="text-sm text-gray-500 mt-2">Look at the big screen for the question discussion.</p>
        </div>
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-sm text-violet-900">
          Keep this screen open until the discussion ends.
        </div>
        <button onClick={onKeluar} className="btn-primary w-full py-2">Exit</button>
      </div>
    );
  }

  // ---------- Bertarung ----------
  return (
    <div className="card relative overflow-hidden">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">
          Your damage: <span className="text-violet-700 tabular-nums">{k.myDamage.toLocaleString()}</span>
        </div>
        <div className="text-xs text-gray-500">
          {ordinal(k.position)} <span className="font-normal">of {k.playerCount}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-gray-500 mt-1 tabular-nums">
        <Flame className="w-3.5 h-3.5 text-orange-500" />
        <span>Streak: {k.streak}</span>
        {bakiMs !== null && (
          <span className="ml-auto inline-flex items-center gap-1"><Timer className="w-3.5 h-3.5" />{formatJam(bakiMs)}</span>
        )}
      </div>

      {/* Bar nyawa raksasa kecil dengan peratus. */}
      <div className="mt-2">
        <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-red-600 to-red-400 motion-safe:transition-all motion-safe:duration-300"
            style={{ width: `${nisbahHp}%` }}
          />
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5 tabular-nums text-right">Boss {Math.round(nisbahHp)}%</div>
      </div>

      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-600">
        <span className="inline-flex items-center gap-1"><Zap className="w-3.5 h-3.5" />Critical</span>
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-300" style={{ width: `${kritikal * 100}%` }} />
        </div>
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
                  disabled={kunci || pengsan}
                  className={`rounded-xl border px-3 py-3 text-left text-sm flex items-center gap-3 transition
                    ${betul ? "border-green-500 bg-green-50" : dipilih ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-violet-400 hover:bg-violet-50"}
                    ${kunci && !dipilih && !betul ? "opacity-50" : ""}`}
                >
                  {/* Tiada huruf semasa bermain: pilihan dikocok, jadi huruf
                      kedudukan tidak sepadan dengan huruf asal yang dipapar
                      semasa perbincangan. */}
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

      {pengsan && (
        <div className="absolute inset-0 bg-sky-50/95 grid place-items-center text-center p-6">
          <div>
            <Snowflake className="w-8 h-8 mx-auto text-sky-600" />
            <div className="font-mono text-5xl font-bold text-sky-600 mt-1">{Math.ceil(pengsanMs / 1000)}</div>
            <div className="text-lg font-bold text-sky-700 mt-1">You&apos;re stunned!</div>
            <p className="text-sm text-sky-800 mt-1">Three wrong answers in a row. Take a breath and read carefully.</p>
          </div>
        </div>
      )}
    </div>
  );
}
