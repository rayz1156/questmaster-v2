"use client";
/**
 * Teams peserta, rupa v3 KZ-023.
 *
 * Setiap pasukan ialah Card (maklumat pasukan) dan ahli dipapar dengan
 * PersonRow kit apabila kad dikembangkan. Aliran sertai pasukan (kod
 * pasukan, sertai terus, tinggalkan pasukan, nama semula pasukan
 * sendiri) dan semua panggilan data tidak berubah daripada versi
 * sebelum KZ-023. Nama ahli lain dipapar seperti sebelum ini: nama
 * paparan sahaja, tiada emel.
 */
import ParticipantShell from "@/components/ParticipantShell";

import { useEffect, useState, Suspense, useMemo } from "react";
import {
  Check,
  ChevronRight,
  ExternalLink,
  LogOut,
  Pencil,
  Users,
  X,
} from "lucide-react";
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
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHead,
  CardSection,
  EmptyState,
  Field,
  Input,
  PageHead,
  PersonRow,
  Select,
} from "@/components/ui";

/** Ahli pasukan seperti yang dikembalikan listTeamMembers. */
type Ahli = { user_id: string; profile?: { display_name?: string | null } | null };

/** Baris pasukan daripada listTeamsByClass (lajur qm_teams). */
type Kumpulan = {
  id: string;
  name: string;
  max_members?: number | null;
  join_code?: string | null;
};

function Inner() {
  const { session, loading: authLoading } = useSession();
  const [classes, setClasses] = useState<Klass[]>([]);
  const confirm = useConfirm();
  const [activeClassId, setActiveClassId] = useState<string>("");
  const [teams, setTeams] = useState<Kumpulan[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [countMap, setCountMap] = useState<Record<string, number>>({});
  const [membersByTeam, setMembersByTeam] = useState<Record<string, Ahli[]>>({});
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
        setTeams(ts as Kumpulan[]);
        // Load members for each team so we can compute "my team" + counts
        if (uid && ts.length > 0) {
          const allMembers: Record<string, Ahli[]> = {};
          await Promise.all(
            ts.map(async (team) => {
              try {
                const ms = await listTeamMembers(team.id);
                allMembers[team.id] = ms as Ahli[];
              } catch {}
            })
          );
          setMembersByTeam((prev) => ({ ...prev, ...allMembers }));
          const myTeam = (ts as Kumpulan[]).find((team) =>
            allMembers[team.id]?.some((m) => m.user_id === uid)
          );
          if (myTeam) setExpandedTeam(myTeam.id);
        }
        try {
          const { supabase } = await import("@/lib/supabaseClient");
          const { data } = await supabase.rpc("qm_team_member_counts", { p_class_id: activeClassId });
          if (data) {
            const m: Record<string, number> = {};
            for (const r of data as { team_id: string; cnt: number }[]) m[r.team_id] = Number(r.cnt);
            setCountMap(m);
          }
        } catch {}
      })
      .finally(() => setLoading(false));
  }, [activeClassId, uid]);

  const myTeam = useMemo(() => {
    if (!uid) return null;
    return teams.find((t) => (membersByTeam[t.id] || []).some((m) => m.user_id === uid)) || null;
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
        setTeams(ts as Kumpulan[]);
      }
    } catch (err: unknown) {
      setJoinMsg({ type: "err", text: (err as { message?: string })?.message || "Failed to join team" });
    } finally {
      setJoinBusy(false);
    }
  }

  async function handleJoinTeam(team: Kumpulan) {
    if (!team.join_code) return;
    try {
      await joinTeamByCode(team.join_code);
      if (activeClassId) {
        const ts = await listTeamsByClass(activeClassId);
        setTeams(ts as Kumpulan[]);
        const ms = await listTeamMembers(team.id);
        setMembersByTeam((p) => ({ ...p, [team.id]: ms as Ahli[] }));
      }
      setExpandedTeam(team.id);
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || "Failed to join");
    }
  }

  async function handleLeave(team: Kumpulan) {
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
        setTeams(ts as Kumpulan[]);
      }
    } catch (err: unknown) {
      alert((err as { message?: string })?.message || "Failed");
    }
  }

  return (
    <ParticipantShell>
      <PageHead
        title="Better together."
        description="Join a team to collaborate and earn points together."
      />

      <div className="mb-5">
        <Select
          value={activeClassId}
          onChange={(e) => setActiveClassId(e.target.value)}
          disabled={classes.length === 0}
          aria-label="Select class"
          className="w-auto min-w-[220px]"
        >
          {classes.length === 0 && <option>No enrolled classes</option>}
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <PeerReviewBanner />

      <div className="mt-6 grid grid-cols-1 gap-7 xl:grid-cols-2">
        {/* Borang kod pasukan */}
        <Card>
          <Field label="Join a team by code" htmlFor="kod-pasukan">
            <form onSubmit={handleJoinByCode} className="flex flex-wrap items-start gap-2">
              <div className="w-[220px]">
                <Input
                  id="kod-pasukan"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Team code"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className="font-mono uppercase tracking-[0.2em]"
                />
              </div>
              <Button type="submit" disabled={joinBusy || !code.trim()}>
                {joinBusy ? "Joining…" : "Join"}
              </Button>
            </form>
          </Field>
          {joinMsg && (
            <Alert tone={joinMsg.type === "ok" ? "success" : "danger"} className="mt-3">
              {joinMsg.text}
            </Alert>
          )}
        </Card>

        {introBoardId && (
          <Card className="flex flex-col justify-center">
            <CardHead
              title="Class intro board"
              subtitle="See how your classmates introduced themselves."
              right={
                <Button variant="outline" href={`/participant/classes/${activeClassId}/board`}>
                  Open Intro Board <ExternalLink className="w-4 h-4" />
                </Button>
              }
            />
          </Card>
        )}
      </div>

      {/* Available teams */}
      <section className="mt-8">
        <div className="section-title mb-3">
          Teams in this class{teams.length > 0 ? ` (${teams.length})` : ""}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 rounded-[4px] bg-canvas animate-pulse" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="bg-white rounded-[4px] shadow-card">
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title="No teams in this class yet."
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7">
            {teams.map((t) => {
              const members = membersByTeam[t.id] || [];
              const count = countMap[t.id] ?? members.length ?? 0;
              const maxM = t.max_members ?? 5;
              const isMine = members.some((m) => m.user_id === uid);
              const isFull = count >= maxM;
              const hasMyTeam = !!myTeam;
              const isExp = expandedTeam === t.id;
              return (
                <Card
                  key={t.id}
                  padat
                  className={`flex flex-col overflow-hidden ${isMine ? "ring-1 ring-brand-purple" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedTeam(isExp ? null : t.id)}
                    aria-expanded={isExp}
                    className="w-full text-left px-6 pt-6 pb-4 hover:bg-canvas transition"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1">
                        {renamingId === t.id ? (
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!renameVal.trim()) return;
                              try {
                                await renameTeam(t.id, renameVal.trim());
                                setTeams((ts) =>
                                  ts.map((x) =>
                                    x.id === t.id ? { ...x, name: renameVal.trim() } : x
                                  )
                                );
                                setRenamingId(null);
                              } catch (err: unknown) {
                                alert((err as { message?: string })?.message || "Failed");
                              }
                            }}
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              autoFocus
                              value={renameVal}
                              onChange={(e) => setRenameVal(e.target.value)}
                              className="w-32 rounded-[4px] border border-hairline px-1 py-0.5 text-sm focus:border-brand-purple focus:outline-none"
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
                          <span className="flex items-center gap-1.5">
                            <span className="text-[16.8px] font-bold tracking-[-0.17px] text-ink truncate">{t.name}</span>
                            {isMine && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(t.id);
                                  setRenameVal(t.name);
                                }}
                                className="text-gray-300 hover:text-brand-purple"
                                title="Rename team"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </span>
                        )}
                        <span className="block text-[13px] text-ink-faint mt-0.5 tabular-nums">
                          {count}/{maxM} members
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-2">
                        {isMine && <Badge variant="dim" warna="purple">Your team</Badge>}
                        <ChevronRight
                          className={`w-5 h-5 text-ink-faint transition ${isExp ? "rotate-90 text-brand-purple" : ""}`}
                        />
                      </span>
                    </span>
                  </button>

                  {/* Tindakan pasukan: logik sama, rupa kit. */}
                  <div className="px-6 pb-5">
                    {isMine ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleLeave(t)}
                      >
                        <LogOut className="w-3.5 h-3.5" /> Leave team
                      </Button>
                    ) : hasMyTeam ? (
                      <span className="text-xs text-ink-faint">Already in a team</span>
                    ) : isFull ? (
                      <span className="text-xs text-ink-faint">Team full</span>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleJoinTeam(t)}
                      >
                        Join this team
                      </Button>
                    )}
                  </div>

                  {/* Expanded members */}
                  {isExp && (
                    <CardSection baris className="mt-auto">
                      <div className="eyebrow mb-2">Members</div>
                      {members.length === 0 ? (
                        <p className="text-sm text-ink-faint">No members yet.</p>
                      ) : (
                        <div className="space-y-0.5">
                          {members.map((m, i) => (
                            <PersonRow
                              key={m.user_id}
                              name={m.profile?.display_name || "User " + String(m.user_id).slice(0, 8)}
                              subtitle={m.user_id === uid ? "You" : undefined}
                              index={i}
                            />
                          ))}
                        </div>
                      )}
                    </CardSection>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>
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
