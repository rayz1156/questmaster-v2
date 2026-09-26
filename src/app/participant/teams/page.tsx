"use client";
import ParticipantShell from "@/components/ParticipantShell";

import Link from "next/link";
import { useEffect, useState, Suspense, useMemo } from "react";
import { Home,
  Compass,
  Trophy,
  User as UserIcon,
  Users,
  KeyRound,
  GraduationCap,
  ClipboardList,
  ExternalLink,
  ChevronRight,
  LogOut,
  Check,
  Pencil,
  X, BookOpen } from "lucide-react";
import {
  listTeamsByClass,
  listEnrolledClasses,
  joinTeamByCode,
  leaveTeam,
  renameTeam,
  listTeamMembers,
  type Klass,
} from "@/lib/data";
import { getBoardForClass } from "@/lib/boards";
import PeerReviewBanner from "@/components/PeerReviewBanner";
import { useSession } from "@/lib/session";
import { useConfirm } from '@/components/ui/ConfirmProvider';


// Soft pastel palette used to colorize team avatars (cycled deterministically by index)
const AVATAR_PALETTE = [
  { bg: "bg-purple-100", text: "text-purple-600" },
  { bg: "bg-amber-100", text: "text-amber-600" },
  { bg: "bg-emerald-100", text: "text-emerald-600" },
  { bg: "bg-rose-100", text: "text-rose-600" },
  { bg: "bg-sky-100", text: "text-sky-600" },
  { bg: "bg-yellow-100", text: "text-yellow-600" },
  { bg: "bg-indigo-100", text: "text-indigo-600" },
  { bg: "bg-pink-100", text: "text-pink-600" },
  { bg: "bg-teal-100", text: "text-teal-600" },
];

function Inner() {
  const { session, loading: authLoading } = useSession();
  const [classes, setClasses] = useState<Klass[]>([]);
  const confirm = useConfirm();
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [countMap, setCountMap] = useState<Record<string, number>>({});
  const [membersByTeam, setMembersByTeam] = useState<Record<string, any[]>>({});
  const [introBoardId, setIntroBoardId] = useState<string | null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  const uid = session?.id ?? null;

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const cs = await listEnrolledClasses();
        setClasses(cs);
        if (cs.length > 0) setActiveClassId(cs[0].id);
      } catch {}
      finally {
        setLoading(false);
      }
    })();
  }, [authLoading]);

  useEffect(() => {
    if (!activeClassId) {
      setTeams([]);
      setIntroBoardId(null);
      return;
    }
    setLoading(true);
    // Load intro board id (best-effort; absence is fine)
    getBoardForClass(activeClassId)
      .then((b) => setIntroBoardId(b?.id ?? null))
      .catch(() => setIntroBoardId(null));

    listTeamsByClass(activeClassId)
      .then(async (ts) => {
        setTeams(ts as any);
        // Load members for each team so we can compute "my team" + counts
        if (uid && ts.length > 0) {
          const allMembers: Record<string, any[]> = {};
          await Promise.all(
            (ts as any[]).map(async (team: any) => {
              try {
                const ms = await listTeamMembers(team.id);
                allMembers[team.id] = ms;
              } catch {}
            })
          );
          setMembersByTeam((prev) => ({ ...prev, ...allMembers }));
          const myTeam = (ts as any[]).find((team: any) =>
            allMembers[team.id]?.some((m: any) => m.user_id === uid)
          );
          if (myTeam) setExpandedTeam((myTeam as any).id);
        }
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data } = await supabase.rpc("qm_team_member_counts", { p_class_id: activeClassId });
          if (data) {
            const m: Record<string, number> = {};
            for (const r of data as any[]) m[r.team_id] = Number(r.cnt);
            setCountMap(m);
          }
        } catch {}
      })
      .finally(() => setLoading(false));
  }, [activeClassId, uid]);

  const myTeam = useMemo(() => {
    if (!uid) return null;
    return teams.find((t: any) => (membersByTeam[t.id] || []).some((m: any) => m.user_id === uid)) || null;
  }, [teams, membersByTeam, uid]);

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinMsg(null);
    try {
      await joinTeamByCode(code.trim().toUpperCase());
      setJoinMsg({ type: "ok", text: "Joined team successfully!" });
      setCode("");
      if (activeClassId) {
        const ts = await listTeamsByClass(activeClassId);
        setTeams(ts as any);
      }
    } catch (err: any) {
      setJoinMsg({ type: "err", text: err?.message || "Failed to join team" });
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleJoinTeam(team: any) {
    if (!team.join_code) return;
    try {
      await joinTeamByCode(team.join_code);
      if (activeClassId) {
        const ts = await listTeamsByClass(activeClassId);
        setTeams(ts as any);
        const ms = await listTeamMembers(team.id);
        setMembersByTeam((p) => ({ ...p, [team.id]: ms }));
      }
      setExpandedTeam(team.id);
    } catch (err: any) {
      alert(err?.message || "Failed to join");
    }
  }

  async function handleLeave(team: any) {
    if (!(await confirm({ title: "Leave this team?", tone: 'danger' }))) return;
    try {
      await leaveTeam(team.id);
      setMembersByTeam((p) => {
        const n = { ...p };
        delete n[team.id];
        return n;
      });
      if (activeClassId) {
        const ts = await listTeamsByClass(activeClassId);
        setTeams(ts as any);
      }
    } catch (err: any) {
      alert(err?.message || "Failed");
    }
  }

  return (
    <ParticipantShell>
      <div className="max-w-shell mx-auto px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow mb-1">Teams</div>
            <h1 className="page-title">Better together.</h1>
            <p className="page-subtitle">Join a team to collaborate and earn points together.</p>
          </div>
          <select
            value={activeClassId}
            onChange={(e) => setActiveClassId(e.target.value)}
            disabled={classes.length === 0}
            aria-label="Select class"
            className="input w-auto min-w-[220px]"
          >
            {classes.length === 0 && <option>No enrolled classes</option>}
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <PeerReviewBanner />

        <div className="mt-8 flex flex-wrap items-start gap-x-10 gap-y-4">
          <form onSubmit={handleJoinByCode} className="min-w-0">
            <div className="text-sm font-medium text-ink mb-1.5">Join a team by code</div>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Team code"
                autoCapitalize="characters"
                autoComplete="off"
                className="input w-[200px] font-mono uppercase tracking-[0.2em]"
              />
              <button type="submit" disabled={joinBusy || !code.trim()} className="btn-secondary shrink-0">
                {joinBusy ? "Joining…" : "Join"}
              </button>
            </div>
            {joinMsg && (
              <p className={`mt-2 text-sm ${joinMsg.type === "ok" ? "text-[#2E7D4F]" : "text-[#C0392B]"}`}>{joinMsg.text}</p>
            )}
          </form>

          {introBoardId && (
            <div className="pt-6">
              <Link href={`/participant/classes/${activeClassId}/board`} className="btn-quiet text-brand-purple">
                Open Intro Board <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Available teams */}
        <section>
          <div className="section-title mb-3">
            Teams in this class{teams.length > 0 ? ` (${teams.length})` : ""}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-[#F4F4F6] animate-pulse"
                />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <p className="text-sm text-ink-muted py-6">No teams in this class yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teams.map((t: any, idx: number) => {
                const palette = AVATAR_PALETTE[idx % AVATAR_PALETTE.length];
                const members = membersByTeam[t.id] || [];
                const count = countMap[t.id] ?? members.length ?? 0;
                const maxM = t.max_members ?? 5;
                const isMine = members.some((m: any) => m.user_id === uid);
                const isFull = count >= maxM;
                const hasMyTeam = !!myTeam;
                const isExp = expandedTeam === t.id;
                return (
                  <div
                    key={t.id}
                    className={`group rounded-2xl bg-white border ${
                      isMine ? "border-brand-purple" : "border-hairline"
                    } overflow-hidden transition`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTeam(isExp ? null : t.id)}
                      className="w-full text-left flex items-center gap-3 p-4 hover:bg-[#FAFAFB] transition"
                    >
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${palette.bg}`}
                      >
                        <Users className={`w-5 h-5 ${palette.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {renamingId === t.id ? (
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (!renameVal.trim()) return;
                                try {
                                  await renameTeam(t.id, renameVal.trim());
                                  setTeams((ts: any) =>
                                    ts.map((x: any) =>
                                      x.id === t.id ? { ...x, name: renameVal.trim() } : x
                                    )
                                  );
                                  setRenamingId(null);
                                } catch (err: any) {
                                  alert(err?.message || "Failed");
                                }
                              }}
                              className="flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                autoFocus
                                value={renameVal}
                                onChange={(e) => setRenameVal(e.target.value)}
                                className="w-32 rounded border border-gray-200 px-1 py-0.5 text-sm focus:border-purple-400 focus:outline-none"
                              />
                              <button
                                type="submit"
                                className="text-emerald-600"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(null);
                                }}
                                className="text-gray-400"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </form>
                          ) : (
                            <>
                              <div className="text-[15px] font-medium text-ink truncate">{t.name}</div>
                              {isMine && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRenamingId(t.id);
                                    setRenameVal(t.name);
                                  }}
                                  className="text-gray-300 hover:text-purple-600"
                                  title="Rename team"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </>
                          )}
                          {isMine && (
                            <span className="ml-1 inline-flex items-center rounded-full bg-[#F4F2FD] text-brand-purple px-2 py-0.5 text-[11px] font-medium">
                              Your team
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-ink-muted mt-0.5 tabular-nums">
                          {count}/{maxM} members
                        </div>
                        {/* Inline action under name */}
                        <div className="mt-2">
                          {isMine ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLeave(t);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-hairline text-[#C0392B] hover:bg-[#FDEBEA] px-2.5 py-1 text-xs font-medium"
                            >
                              <LogOut className="w-3 h-3" /> Leave team
                            </button>
                          ) : hasMyTeam ? (
                            <span className="text-xs text-ink-faint">Already in a team</span>
                          ) : isFull ? (
                            <span className="text-xs text-ink-faint">Team full</span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJoinTeam(t);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-hairline text-brand-purple hover:bg-[#F4F2FD] px-2.5 py-1 text-xs font-medium"
                            >
                              Join this team
                            </button>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 text-ink-faint shrink-0 transition ${
                          isExp ? "rotate-90 text-brand-purple" : ""
                        }`}
                      />
                    </button>

                    {/* Expanded members */}
                    {isExp && (
                      <div className="border-t border-hairline px-4 py-3 bg-[#FAFAFB]">
                        <div className="eyebrow mb-2">Members</div>
                        {members.length === 0 ? (
                          <p className="text-sm text-ink-faint">No members yet.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {members.map((m: any) => (
                              <li
                                key={m.user_id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <div className="w-6 h-6 rounded-full bg-[#EAE6FC] text-brand-purple flex items-center justify-center text-[10px] font-semibold shrink-0">
                                  {(m.profile?.display_name || "?")[0].toUpperCase()}
                                </div>
                                <span className="text-ink">
                                  {m.profile?.display_name || "User " + String(m.user_id).slice(0, 8)}
                                </span>
                                {m.user_id === uid && (
                                  <span className="text-xs text-brand-purple">you</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ParticipantShell>
  );
}

export default function ParticipantTeams() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-400">Loading…</p>}>
      <Inner />
    </Suspense>
  );
}
