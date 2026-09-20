"use client";

import { Crown, Flame, User as UserIcon } from "lucide-react";

/**
 * Leaderboard, satu bahasa untuk seluruh platform.
 *
 * Fail ini memiliki rupa jubin pangkat. Leaderboard aktiviti
 * (src/app/participant/leaderboard/page.tsx) mengimport pemalar di bawah,
 * jadi kuiz langsung dan aktiviti tidak boleh terpisah rupa lagi. Kalau
 * pangkat perlu ditukar rupa, tukar di sini sahaja.
 *
 * Pingat kekal emas, perak dan gangsa kerana itulah maknanya. Yang dibuang
 * ialah bayang berwarna, bintang di tepi dan teks kecerunan: tiga perkara
 * yang menjerit tanpa memberitahu apa-apa.
 */

export interface LiveLeaderboardRow {
  rank: number;
  nickname: string;
  score: number;
  /** Rentetan jawapan betul semasa, dipapar bila 2 ke atas. */
  streak?: number;
}

/** Latar jubin untuk tiga teratas. */
export const LB_TILE = [
  "bg-[#FFFBEF] border-[#F0DFB4]",
  "bg-[#F8F8FA] border-hairline",
  "bg-[#FDF5EE] border-[#EFDBC8]",
];
export const LB_TILE_REST = "bg-white border-hairline hover:bg-[#FAFAFB]";

/** Bulatan pangkat. Logam sebenar, tanpa bayang berwarna. */
export const LB_MEDAL = [
  "bg-gradient-to-br from-[#F3C455] to-[#D19B28] text-white",
  "bg-gradient-to-br from-[#D2D6DD] to-[#A5ABB6] text-white",
  "bg-gradient-to-br from-[#D79A63] to-[#A96B33] text-white",
];
export const LB_MEDAL_REST = "bg-[#F1F1F4] text-ink-muted";

/** Pil mata di hujung kanan. */
export const LB_PTS = [
  "bg-[#FBF1D9] text-[#8A6100]",
  "bg-[#EFF0F3] text-ink-muted",
  "bg-[#F8E9DC] text-[#8A4B18]",
];
export const LB_PTS_REST = "bg-[#F4F2FD] text-brand-purple";

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
    <div className="relative overflow-hidden rounded-2xl bg-white border border-hairline p-5">
      <Crown className="absolute -top-2 -right-2 w-16 h-16 text-[#EFEBFB] pointer-events-none" />

      <div className="mb-4">
        <div className="section-title">{title}</div>
        {subtitle && <div className="text-sm text-ink-muted mt-0.5">{subtitle}</div>}
      </div>

      {senarai.length === 0 ? (
        <p className="text-sm text-ink-muted">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {senarai.map((r, i) => {
            const saya = !!highlight && r.nickname === highlight;
            const tile = i < 3 ? LB_TILE[i] : LB_TILE_REST;
            const medal = i < 3 ? LB_MEDAL[i] : LB_MEDAL_REST;
            const pts = i < 3 ? LB_PTS[i] : LB_PTS_REST;
            return (
              <div
                key={`${r.rank}-${r.nickname}`}
                className={`flex items-center gap-3 p-3 sm:p-4 rounded-2xl border transition ${tile} ${
                  saya ? "ring-2 ring-brand-purple" : ""
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold tabular-nums shrink-0 ${medal}`}>
                  {r.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-medium text-ink truncate flex items-center gap-1.5">
                    <UserIcon className="w-4 h-4 text-ink-faint shrink-0" />
                    <span className="truncate">{r.nickname}</span>
                    {saya && <span className="text-xs text-brand-purple shrink-0">you</span>}
                  </div>
                  {(r.streak ?? 0) >= 2 && (
                    <div className="text-xs text-[#8A6100] flex items-center gap-1 mt-0.5">
                      <Flame className="w-3 h-3" /> {r.streak} in a row
                    </div>
                  )}
                </div>
                <div className={`shrink-0 min-w-[64px] px-3 py-1.5 rounded-xl text-center ${pts}`}>
                  <div className="text-lg font-semibold leading-none tabular-nums">{r.score}</div>
                  <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none mt-0.5">pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
