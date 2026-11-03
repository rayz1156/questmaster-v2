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
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { terjemahBilangan } from "@/lib/i18n";

export default function Pasukan({
  teams,
  students,
}: {
  teams: readonly PasukanInsights[];
  students: readonly PelajarInsights[];
}) {
  const { t, bahasa } = useBahasa();
  const [kepala, setKepala] = useState<string | null>(null);

  if (teams.length === 0) return null;

  return (
    <section>
      <h2 className="section-title">{t("insights.export.teamsLabel")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        {teams.map((pas) => {
          const kembang = kepala === pas.team_id;
          // Padanan ahli daripada students; order ikut member_ids pasukan.
          const ahli = pas.member_ids
            .map((id) => students.find((s) => s.user_id === id))
            .filter((s): s is PelajarInsights => Boolean(s))
            .sort((a, b) => b.total_score - a.total_score);
          return (
            <div key={pas.team_id} className="card p-5">
              <button
                type="button"
                onClick={() => setKepala(kembang ? null : pas.team_id)}
                className="w-full text-left"
                aria-expanded={kembang}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-ink truncate">{pas.name}</div>
                  <ChevronDown
                    className={`w-4 h-4 text-ink-faint shrink-0 transition-transform ${kembang ? "rotate-180" : ""}`}
                  />
                </div>
                <div className="flex items-baseline gap-4 mt-2">
                  <div>
                    <div className="text-[26px] leading-none font-semibold tracking-tight text-ink tabular-nums">
                      {formatMata(pas.total_score)}
                    </div>
                    <div className="text-xs text-ink-faint mt-1">{t("insights.pasukan.total")}</div>
                  </div>
                  <div>
                    <div className="text-[26px] leading-none font-semibold tracking-tight text-ink-muted tabular-nums">
                      {pas.avg_per_member === null ? "-" : formatMata(pas.avg_per_member)}
                    </div>
                    <div className="text-xs text-ink-faint mt-1">{t("insights.pasukan.avgPerMember")}</div>
                  </div>
                </div>

                {/* Bar keseimbangan: syuran markah ahli teratas. */}
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-ink-muted mb-1">
                    <span>{t("insights.pasukan.topCarries")}</span>
                    <span>
                      {pas.top_member_share_pct === null
                        ? "-"
                        : `${Math.round(pas.top_member_share_pct)}%`}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#F4F4F6] overflow-hidden">
                    {pas.top_member_share_pct !== null && (
                      <div
                        className="h-full rounded-full bg-[#7057D9]"
                        style={{ width: `${Math.min(100, Math.max(0, pas.top_member_share_pct))}%` }}
                      />
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-3">
                  {pas.flag_unbalanced && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDF3D7] text-[#96661A]">
                      {t("insights.pasukan.oneCarries")}
                    </span>
                  )}
                  {pas.zero_members > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#FDF3D7] text-[#96661A]">
                      {terjemahBilangan(
                        bahasa,
                        "insights.pasukan.zeroMembersOne",
                        "insights.pasukan.zeroMembersOther",
                        pas.zero_members,
                        { n: pas.zero_members },
                      )}
                    </span>
                  )}
                </div>
              </button>

              {kembang && (
                <ul className="divide-y divide-hairline border-t border-hairline mt-3 pt-1">
                  {ahli.length === 0 ? (
                    <li className="py-2 text-sm text-ink-faint">{t("educator.teams.noMembersYet")}</li>
                  ) : (
                    ahli.map((s) => (
                      <li key={s.user_id} className="py-2 flex items-center justify-between gap-3">
                        <span className="text-sm text-ink truncate">{s.name ?? t("insights.unnamed")}</span>
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