"use client";

import { Trophy, Crown, Flame, User as UserIcon } from "lucide-react";

/**
 * Leaderboard Live Quiz.
 *
 * Reka bentuk sengaja disalin daripada leaderboard aktiviti
 * (src/app/participant/leaderboard/page.tsx): jubin bulat pangkat dengan
 * gradien emas, perak dan gangsa untuk tiga teratas, pil mata di kanan, dan
 * kad putih rounded-2xl dengan tera air Crown. Satu platform, satu rupa.
 *
 * Kalau leaderboard aktiviti berubah rupa, ubah fail ini sekali.
 */

export interface LiveLeaderboardRow {
  rank: number;
  nickname: string;
  score: number;
  /** Rentetan jawapan betul semasa, dipapar bila 2 ke atas. */
  streak?: number;
}

const TILE = [
  "bg-gradient-to-r from-yellow-50 via-amber-50 to-yellow-50 border-yellow-200",
  "bg-gradient-to-r from-slate-50 via-gray-50 to-slate-50 border-gray-200",
  "bg-gradient-to-r from-orange-50 via-rose-50 to-orange-50 border-orange-200",
];
const MEDAL = [
  "bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-yellow-200",
  "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-slate-200",
  "bg-gradient-to-br from-orange-400 to-amber-700 text-white shadow-orange-200",
];
const PTS = [
  "bg-yellow-100 text-amber-700",
  "bg-slate-100 text-slate-700",
  "bg-orange-100 text-orange-700",
];
const SIDE = ["text-yellow-400", "text-slate-300", "text-orange-300"];

export default function LiveLeaderboard({
  rows,
  title = "Leaderboard",
  subtitle,
  highlight,
  limit,
  emptyText = "No players yet.",
}: {
  rows: LiveLeaderboardRow[];
  title?: string;
  subtitle?: string;
  /** Nama pemain yang sedang melihat, supaya barisnya ditonjolkan. */
  highlight?: string;
  limit?: number;
  emptyText?: string;
}) {
  const senarai = typeof limit === "number" ? rows.slice(0, limit) : rows;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-4 sm:p-5">
      <Crown className="absolute -top-2 -right-2 w-16 h-16 text-purple-100 opacity-70 pointer-events-none" />

      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-700 text-white flex items-center justify-center shrink-0 shadow-md">
          <Trophy className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-base sm:text-lg">{title}</div>
          {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
        </div>
      </div>

      {senarai.length === 0 ? (
        <p className="text-xs text-gray-500">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {senarai.map((r, i) => {
            const saya = !!highlight && r.nickname === highlight;
            const tile = i < 3 ? TILE[i] : "bg-white border-gray-100 hover:bg-gray-50";
            const medal = i < 3 ? MEDAL[i] : "bg-gray-200 text-gray-600";
            const pts = i < 3 ? PTS[i] : "bg-purple-50 text-purple-700";
            return (
              <div
                key={`${r.rank}-${r.nickname}`}
                className={`relative flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition ${tile} ${
                  saya ? "ring-2 ring-purple-400" : ""
                }`}
              >
                <div
                  className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center text-lg font-extrabold shadow ${medal}`}
                >
                  {r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm sm:text-base truncate flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-purple-400 shrink-0" />
                    <span className="truncate">{r.nickname}</span>
                    {saya && <span className="text-[10px] font-semibold text-purple-600 shrink-0">you</span>}
                  </div>
                  {(r.streak ?? 0) >= 2 && (
                    <div className="text-xs text-amber-600 font-semibold flex items-center gap-1 mt-0.5">
                      <Flame className="w-3 h-3" /> {r.streak} in a row
                    </div>
                  )}
                </div>
                <div className={`shrink-0 flex items-center justify-center min-w-[64px] px-3 py-1.5 rounded-xl ${pts}`}>
                  <div className="text-center">
                    <div className="font-extrabold text-lg leading-none">{r.score}</div>
                    <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none mt-0.5">pts</div>
                  </div>
                </div>
                {i < 3 && <span className={`shrink-0 text-lg ${SIDE[i]}`}>★</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
