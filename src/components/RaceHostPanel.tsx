"use client";

/**
 * Panel hos Speed Race (KZ-012): lobi, trek masa nyata, podium, dan mod
 * perbincangan gaya Kahoot selepas lumba tamat.
 *
 * Komponen ini hanya memaparkan data daripada GET /api/live/sessions/[id]
 * dan memanggil `kawal(action)` milik halaman. Tiada logik markah di sini.
 * KZ-013: paparan perbincangan dikeluarkan ke komponen QuestionReview supaya
 * panel Boss Battle memakai paparan yang sama; paparan race tidak berubah.
 */
import { useEffect, useRef, useState } from "react";
import {
  Play, Square, RotateCcw, Flag, Flame, Timer, Users, MessageSquare, Maximize2, Minimize2, Trophy,
} from "lucide-react";
import { formatJam, ordinal, cadanganSoalan, ulanganSoalan } from "@/lib/lumba-laju";
import QuestionReview, { type ReviewHos } from "@/components/QuestionReview";

// KZ-013: jenis kekal dieksport dari sini supaya halaman hos tidak berubah.
export type { ReviewHos };

export interface PemainLumba {
  id: string;
  nickname: string;
  score: number;
  streak?: number;
  best_streak?: number;
  race_distance: number | string | null;
  race_rank: number | null;
  race_frozen_until: string | null;
  race_finished_at?: string | null;
  kedudukan: number;
}
export interface SesiLumbaHos {
  id: string;
  code: string;
  status: string;
  game_mode?: string | null;
  race_minutes?: number | null;
  race_ends_at?: string | null;
  race_finished?: number | null;
  review_index?: number | null;
  review_revealed?: boolean | null;
}

interface Props {
  session: SesiLumbaHos;
  players: PemainLumba[];
  questionCount: number;
  serverNow: string | null;
  review: ReviewHos | null;
  busy: boolean;
  kawal: (action: string) => void;
}

// Warna kereta tetap ikut kedudukan dalam senarai asal (bukan kedudukan
// lumba) supaya kereta tidak bertukar warna apabila memotong.
const WARNA_KERETA = [
  "#7c3aed", "#d97706", "#059669", "#dc2626", "#2563eb", "#db2777", "#0d9488", "#65a30d",
  "#9333ea", "#ea580c", "#0891b2", "#4f46e5",
];
const HAD_LORONG = 15;

function inisial(nama: string): string {
  const bah = nama.trim().split(/\s+/).filter(Boolean);
  if (bah.length >= 2) return (bah[0][0] + bah[1][0]).toUpperCase();
  return nama.trim().slice(0, 2).toUpperCase() || "?";
}

export default function RaceHostPanel({ session, players, questionCount, serverNow, review, busy, kawal }: Props) {
  const [kini, setKini] = useState(() => Date.now());
  const [penuh, setPenuh] = useState(false);
  const sorokRef = useRef(0);

  useEffect(() => {
    if (serverNow) sorokRef.current = Date.now() - new Date(serverNow).getTime();
  }, [serverNow]);
  useEffect(() => {
    const t = setInterval(() => setKini(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Pintasan papan kekunci dalam mod perbincangan (bukan semasa menaip).
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
      // Kawal sempadan di klien supaya tiada amaran pelayar di projektor.
      if (e.key === "ArrowRight" && rvIndeks >= 0 && rvIndeks < rvJumlah - 1) kawal("review_next");
      else if (e.key === "ArrowLeft" && rvIndeks > 0) kawal("review_prev");
      else if ((e.key === "r" || e.key === "R") && !rvDedah) kawal("review_reveal");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dalamReview, busy, kawal, rvIndeks, rvJumlah, rvDedah]);

  const jamPelayan = kini - sorokRef.current;
  const bakiMs = session.race_ends_at ? Date.parse(session.race_ends_at) - jamPelayan : null;
  const sampai = session.race_finished ?? players.filter((p) => p.race_rank).length;
  const warnaPemain = new Map<string, string>();
  [...players].sort((a, b) => a.id.localeCompare(b.id)).forEach((p, i) => {
    warnaPemain.set(p.id, WARNA_KERETA[i % WARNA_KERETA.length]);
  });

  const butangHenti = (
    <button
      onClick={() => kawal("end")}
      disabled={busy}
      className="px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 text-sm flex items-center gap-1 disabled:opacity-50"
    >
      <Square className="w-4 h-4" /> Stop race
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

  // ---------- Lobi ----------
  if (session.status === "lobby") {
    const minit = session.race_minutes ?? 5;
    const c = cadanganSoalan(minit);
    const ulang = ulanganSoalan(c.disyorkan, questionCount);
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-violet-900 flex items-center gap-2">
                <Flag className="w-4 h-4" /> Speed Race · {minit} min
              </div>
              <p className="text-sm text-violet-900/80 mt-1">
                Students answer at their own pace. Correct, fast answers move their car further.
                Three wrong answers in a row freeze a car for 5 seconds.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => kawal("start")}
                disabled={busy || players.length === 0}
                className="py-2 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 disabled:opacity-50 flex items-center gap-1"
              >
                <Play className="w-4 h-4" /> Start race
              </button>
              {butangHenti}
            </div>
          </div>
          {questionCount < c.disyorkan && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
              This quiz has {questionCount} questions. Each question may repeat up to {ulang} times in a{" "}
              {minit}-minute race. For no repeats, use at least {c.disyorkan} questions.
            </p>
          )}
        </div>
        <div className="card">
          <div className="font-semibold mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" /> On the start line ({players.length})
          </div>
          {players.length === 0 ? (
            <p className="text-sm text-gray-500">No racers yet. Share the code above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-2 py-1 text-sm">
                  <span className="w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold text-white" style={{ background: warnaPemain.get(p.id) }}>
                    {inisial(p.nickname)}
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

  // ---------- Perbincangan gaya Kahoot (komponen kongsi KZ-013) ----------
  if (dalamReview && review) {
    const isi = (
      <QuestionReview
        review={review}
        busy={busy}
        kawal={kawal}
        penuh={penuh}
        setPenuh={setPenuh}
      />
    );
    return penuh ? (
      <div className="fixed inset-0 z-50 bg-white overflow-auto flex items-center justify-center p-6">{isi}</div>
    ) : (
      <div className="card">{isi}</div>
    );
  }

  // ---------- Tamat: podium ----------
  if (session.status === "ended") {
    const tiga = players.slice(0, 3);
    const susunPodium = [tiga[1], tiga[0], tiga[2]];
    const tinggi = ["h-24", "h-32", "h-20"];
    const kedudukanPodium = [2, 1, 3];
    return (
      <div className="space-y-4">
        <div className="card">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
            <div className="font-semibold flex items-center gap-2"><Trophy className="w-5 h-5 text-amber-500" /> Race results</div>
            <button
              onClick={() => kawal("review_start")}
              disabled={busy || questionCount === 0}
              className="py-2 px-4 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 flex items-center gap-1 disabled:opacity-50"
            >
              <MessageSquare className="w-4 h-4" /> Discuss questions
            </button>
          </div>
          {players.length === 0 ? (
            <p className="text-sm text-gray-500">Nobody joined this race.</p>
          ) : (
            <div className="flex items-end justify-center gap-3 mb-2">
              {susunPodium.map((p, i) =>
                p ? (
                  <div key={p.id} className="w-24 sm:w-28 text-center">
                    <div className="text-sm font-semibold truncate">{p.nickname}</div>
                    <div className="text-[11px] text-gray-500 tabular-nums">{p.score.toLocaleString()} pts</div>
                    <div className={`${tinggi[i]} mt-1 rounded-t-xl grid place-items-start justify-center pt-2 text-white text-2xl font-bold ${i === 1 ? "bg-violet-600" : i === 0 ? "bg-indigo-500" : "bg-indigo-300"}`}>
                      {kedudukanPodium[i]}
                    </div>
                  </div>
                ) : (
                  <div key={`kosong-${i}`} className="w-24 sm:w-28" />
                ),
              )}
            </div>
          )}
        </div>
        {players.length > 0 && (
          <div className="card">
            <div className="font-semibold mb-2">Full standings</div>
            <ol className="divide-y divide-gray-100 text-sm">
              {players.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-1.5 gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="w-6 text-right tabular-nums text-gray-500">{p.kedudukan}.</span>
                    <span className="truncate">{p.nickname}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span className="text-xs text-gray-500">
                      {p.race_rank ? `Finished ${ordinal(p.race_rank)}` : `${Math.round(Number(p.race_distance) || 0)}%`}
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

  // ---------- Berlumba: trek ----------
  const penuhLorong = players.slice(0, players.length > HAD_LORONG ? 10 : HAD_LORONG);
  const titik = players.length > HAD_LORONG ? players.slice(10) : [];
  const trek = (
    <div className={`rounded-2xl bg-[#211d33] text-white p-4 ${penuh ? "w-full max-w-7xl" : ""}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div className="font-bold text-lg flex items-center gap-2"><Flag className="w-5 h-5" /> Speed Race</div>
        <div className="flex items-center gap-2">
          <span className={`font-mono font-bold text-sm rounded-full px-3 py-1 tabular-nums inline-flex items-center gap-1 ${bakiMs !== null && bakiMs <= 30000 ? "bg-amber-600" : "bg-white/10"}`}>
            <Timer className="w-4 h-4" /> {bakiMs !== null ? formatJam(bakiMs) : "--:--"}
          </span>
          <span className="font-mono font-bold text-sm rounded-full px-3 py-1 bg-white/10 tabular-nums">
            {sampai}/{players.length} finished
          </span>
        </div>
      </div>
      <div className="space-y-1">
        {penuhLorong.map((p) => {
          const jarak = Math.max(0, Math.min(100, Number(p.race_distance) || 0));
          const beku = !!p.race_frozen_until && Date.parse(p.race_frozen_until) > jamPelayan;
          return (
            <div key={p.id} className="grid grid-cols-[88px_minmax(0,1fr)_40px] sm:grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-2 h-9">
              <div className="text-xs sm:text-sm font-semibold truncate">{p.nickname}</div>
              <div className="relative h-full border-b border-dashed border-white/15">
                <div
                  className="absolute right-0 top-0 bottom-0 w-2.5 opacity-80"
                  style={{ backgroundImage: "repeating-conic-gradient(#fff 0 25%, #222 0 50%)", backgroundSize: "10px 10px" }}
                />
                <div
                  className={`absolute top-1 h-7 w-11 rounded-[9px_14px_14px_9px] grid place-items-center text-[10px] font-bold shadow motion-safe:transition-[left] motion-safe:duration-300
                    ${beku ? "saturate-0 brightness-125 outline outline-2 outline-sky-300" : ""}`}
                  style={{ left: `calc((100% - 54px) * ${jarak / 100})`, background: warnaPemain.get(p.id) }}
                >
                  {inisial(p.nickname)}
                  {p.race_rank ? (
                    <span className="absolute -top-2 -right-2 rounded-md bg-white text-gray-900 px-1 text-[9px] font-mono">#{p.race_rank}</span>
                  ) : (p.streak ?? 0) >= 3 ? (
                    <span className="absolute -top-2 -right-2 rounded-md bg-orange-500 px-1 text-[9px] font-mono inline-flex items-center">
                      <Flame className="w-2.5 h-2.5" />{p.streak}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="text-right font-mono text-xs opacity-75 tabular-nums">{Math.round(jarak)}%</div>
            </div>
          );
        })}
      </div>
      {titik.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] opacity-70 mb-1">{titik.length} more racers</div>
          <div className="relative h-5 rounded-full bg-white/5">
            {titik.map((p) => (
              <span
                key={p.id}
                title={p.nickname}
                className="absolute top-1 w-3 h-3 rounded-full motion-safe:transition-[left] motion-safe:duration-300"
                style={{ left: `calc((100% - 12px) * ${Math.max(0, Math.min(100, Number(p.race_distance) || 0)) / 100})`, background: warnaPemain.get(p.id) }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-4 mt-3 text-[11px] opacity-75">
        <span className="inline-flex items-center gap-1"><Flame className="w-3 h-3 text-orange-400" /> 3+ correct in a row</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm outline outline-2 outline-sky-300" /> Skidded, frozen 5 s</span>
        <span>#n finished</span>
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
          {trek}
          <div className="flex gap-2">{butangHenti}{butangPenuh}</div>
        </div>
      ) : (
        trek
      )}
    </div>
  );
}
