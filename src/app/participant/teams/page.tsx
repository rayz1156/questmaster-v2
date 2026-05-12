"use client";

import Shell from "@/components/Shell";
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
import { useSession } from "@/lib/session";
import { useConfirm } from '@/components/ui/ConfirmProvider';

const navTabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5" /> },
      { href: '/participant/learning', label: 'Learning', icon: <BookOpen className="w-5 h-5" /> },
      { href: "/participant/activities", label: "Activities", icon: <Compass className="w-5 h-5" /> },
  { href: "/participant/teams", label: "Teams", icon: <Users className="w-5 h-5" /> },
  { href: "/participant/leaderboard", label: "Ranking", icon: <Trophy className="w-5 h-5" /> },
  { href: "/participant/profile", label: "Profile", icon: <UserIcon className="w-5 h-5" /> },
];

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
    <Shell tabs={navTabs}>
      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Hero header */}
        <section className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm">
          <div className="flex items-start gap-4 p-5 sm:p-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-purple-100">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Teams</h1>
              <p className="text-sm text-gray-500 mt-1 max-w-xl">
                Join a team to collaborate, share ideas, and achieve more together.
              </p>
            </div>
            {/* Decorative SVG illustration (right side, hidden on small screens) */}
            <svg
              className="hidden md:block w-48 lg:w-56 h-24 shrink-0"
              viewBox="0 0 220 100"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="60" cy="50" r="22" fill="#c4b5fd" />
              <circle cx="110" cy="42" r="26" fill="#a78bfa" />
              <circle cx="160" cy="50" r="22" fill="#c4b5fd" />
              <circle cx="60" cy="42" r="8" fill="#fde68a" />
              <circle cx="110" cy="32" r="9" fill="#fde68a" />
              <circle cx="160" cy="42" r="8" fill="#fde68a" />
              <rect x="82" y="70" width="56" height="8" rx="4" fill="#7c3aed" />
              <rect x="90" y="60" width="40" height="14" rx="3" fill="#1f2937" />
            </svg>
          </div>
        </section>

        {/* Join by code */}
        <section className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4 sm:p-5">
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100">
              <KeyRound className="w-5 h-5 text-purple-600" />
            </div>
            <form onSubmit={handleJoinByCode} className="flex-1 min-w-0">
              <label className="block text-sm font-semibold text-gray-900">Join a team by code</label>
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter team code"
                  className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm placeholder:text-gray-400 focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100 uppercase tracking-wider"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={joinBusy || !code.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed transition"
                >
                  {joinBusy ? "Joining\u2026" : (<><LogOut className="w-4 h-4 rotate-180" /> Join</>)}
                </button>
              </div>
              {joinMsg && (
                <p
                  className={`mt-2 text-xs font-medium ${
                    joinMsg.type === "ok" ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {joinMsg.text}
                </p>
              )}
            </form>
          </div>
        </section>

        {/* Class selector + Intro board */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100">
                <GraduationCap className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">Select class</div>
                <select
                  value={activeClassId}
                  onChange={(e) => setActiveClassId(e.target.value)}
                  disabled={classes.length === 0}
                  className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  {classes.length === 0 && <option>No enrolled classes</option>}
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100">
                <ClipboardList className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900">Intro Board</div>
                <p className="text-xs text-gray-500 mt-0.5">
                  View announcements, guidelines and class information.
                </p>
              </div>
              {introBoardId ? (
                <Link
                  href={`/participant/classes/${activeClassId}/board`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-purple-700 shrink-0"
                >
                  Open <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <span className="text-xs text-gray-400 shrink-0">Not available</span>
              )}
            </div>
          </div>
        </section>

        {/* Available teams */}
        <section>
          <div className="flex items-center gap-2 mb-3 px-1">
            <Users className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-semibold text-gray-900">Available Teams</h2>
            {teams.length > 0 && (
              <span className="text-xs text-gray-400">· {teams.length}</span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm animate-pulse"
                />
              ))}
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-2xl bg-white ring-1 ring-gray-100 shadow-sm p-8 text-center">
              <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No teams in this class yet.</p>
            </div>
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
                    className={`group rounded-2xl bg-white ring-1 ${
                      isMine ? "ring-purple-300 shadow-md" : "ring-gray-100 shadow-sm"
                    } overflow-hidden transition`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedTeam(isExp ? null : t.id)}
                      className="w-full text-left flex items-center gap-3 p-3 sm:p-4 hover:bg-gray-50 transition"
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
                              <div className="font-semibold text-sm text-gray-900 truncate">{t.name}</div>
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
                            <span className="ml-1 inline-flex items-center rounded-full bg-purple-100 text-purple-700 px-1.5 py-0.5 text-[10px] font-medium">
                              Your team
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
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
                              className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 px-2 py-1 text-[11px] font-medium"
                            >
                              <LogOut className="w-3 h-3" /> Leave team
                            </button>
                          ) : hasMyTeam ? (
                            <span className="inline-flex items-center rounded-md bg-gray-100 text-gray-400 px-2 py-1 text-[11px] font-medium">
                              Already in a team
                            </span>
                          ) : isFull ? (
                            <span className="inline-flex items-center rounded-md bg-gray-100 text-gray-400 px-2 py-1 text-[11px] font-medium">
                              Team full
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleJoinTeam(t);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 px-2 py-1 text-[11px] font-semibold"
                            >
                              Join this team
                            </button>
                          )}
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-5 h-5 text-gray-300 shrink-0 transition ${
                          isExp ? "rotate-90 text-purple-500" : ""
                        }`}
                      />
                    </button>

                    {/* Expanded members */}
                    {isExp && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60">
                        <div className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-2">
                          Members
                        </div>
                        {members.length === 0 ? (
                          <p className="text-xs text-gray-400">No members yet.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {members.map((m: any) => (
                              <li
                                key={m.user_id}
                                className="flex items-center gap-2 text-sm"
                              >
                                <div className="w-6 h-6 rounded-full bg-purple-200 text-purple-700 flex items-center justify-center text-[10px] font-bold">
                                  {(m.profile?.display_name || "?")[0].toUpperCase()}
                                </div>
                                <span className="text-gray-700">
                                  {m.profile?.display_name || "User " + String(m.user_id).slice(0, 8)}
                                </span>
                                {m.user_id === uid && (
                                  <span className="text-[10px] text-purple-600">(you)</span>
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
    </Shell>
  );
}

export default function ParticipantTeams() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-400">Loading…</p>}>
      <Inner />
    </Suspense>
  );
}
