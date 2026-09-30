"use client";

/**
 * Teams (bahagian F): kad setiap pasukan dengan jumlah, purata seorang
 * ahli dan bar keseimbangan (syuran ahli teratas). Kad boleh diklik untuk
 * mengembangkan senarai ahli dengan total individu daripada data students
 * (tiada panggilan rangkaian tambahan). Lencana amber menandakan pasukan
 * dibawa oleh seorang ahli atau mempunyai ahli tanpa mata.
 */
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PasukanInsights, PelajarInsights } from "@/lib/insightsKelas";
import { formatMata } from "@/lib/markahPeserta";

export default function Pasukan({
  teams,
  students,
}: {
  teams: readonly PasukanInsights[];
  students: readonly PelajarInsights[];
}) {
  const [kepala, setKepala] = useState<string | null>(null);

  if (teams.length === 0) return null;

  return (
    <section>
      <h2 className="section-title">Teams</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {teams.map((t) => {
          const kembang = kepala === t.team_id;
          // Padanan ahli daripada students; order ikut member_ids pasukan.
          const ahli = t.member_ids
            .map((id) => students.find((s) => s.user_id === id))
            .filter((s): s is PelajarInsights => Boolean(s))
            .sort((a, b) => b.total_score - a.total_score);
          return (
            <div key={t.team_id} className="card p-5">
              <button
                type="button"
                onClick={() => setKepala(kembang ? null : t.team_id)}
                className="w-full text-left"
                aria-expanded={kembang}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-ink truncate">{t.name}</div>
                  <ChevronDown
                    className={`w-4 h-4 text-ink-faint shrink-0 transition-transform ${kembang ? "rotate-180" : ""}`}
                  />
                </div>
                <div className="flex items-baseline gap-4 mt-2">
                  <div>
                    <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">
                      {formatMata(t.total_score)}
                    </div>
                    <div className="text-xs text-ink-faint mt-1">total</div>
                  </div>
                  <div>
                    <div className="text-[26px] leading-none font-semibold tracking-tight text-ink-muted tabular-nums">
                      {t.avg_per_member === null ? "-" : formatMata(t.avg_per_member)}
                    </div>
                    <div className="text-xs text-ink-faint mt-1">avg per member</div>
                  </div>
                </div>

                {/* Bar keseimbangan: syuran markah ahli teratas. */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>Top member carries</span>
                    <span>
                      {t.top_member_share_pct === null
                        ? "-"
                        : `${Math.round(t.top_member_share_pct)}%`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#F4F4F6] overflow-hidden">
                    {t.top_member_share_pct !== null && (
                      <div
                        className="h-full rounded-full bg-[#7057D9]"
                        style={{ width: `${Math.min(100, Math.max(0, t.top_member_share_pct))}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {t.flag_unbalanced && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDF3D7] text-[#96661A]">
                      One member carries the team
                    </span>
                  )}
                  {t.zero_members > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDF3D7] text-[#96661A]">
                      {t.zero_members} {t.zero_members === 1 ? "member" : "members"} with 0 points
                    </span>
                  )}
                </div>
              </button>

              {kembang && (
                <ul className="divide-y divide-hairline border-t border-hairline mt-3 pt-1">
                  {ahli.length === 0 ? (
                    <li className="py-2 text-sm text-ink-faint">No members yet.</li>
                  ) : (
                    ahli.map((s) => (
                      <li key={s.user_id} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-sm text-ink truncate">{s.name ?? "Unnamed learner"}</span>
                        <span className="text-sm text-ink-muted tabular-nums shrink-0">
                          {formatMata(s.total_score)}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}