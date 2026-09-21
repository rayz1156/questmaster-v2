"use client";

/**
 * People: pelajar, kumpulan dan pendidik sesebuah kelas dalam satu tempat.
 *
 * Sebelum ini ketiga-tiganya berselerak: ahli pada halaman kelas, kumpulan
 * pada skrin global berasingan, pendidik dalam kad di bawah. Orang ialah
 * satu idea, jadi ia satu skrin dengan tiga sub-tab.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import EducatorsCard from "@/components/EducatorsCard";
import { EDU_TABS } from "@/lib/eduTabs";
import { listClassMembers, listTeamsByClass, listClassTeamScores } from "@/lib/data";

type Sub = "students" | "teams" | "educators";

const PALETTE = [
  "bg-[#EAE6FC] text-[#5B42C4]",
  "bg-[#E4EEFD] text-[#2B5FBF]",
  "bg-[#FDE9E4] text-[#B4552F]",
  "bg-[#E3F5EA] text-[#2E7D4F]",
  "bg-[#FCE8F1] text-[#A83E6E]",
  "bg-[#FBF0DC] text-[#96661A]",
];

function initials(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ClassPeoplePage() {
  const { id } = useParams<{ id: string }>() as { id: string };
  const [sub, setSub] = useState<Sub>("students");
  const [members, setMembers] = useState<Record<string, unknown>[]>([]);
  const [teams, setTeams] = useState<Record<string, unknown>[]>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const [ms, ts, ss] = await Promise.all([
          listClassMembers(id),
          listTeamsByClass(id),
          listClassTeamScores(id).catch(() => []),
        ]);
        if (!alive) return;
        setMembers((ms || []) as Record<string, unknown>[]);
        setTeams((ts || []) as Record<string, unknown>[]);
        const map: Record<string, number> = {};
        for (const s of ss || []) map[s.team_id] = Number(s.total_score) || 0;
        setScores(map);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load this class.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const name = (m: Record<string, unknown>) =>
    String(m.display_name || m.full_name || m.email || m.user_id || "Student");

  const shownMembers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((m) => name(m).toLowerCase().includes(needle));
  }, [members, q]);

  const shownTeams = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((t) => String(t.name || "").toLowerCase().includes(needle));
  }, [teams, q]);

  const SubTab = ({ k, label, count }: { k: Sub; label: string; count?: number }) => (
    <button
      onClick={() => setSub(k)}
      className={`relative pb-2.5 px-1 text-[15px] transition ${
        sub === k ? "text-ink font-semibold" : "text-ink-muted hover:text-ink font-medium"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span className="ml-1.5 text-xs text-ink-faint font-medium">{count}</span>
      )}
      {sub === k && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink rounded-full" />}
    </button>
  );

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={id} current="people">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div className="flex items-center gap-6 border-b border-hairline w-full sm:w-auto">
            <SubTab k="students" label="Students" count={members.length} />
            <SubTab k="teams" label="Teams" count={teams.length} />
            <SubTab k="educators" label="Educators" />
          </div>

          {sub !== "educators" && (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="input pl-9"
                placeholder={sub === "students" ? "Search people..." : "Search teams..."}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}
        </div>

        {err && <div className="text-sm text-red-600 mb-4">{err}</div>}
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}

        {!loading && sub === "students" && (
          shownMembers.length === 0 ? (
            <div className="surface py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-brand-purple" />
              </div>
              <div className="section-title mb-1">Your class starts with people.</div>
              <p className="text-sm text-ink-muted">
                Share your class code to welcome your first students.
              </p>
            </div>
          ) : (
            <div className="surface">
              <div className="grid grid-cols-[1fr,120px] sm:grid-cols-[1fr,160px,160px] gap-4 px-5 py-3 bg-[#FAFAFB]">
                <div className="t-head">Name</div>
                <div className="t-head hidden sm:block">Status</div>
                <div className="t-head">Joined</div>
              </div>
              {shownMembers.map((m, i) => (
                <div
                  key={String(m.user_id || i)}
                  className="t-row grid grid-cols-[1fr,120px] sm:grid-cols-[1fr,160px,160px] gap-4 px-5 py-3.5 items-center"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-9 h-9 rounded-full text-[12px] font-semibold flex items-center justify-center shrink-0 ${PALETTE[i % PALETTE.length]}`}>
                      {initials(name(m))}
                    </span>
                    <span className="text-[15px] text-ink truncate">{name(m)}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 text-sm text-ink-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4BA972]" /> Active
                  </div>
                  <div className="text-sm text-ink-muted">
                    {m.joined_at
                      ? new Date(String(m.joined_at)).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                      : ","}
                  </div>
                </div>
              ))}
              <div className="px-5 py-3 border-t border-hairline text-xs text-ink-faint">
                {shownMembers.length} of {members.length}
              </div>
            </div>
          )
        )}

        {!loading && sub === "teams" && (
          shownTeams.length === 0 ? (
            <div className="surface py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
                <Users className="w-6 h-6 text-brand-purple" />
              </div>
              <div className="section-title mb-1">Better learning, together.</div>
              <p className="text-sm text-ink-muted mb-5">Create a team to get started.</p>
              <Link href={`/educator/teams?classId=${id}`} className="btn-primary">Create team</Link>
            </div>
          ) : (
            <div className="surface">
              <div className="flex items-center justify-between px-5 py-3 bg-[#FAFAFB]">
                <div className="t-head">Team</div>
                <div className="flex items-center gap-10">
                  <div className="t-head w-24 text-right">Members</div>
                  <div className="t-head w-16 text-right">Points</div>
                </div>
              </div>
              {shownTeams.map((t, i) => {
                const max = Number(t.max_members) || 6;
                const filled = Number(t.member_count ?? t.members_count ?? 0);
                return (
                  <div key={String(t.id || i)} className="t-row flex items-center justify-between px-5 py-3.5">
                    <span className="text-[15px] text-ink truncate">{String(t.name || "Team")}</span>
                    <div className="flex items-center gap-10">
                      <div className="w-24 flex items-center justify-end gap-2">
                        <span className="flex gap-0.5" aria-hidden>
                          {Array.from({ length: Math.min(max, 8) }).map((_, k) => (
                            <span
                              key={k}
                              className={`w-2 h-1.5 rounded-full ${k < filled ? "bg-brand-purple" : "bg-hairline"}`}
                            />
                          ))}
                        </span>
                        <span className="text-xs text-ink-muted tabular-nums">{filled} of {max}</span>
                      </div>
                      <div className="w-16 text-right text-[15px] text-ink tabular-nums">
                        {scores[String(t.id)] ?? Number(t.score) ?? 0}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
                <span className="text-xs text-ink-faint">{teams.length} teams</span>
                <Link href={`/educator/teams?classId=${id}`} className="btn-quiet text-brand-purple">
                  Manage teams
                </Link>
              </div>
            </div>
          )
        )}

        {!loading && sub === "educators" && <EducatorsCard classId={id} />}
      </ClassShell>
    </Shell>
  );
}
