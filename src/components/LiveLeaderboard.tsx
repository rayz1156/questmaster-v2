"use client";

import { Crown, Flame, User as UserIcon } from "lucide-react";

/**
 * Leaderboard, satu bahasa untuk seluruh platform.
 *
 * Fail ini memiliki rupa pangkat. Leaderboard aktiviti dan halaman Rankings
 * pendidik mengimport pemalar dan komponen tangga di bawah, jadi kuiz
 * langsung, aktiviti dan pangkat kelas mustahil terpisah rupa. Kalau pangkat
 * perlu ditukar rupa, tukar di sini sahaja.
 *
 * Tangga tiga anak (podium) ialah bahagian yang membuatkan orang menjerit
 * dalam bilik kuliah, jadi ia dikekalkan sebagai idea. Yang tidak dibuat
 * ialah konfeti, piala 3D dan bayang berwarna: bentuk tangga itu sendiri
 * sudah memberitahu siapa menang, dan apa-apa lagi hanya bising.
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

/** Bulatan pangkat dan anak tangga. Logam sebenar, tanpa bayang berwarna. */
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

/** Tinggi anak tangga mengikut pangkat. Beza yang cukup untuk dibaca sekilas. */
const STEP_H = [132, 100, 78];

/** Warna dan tinggi anak tangga datang daripada pangkat, bukan kedudukan
 *  dalam baris, supaya markah seri tidak dilukis sebagai gangsa. */
function placeOf(rank: number): number {
  return Math.min(2, Math.max(0, Math.floor(rank) - 1));
}

function initialsOf(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface PodiumEntry {
  rank: number;
  name: string;
  score: number;
  /** Tonjolkan baris pemain atau pasukan yang sedang melihat. */
  me?: boolean;
  streak?: number;
}

/**
 * Tangga tiga anak. Susunan kedua, pertama, ketiga, seperti podium sebenar,
 * supaya juara berada di tengah dan paling tinggi tanpa perlu dilabel.
 */
export function LeaderboardPodium({ rows, className = "" }: { rows: PodiumEntry[]; className?: string }) {
  const top = rows.slice(0, 3);
  if (top.length < 2) return null;

  // Susunan kedua, pertama, ketiga, seperti podium sebenar. `fallback` hanya
  // dipakai untuk ruang kosong bila kurang daripada tiga nama.
  const slots: Array<{ entry: PodiumEntry | undefined; fallback: number }> = [
    { entry: top[1], fallback: 1 },
    { entry: top[0], fallback: 0 },
    { entry: top[2], fallback: 2 },
  ];

  return (
    <div className={`border-b border-hairline ${className}`}>
      <div className="flex items-end justify-center gap-2 sm:gap-3">
        {slots.map(({ entry, fallback }) => {
          if (!entry) {
            return <div key={`gap-${fallback}`} className="flex-1 max-w-[168px]" style={{ height: STEP_H[fallback] }} aria-hidden />;
          }
          const place = placeOf(entry.rank);
          return (
            <div key={`${entry.rank}-${entry.name}`} className="flex-1 max-w-[168px] min-w-0 flex flex-col items-center">
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-[15px] font-semibold shrink-0 ${LB_MEDAL[place]}`}>
                {initialsOf(entry.name)}
              </div>
              <div className={`mt-2 text-sm font-medium truncate max-w-full px-1 ${entry.me ? "text-brand-purple" : "text-ink"}`}>
                {entry.name}
              </div>
              <div className="text-xs text-ink-muted tabular-nums mt-0.5">{entry.score.toLocaleString()} pts</div>
              {(entry.streak ?? 0) >= 2 && (
                <div className="text-xs text-[#8A6100] flex items-center gap-1 mt-0.5">
                  <Flame className="w-3 h-3" /> {entry.streak}
                </div>
              )}
              <div
                className={`mt-2.5 w-full rounded-t-xl flex items-start justify-center pt-2 ${LB_MEDAL[place]} ${
                  entry.me ? "ring-2 ring-brand-purple" : ""
                }`}
                style={{ height: STEP_H[place] }}
              >
                <span className="text-2xl font-semibold tabular-nums">{entry.rank}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function LiveLeaderboard({
  rows,
  title = "Leaderboard",
  subtitle,
  highlight,
  limit,
  emptyText = "No players yet.",
  podium = true,
}: {
  rows: LiveLeaderboardRow[];
  title?: string;
  subtitle?: string;
  /** Nama pemain yang sedang melihat, supaya barisnya ditonjolkan. */
  highlight?: string;
  limit?: number;
  emptyText?: string;
  /** Matikan tangga bila ruang terlalu sempit, contohnya jalur sisi. */
  podium?: boolean;
}) {
  const senarai = typeof limit === "number" ? rows.slice(0, limit) : rows;
  const naikTangga = podium && senarai.length >= 2;
  const atas = naikTangga ? senarai.slice(0, 3) : [];
  const baki = naikTangga ? senarai.slice(3) : senarai;

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
        <>
          {naikTangga && (
            <LeaderboardPodium
              className="mb-5"
              rows={atas.map((r) => ({
                rank: r.rank,
                name: r.nickname,
                score: r.score,
                streak: r.streak,
                me: !!highlight && r.nickname === highlight,
              }))}
            />
          )}

          <div className="space-y-2">
            {baki.map((r, i) => {
              const place = naikTangga ? i + 3 : i;
              const saya = !!highlight && r.nickname === highlight;
              const tile = place < 3 ? LB_TILE[place] : LB_TILE_REST;
              const medal = place < 3 ? LB_MEDAL[place] : LB_MEDAL_REST;
              const pts = place < 3 ? LB_PTS[place] : LB_PTS_REST;
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
        </>
      )}
    </div>
  );
}
