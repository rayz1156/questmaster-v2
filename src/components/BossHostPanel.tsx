"use client";

/**
 * Panel hos Lawan Raksasa (KZ-013): lobi, arena masa nyata, keputusan dan mod
 * perbincangan (komponen kongsi QuestionReview, sama seperti Speed Race).
 *
 * Komponen ini hanya memaparkan data daripada GET /api/live/sessions/[id]
 * dan memanggil `kawal(action)` milik halaman. Semua pengiraan nyawa,
 * kerosakan dan kritikal berlaku di pelayan (migrasi 0060).
 */
import { useEffect, useRef, useState } from "react";
import {
  Play, Square, RotateCcw, Swords, Timer, Users, MessageSquare, Maximize2, Minimize2,
  Flame, Zap, HeartPulse, Trophy,
} from "lucide-react";
import {
  BONUS_LALAI_SEC,
  TAHAP_RAKSASA,
  cadanganSoalanRaksasa,
  fasaRaksasa,
  formatJam,
  nyawaRaksasa,
  ulanganSoalan,
} from "@/lib/lumba-laju";
import QuestionReview, { type ReviewHos } from "@/components/QuestionReview";

export interface PemainRaksasa {
  id: string;
  nickname: string;
  score: number;
  streak?: number;
  best_streak?: number;
  boss_damage: number | string | null;
  race_frozen_until?: string | null;
  kedudukan: number;
}
export interface SesiRaksasaHos {
  id: string;
  code: string;
  status: string;
  game_mode?: string | null;
  race_minutes?: number | null;
  race_bonus_sec?: number | null;
  race_ends_at?: string | null;
  review_index?: number | null;
  review_revealed?: boolean | null;
  boss_k?: number | null;
  boss_max_hp?: number | null;
  boss_hp?: number | null;
  boss_crits?: number | null;
  boss_healed?: number | null;
  boss_last_hit?: string | null;
  boss_result?: string | null;
}
/** Entri feed serangan: dipetakan daripada 8 jawapan terkini sesi. */
export interface SeranganFeed {
  nickname: string | null;
  effect: number;
  crit: boolean;
  at: string;
}
export interface StatsRaksasa {
  correctPct: number | null;
  crits: number;
  healed: number;
}

interface Props {
  session: SesiRaksasaHos;
  players: PemainRaksasa[];
  questionCount: number;
  serverNow: string | null;
  review: ReviewHos | null;
  feed: SeranganFeed[];
  lastHitName: string | null;
  stats: StatsRaksasa | null;
  busy: boolean;
  kawal: (action: string) => void;
}

// Label tahap daripada nilai k yang disimpan pada sesi.
function labelTahap(k: number | null | undefined): string {
  const cari = (Object.keys(TAHAP_RAKSASA) as Array<keyof typeof TAHAP_RAKSASA>)
    .find((t) => TAHAP_RAKSASA[t] === k);
  if (!cari) return "Medium";
  return cari === "easy" ? "Easy" : cari === "hard" ? "Hard" : "Medium";
}

// Warna badan raksasa ikut fasa: hijau, oren, merah-ungu.
const WARNA_FASA: Record<string, string> = {
  calm: "#22c55e",
  angry: "#f97316",
  rage: "#9d174d",
};
const LABEL_FASA: Record<string, string> = {
  calm: "Calm",
  angry: "Angry",
  rage: "Raging",
};

interface AngkaTerapung {
  kunci: string;
  teks: string;
  kritikal: boolean;
  pulih: boolean;
}

export default function BossHostPanel({
  session, players, questionCount, serverNow, review, feed, lastHitName, stats, busy, kawal,
}: Props) {
  const [kini, setKini] = useState(() => Date.now());
  const [penuh, setPenuh] = useState(false);
  const [goncang, setGoncang] = useState(false);
  const [terapung, setTerapung] = useState<AngkaTerapung[]>([]);
  const sorokRef = useRef(0);
  const hpLamaRef = useRef<number | null>(null);
  const feedDilihatRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (serverNow) sorokRef.current = Date.now() - new Date(serverNow).getTime();
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => setKini(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Pintasan papan kekunci dalam mod perbincangan (sama seperti panel race).
  const dalamReview = session.status === "ended" && (session.review_index ?? -1) >= 0;
  const rvIndeks = review?.index ?? -1;
  const rvJumlah = review?.total ?? 0;
  const rvDedah = review?.revealed === true;
  useEffect(() => {
    if (!dalamReview) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // Ctrl+R / Cmd+R (muat semula) dan pintasan lain tidak boleh mendedahkan jawapan.
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (busy) return;
      if (e.key === "ArrowRight" && rvIndeks >= 0 && rvIndeks < rvJumlah - 1) kawal("review_next");
      else if (e.key === "ArrowLeft" && rvIndeks > 0) kawal("review_prev");
      else if ((e.key === "r" || e.key === "R") && !rvDedah) kawal("review_reveal");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dalamReview, busy, kawal, rvIndeks, rvJumlah, rvDedah]);

  const jamPelayan = kini - sorokRef.current;
  const bakiMs = session.race_ends_at ? Date.parse(session.race_ends_at) - jamPelayan : null;
  const hp = Number(session.boss_hp ?? 0);
  const maxHp = Number(session.boss_max_hp ?? 0);
  const nisbah = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const fasa = fasaRaksasa(hp, maxHp);
  const warna = WARNA_FASA[fasa];

  // Goyang raksasa bila nyawa turun sejak tinjauan terakhir (bukan bila naik).
  useEffect(() => {
    const lama = hpLamaRef.current;
    hpLamaRef.current = hp;
    if (lama !== null && hp < lama) {
      setGoncang(true);
      const t = setTimeout(() => setGoncang(false), 550);
      return () => clearTimeout(t);
    }
  }, [hp]);

  // Angka terapung bagi entri feed BAHARU sejak tinjauan terakhir, dikenal
  // pasti ikut "at" + nama. Maksimum 6 serentak. Setiap angka ada pemasa
  // pembuangnya sendiri dalam ref, jadi tinjauan seterusnya (feed baharu
  // setiap saat) tidak membatalkannya. Tinjauan PERTAMA hanya merekod feed
  // sedia ada sebagai sudah dilihat, supaya muat semula halaman tidak
  // memainkan semula 8 serangan lama.
  const pemasaRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const feedSediaRef = useRef(false);
  useEffect(() => {
    if (!feedSediaRef.current) {
      for (const f of feed) feedDilihatRef.current.add(`${f.at}|${f.nickname}`);
      feedSediaRef.current = true;
      return;
    }
    const baharu: AngkaTerapung[] = [];
    for (const f of feed) {
      const kunci = `${f.at}|${f.nickname}`;
      if (feedDilihatRef.current.has(kunci)) continue;
      feedDilihatRef.current.add(kunci);
      if (f.effect > 0) baharu.push({ kunci, teks: `-${f.effect}${f.crit ? "!" : ""}`, kritikal: f.crit, pulih: false });
      else if (f.effect < 0) baharu.push({ kunci, teks: `+${-f.effect}`, kritikal: false, pulih: true });
    }
    if (baharu.length === 0) return;
    setTerapung((lama) => [...lama, ...baharu].slice(-6));
    for (const a of baharu) {
      pemasaRef.current.set(
        a.kunci,
        setTimeout(() => {
          pemasaRef.current.delete(a.kunci);
          setTerapung((lama) => lama.filter((x) => x.kunci !== a.kunci));
        }, 1300),
      );
    }
  }, [feed]);
  // Bersihkan semua pemasa bila komponen dibuang sahaja.
  useEffect(() => {
    const peta = pemasaRef.current;
    return () => { peta.forEach((t) => clearTimeout(t)); peta.clear(); };
  }, []);

  const butangHenti = (
    <button
      onClick={() => kawal("end")}
      disabled={busy}
      className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm flex items-center gap-1 disabled:opacity-50"
    >
      <Square className="w-4 h-4" /> Stop battle
    </button>
  );
  const butangPenuh = (
    <button
      onClick={() => setPenuh((v) => !v)}
      className="px-3 py-1.5 rounded-lg border border-violet-300 text-violet-700 hover:bg-violet-50 text-sm flex items-center gap-1"
      title={penuh ? "Exit projector view" : "Projector view"}
    >
      {penuh ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
      {penuh ? "Exit projector view" : "Projector view"}
    </button>
  );

  // ---------- Perbincangan (komponen kongsi dengan Speed Race) ----------
  if (dalamReview && review) {
    const isi = (
      <QuestionReview review={review} busy={busy} kawal={kawal} penuh={penuh} setPenuh={setPenuh} />
    );
    return penuh ? (
      <div className="fixed inset-0 z-50 bg-white overflow-auto flex items-center justify-center p-6">{isi}</div>
    ) : (
      <div className="card">{isi}</div>
    );
  }

  // ---------- Lobi ----------
  if (session.status === "lobby") {
    const minit = session.race_minutes ?? 5;
    const k = session.boss_k ?? TAHAP_RAKSASA.medium;
    // KZ-032: tempoh bonus kelajuan dipilih guru; lalai 30 untuk sesi lama.
    const bonus = session.race_bonus_sec ?? BONUS_LALAI_SEC;
    const disyorkan = cadanganSoalanRaksasa(minit);
    const ulang = ulanganSoalan(disyorkan, questionCount);
    const nyawaDijangka = nyawaRaksasa(players.length, minit, k);
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-violet-900 flex items-center gap-2">
                <Swords className="w-4 h-4" /> Boss Battle · {minit} min · {labelTahap(k)}
              </div>
              <p className="text-sm text-violet-900/80 mt-1">
                The whole class fights one boss. Correct answers hit it; fast answers land critical
                hits. Wrong answers heal it. Three wrong in a row stun a player for 5 seconds.
              </p>
              <p className="text-xs text-violet-900/70 mt-2">
                {players.length > 0
                  ? `Expected boss health if you start now: ${nyawaDijangka.toLocaleString()} HP.`
                  : "The boss health is set from the number of players when you press Start."}
              </p>
              <p className="text-xs text-violet-900/70 mt-1">
                Speed bonus: {bonus}s
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => kawal("start")}
                disabled={busy || players.length === 0}
                className="py-2 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50 flex items-center gap-1"
              >
                <Play className="w-4 h-4" /> Start battle
              </button>
              {butangHenti}
            </div>
          </div>
          {questionCount < disyorkan && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              This quiz has {questionCount} questions. Each question may repeat up to {ulang} times in a{" "}
              {minit}-minute battle. For no repeats, use at least {disyorkan} questions.
            </p>
          )}
        </div>
        <div className="card">
          <div className="font-semibold mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" /> Heroes ({players.length})
          </div>
          {players.length === 0 ? (
            <p className="text-sm text-gray-500">No heroes yet. Share the code above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-2 py-1 text-sm">
                  <span className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold text-white bg-violet-600">
                    {p.nickname.trim().slice(0, 2).toUpperCase()}
                  </span>
                  {p.nickname}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- Tamat: keputusan ----------
  if (session.status === "ended") {
    const menang = session.boss_result === "win";
    const atas = players.slice(0, 5);
    return (
      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
            <div className="font-semibold flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Battle results
            </div>
            <button
              onClick={() => kawal("review_start")}
              disabled={busy || questionCount === 0}
              className="py-2 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center gap-1 disabled:opacity-50"
            >
              <MessageSquare className="w-4 h-4" /> Discuss questions
            </button>
          </div>
          <div className="text-center">
            {menang ? (
              <>
                <div className="text-2xl sm:text-3xl font-bold text-amber-500">The boss is defeated!</div>
                {lastHitName && (
                  <p className="text-sm text-gray-600 mt-1">Final blow by <span className="font-semibold">{lastHitName}</span>.</p>
                )}
              </>
            ) : (
              <>
                <div className="text-2xl sm:text-3xl font-bold text-gray-800">
                  {session.boss_result === "stopped" ? "Battle stopped" : "Time's up. The boss survived."}
                </div>
                {maxHp > 0 && (
                  <p className="text-sm text-gray-600 mt-1">
                    The boss kept <span className="font-semibold">{Math.round(nisbah)}%</span> of its health.
                  </p>
                )}
              </>
            )}
          </div>
          {stats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4 text-center">
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
                <div className="text-xl font-bold text-violet-800 tabular-nums">
                  {stats.correctPct !== null ? `${stats.correctPct}%` : "-"}
                </div>
                <div className="text-xs text-violet-900/70">correct on first attempts</div>
              </div>
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
                <div className="text-xl font-bold text-violet-800 tabular-nums inline-flex items-center gap-1">
                  <Zap className="w-4 h-4 text-amber-500" />{stats.crits}
                </div>
                <div className="text-xs text-violet-900/70">critical hits</div>
              </div>
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
                <div className="text-xl font-bold text-violet-800 tabular-nums inline-flex items-center gap-1">
                  <HeartPulse className="w-4 h-4 text-emerald-600" />{stats.healed}
                </div>
                <div className="text-xs text-violet-900/70">HP healed by wrong answers</div>
              </div>
            </div>
          )}
          {atas.length > 0 && (
            <div className="mt-3 text-sm text-gray-600 text-center">
              Top attacker: <span className="font-semibold text-gray-900">{atas[0].nickname}</span> with{" "}
              {(Number(atas[0].boss_damage) || 0).toLocaleString()} damage.
            </div>
          )}
        </div>
        {players.length > 0 && (
          <div className="card">
            <div className="font-semibold mb-2">All attackers</div>
            <ol className="divide-y divide-gray-100 text-sm">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1.5 gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-6 text-right tabular-nums text-gray-500">{p.kedudukan}.</span>
                    <span className="truncate">{p.nickname}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span className="text-xs text-gray-500">
                      {(Number(p.boss_damage) || 0).toLocaleString()} damage
                    </span>
                    <span className="font-semibold">{p.score.toLocaleString()}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  }

  // ---------- Bertarung: arena ----------
  const hadKerosakan = Math.max(1, ...players.map((p) => Number(p.boss_damage) || 0));
  const arena = (
    <div className={`rounded-2xl bg-[#1b1530] text-white p-4 sm:p-6 relative overflow-hidden ${penuh ? "w-full max-w-6xl" : ""}`}>
      <style>{`
        @keyframes kz013-goyang{0%,100%{transform:translateX(0)}20%{transform:translateX(-7px)}40%{transform:translateX(7px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
        @keyframes kz013-terapung{0%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-70px)}}
      `}</style>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="font-bold text-lg flex items-center gap-2"><Swords className="w-5 h-5" /> Boss Battle</div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm rounded-full px-3 py-1 tabular-nums inline-flex items-center gap-1 ${bakiMs !== null && bakiMs <= 30000 ? "bg-amber-600" : "bg-white/10"}`}>
            <Timer className="w-4 h-4" /> {bakiMs !== null ? formatJam(bakiMs) : "--:--"}
          </span>
          <span className="font-mono font-bold text-sm rounded-full px-3 py-1 bg-white/10 tabular-nums inline-flex items-center gap-1">
            <Users className="w-4 h-4" /> {players.length} {players.length === 1 ? "hero" : "heroes"}
          </span>
        </div>
      </div>

      {/* Bar nyawa besar dengan tanda pada 50% dan 25%. */}
      <div className="relative h-8 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full motion-safe:transition-all motion-safe:duration-300"
          style={{ width: `${nisbah}%`, background: "linear-gradient(to right, #dc2626, #ef4444)" }}
        />
        <div className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: "50%" }} />
        <div className="absolute top-0 bottom-0 w-px bg-white/40" style={{ left: "25%" }} />
        <div className="absolute inset-0 flex items-center justify-between px-3 text-xs font-bold tabular-nums">
          <span>{maxHp > 0 ? `${hp.toLocaleString()} / ${maxHp.toLocaleString()} HP` : "0 HP"}</span>
          <span className="rounded-full bg-black/30 px-2 py-0.5">{LABEL_FASA[fasa]}</span>
        </div>
      </div>

      {/* Raksasa CSS dan angka terapung. */}
      <div className="relative h-52 sm:h-64 mt-4">
        {terapung.map((a) => (
          <span
            key={a.kunci}
            className={`absolute left-1/2 -translate-x-1/2 bottom-20 text-2xl sm:text-3xl font-black drop-shadow motion-safe:animate-[kz013-terapung_1.3s_ease-out_forwards]
              ${a.pulih ? "text-emerald-400" : a.kritikal ? "text-amber-300" : "text-red-400"}`}
          >
            {a.teks}
          </span>
        ))}
        <div
          className={`absolute left-1/2 -translate-x-1/2 bottom-4 w-36 h-36 sm:w-44 sm:h-44 ${goncang ? "motion-safe:animate-[kz013-goyang_0.5s_ease-in-out]" : ""}`}
        >
          {/* Tanduk */}
          <div className="absolute top-0 left-8 w-6 h-6 rotate-45 rounded-[4px]" style={{ background: warna }} />
          <div className="absolute top-0 right-8 w-6 h-6 -rotate-45 rounded-[4px]" style={{ background: warna }} />
          {/* Badan bulat */}
          <div
            className="absolute inset-x-3 top-5 bottom-2 rounded-[46%] motion-safe:transition-colors motion-safe:duration-500"
            style={{ background: warna }}
          />
          {/* Mata */}
          <div className="absolute left-1/2 -translate-x-1/2 top-14 flex gap-5">
            <div className="w-6 h-6 rounded-full bg-white grid place-items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#1b1530]" />
            </div>
            <div className="w-6 h-6 rounded-full bg-white grid place-items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-[#1b1530]" />
            </div>
          </div>
          {/* Mulut bergigi */}
          <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-20 h-6 rounded-b-xl bg-[#1b1530] overflow-hidden">
            <div className="flex justify-around">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className="w-3 h-3 bg-white" style={{ clipPath: "polygon(0 0, 100% 0, 50% 100%)" }} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
        {/* Feed serangan terkini */}
        <div className="rounded-xl bg-white/5 p-3 min-h-0">
          <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5" /> Latest attacks
          </div>
          {feed.length === 0 ? (
            <p className="text-sm opacity-60">Waiting for the first attacks…</p>
          ) : (
            <ul className="text-sm space-y-1 max-h-44 overflow-auto pr-1">
              {feed.map((f, i) => (
                <li key={`${f.at}|${f.nickname}|${i}`} className="flex items-center justify-between gap-2 tabular-nums">
                  <span className="truncate">{f.nickname || "Unknown hero"}</span>
                  <span className={`font-bold shrink-0 ${f.effect < 0 ? "text-emerald-400" : f.crit ? "text-amber-300" : "text-red-400"}`}>
                    {f.effect > 0 ? `-${f.effect}${f.crit ? "!" : ""}` : `+${-f.effect}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* Penyerang terhebat */}
        <div className="rounded-xl bg-white/5 p-3">
          <div className="text-xs font-bold uppercase tracking-wider opacity-70 mb-2">Top attackers</div>
          {players.length === 0 ? (
            <p className="text-sm opacity-60">Nobody has joined yet.</p>
          ) : (
            <ul className="text-sm space-y-1.5 max-h-44 overflow-auto pr-1">
              {players.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <span className="w-5 text-right opacity-70 tabular-nums">{p.kedudukan}</span>
                  <span className="w-24 truncate">{p.nickname}</span>
                  <span className="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-300 motion-safe:transition-all motion-safe:duration-500"
                      style={{ width: `${Math.round(((Number(p.boss_damage) || 0) / hadKerosakan) * 100)}%` }}
                    />
                  </span>
                  <span className="tabular-nums opacity-80">{(Number(p.boss_damage) || 0).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {butangHenti}
        {butangPenuh}
        <button
          onClick={() => kawal("reset")}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1"
        >
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>
      {penuh ? (
        <div className="fixed inset-0 z-50 bg-[#151225] overflow-auto flex flex-col items-center justify-center p-6 gap-4">
          {arena}
          <div className="flex gap-2">{butangHenti}{butangPenuh}</div>
        </div>
      ) : (
        arena
      )}
      <p className="text-xs text-gray-400 text-center">
        Wrong answers heal the boss.{" "}
        {session.boss_healed ? `${Number(session.boss_healed)} HP healed so far. ` : ""}
        {session.boss_crits ? `${Number(session.boss_crits)} critical hits landed.` : ""}
      </p>
    </div>
  );
}
