import { supabase } from './supabase';
import type { Hunt, Challenge, Team, Submission, Profile, Membership } from './types';

export type { Hunt, Challenge, Team, Submission, Profile, Membership };

async function uid() { const { data } = await supabase.auth.getUser(); return data.user?.id ?? null; }

export async function getMyProfile(): Promise<Profile | null> {
  const id = await uid(); if (!id) return null;
  const { data } = await supabase.from('qm_profiles').select('*').eq('id', id).maybeSingle();
  return data as Profile | null;
}

// === EDUCATOR ===
export async function listMyHunts(): Promise<Hunt[]> {
  const id = await uid(); if (!id) return [];
  // Include hunts in classes the user owns OR co-educates
  const { data: cs, error: cErr } = await supabase.rpc('qm_list_my_educator_classes');
  if (cErr) throw cErr;
  const classIds = ((cs || []) as Array<{ id: string }>).map(c => c.id);
  // Build OR filter: owner-of-hunt OR hunt in any of my classes
  const filters: string[] = [`owner_id.eq.${id}`];
  if (classIds.length > 0) filters.push(`class_id.in.(${classIds.join(',')})`);
  const { data, error } = await supabase.from('qm_hunts').select('*').or(filters.join(',')).order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Hunt[];
}
export async function createHunt(title: string, description = ''): Promise<Hunt> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const { data, error } = await supabase.from('qm_hunts').insert({ owner_id: id, title, description, status: 'active' }).select().single();
  if (error) throw error; return data as Hunt;
}
export async function updateHunt(huntId: string, patch: Partial<Hunt>): Promise<void> {
  const { error } = await supabase.from('qm_hunts').update(patch).eq('id', huntId); if (error) throw error;
}
export async function deleteHunt(huntId: string): Promise<void> {
  const { error } = await supabase.from('qm_hunts').delete().eq('id', huntId); if (error) throw error;
}
export async function listChallenges(huntId: string): Promise<Challenge[]> {
  const { data, error } = await supabase.from('qm_challenges').select('*').eq('hunt_id', huntId).order('order_idx');
  if (error) throw error; return (data || []) as Challenge[];
}
export async function listSubmissionsForOwner(): Promise<(Submission & { challenge?: Challenge })[]> {
  // RLS will filter to only the educator's hunts
  const { data, error } = await supabase.from('qm_submissions').select('*, challenge:qm_challenges(*)').order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as any;
}
export async function reviewSubmission(id: string, status: 'approved'|'rejected'): Promise<void> {
  const me = await uid();
  const { error } = await supabase.from('qm_submissions').update({ status, reviewed_by: me }).eq('id', id);
  if (error) throw error;
}

// === PARTICIPANT ===
export async function listJoinedHunts(): Promise<Hunt[]> {
  const id = await uid(); if (!id) return [];
  const { data, error } = await supabase.from('qm_memberships').select('hunt:qm_hunts(*)').eq('user_id', id);
  if (error) throw error;
  return (data || []).map((r: any) => r.hunt).filter(Boolean) as Hunt[];
}
export async function joinHuntByCode(code: string): Promise<Hunt> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const { data: hunt, error: e1 } = await supabase.from('qm_hunts').select('*').eq('invite_code', code.trim().toUpperCase()).maybeSingle();
  if (e1) throw e1; if (!hunt) throw new Error('Invalid code');
  const { error: e2 } = await supabase.from('qm_memberships').upsert({ hunt_id: hunt.id, user_id: id });
  if (e2) throw e2;
  return hunt as Hunt;
}
export async function listMySubmissions(): Promise<Submission[]> {
  const id = await uid(); if (!id) return [];
  const { data, error } = await supabase.from('qm_submissions').select('*').eq('user_id', id).order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Submission[];
}
export async function submitAnswer(challengeId: string, answer: string, teamId: string | null = null): Promise<Submission> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const { data, error } = await supabase.from('qm_submissions').insert({ challenge_id: challengeId, user_id: id, team_id: teamId, answer, status: 'pending' }).select().single();
  if (error) throw error; return data as Submission;
}
export async function listTeams(huntId: string): Promise<any[]> {
  const { data, error } = await supabase.from('qm_teams').select('*').eq('hunt_id', huntId).order('score', { ascending: false });
  if (error) throw error; return (data || []) as any[];
}
export async function leaderboard(huntId: string): Promise<Team[]> {
  return listTeams(huntId);
}


// === CLASS-SCOPED TEAMS ===
export async function listTeamsByClass(classId: string): Promise<any[]> {
  const { data, error } = await supabase.from('qm_teams').select('*').eq('class_id', classId).order('score', { ascending: false });
  if (error) throw error; return (data || []) as any[];
}
export async function createTeamForClass(classId: string, name: string, maxMembers: number = 5) {
  const { data, error } = await supabase.from('qm_teams').insert({ class_id: classId, name, max_members: maxMembers }).select().single();
  if (error) throw error; return data as any;
}
export async function bulkCreateTeamsForClass(classId: string, count: number, prefix: string = 'Team', maxMembers: number = 5) {
  const rows = Array.from({ length: count }).map((_, i) => ({ class_id: classId, name: `${prefix} ${i + 1}`, max_members: maxMembers }));
  const { data, error } = await supabase.from('qm_teams').insert(rows).select();
  if (error) throw error; return data as any[];
}
export async function leaderboardByClass(classId: string): Promise<any[]> {
  // Cumulative team score across all quests in the class (qm_teams.score is already aggregated by triggers/adjustments)
  return listTeamsByClass(classId);
}

// === ADMIN ===
export async function adminListProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from('qm_profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Profile[];
}
export async function adminListAllHunts(): Promise<Hunt[]> {
  const { data, error } = await supabase.from('qm_hunts').select('*').order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Hunt[];
}
export async function adminListAllSubmissions(): Promise<Submission[]> {
  const { data, error } = await supabase.from('qm_submissions').select('*').order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Submission[];
}
export async function adminUpdateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  const { error } = await supabase.from('qm_profiles').update(patch).eq('id', id); if (error) throw error;
}
export async function adminListAuditLog(): Promise<any[]> {
  const { data, error } = await supabase.from('qm_audit_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error; return data || [];
}
export async function logAudit(action: string, target_type?: string, target_id?: string, meta?: any) {
  const id = await uid(); if (!id) return;
  await supabase.from('qm_audit_log').insert({ actor_id: id, action, target_type, target_id, meta });
}

// ---- White-label / Branding ----
export async function getProfileById(id: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('qm_profiles').select('*').eq('id', id).single();
  if (error) return null; return data as Profile;
}
export async function uploadMyLogo(file: File): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token; if (!token) throw new Error('not authed');
  const fd = new FormData(); fd.append('file', file);
  const res = await fetch('/api/upload-logo', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error || 'Upload failed');
  return j.logo_url as string;
}
export async function removeMyLogo(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token; if (!token) throw new Error('not authed');
  const res = await fetch('/api/upload-logo', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) { const j = await res.json().catch(()=>({})); throw new Error(j?.error || 'Failed'); }
}

// === CLASSES ===
export type Klass = { id: string; owner_id: string; name: string; description: string | null; color: string | null; join_code: string; is_archived: boolean; ended_at: string | null; created_at: string; scoring_mode?: 'team' | 'individual' };
export type ClassMember = { class_id: string; user_id: string; joined_at: string };
export type ClassInvite = { id: string; class_id: string; email: string | null; token: string; invited_by: string | null; accepted_at: string | null; expires_at: string | null; created_at: string };

export async function listMyClasses(): Promise<Klass[]> {
  // Include classes the user owns OR co-educates (uses existing RPC)
  const rows = await listMyEducatorClasses();
  return rows.map(r => ({
    id: r.id,
    owner_id: "",
    name: r.name,
    description: r.description ?? null,
    color: r.color ?? null,
    join_code: r.join_code,
    is_archived: r.is_archived ?? false,
    ended_at: r.ended_at ?? null,
    created_at: r.created_at,
  })) as Klass[];
}
export async function listEnrolledClasses(): Promise<Klass[]> {
  const id = await uid(); if (!id) return [];
  const { data, error } = await supabase.from('qm_class_members').select('class_id, qm_classes(*)').eq('user_id', id);
  if (error) throw error;
  return ((data || []) as any[]).map(r => r.qm_classes).filter(Boolean) as Klass[];
}
export async function createClass(name: string, description?: string, color?: string): Promise<Klass> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const { data, error } = await supabase.from('qm_classes').insert({ owner_id: id, name, description: description || null, color: color || '#6366f1' }).select().single();
  if (error) throw error;
  // Ensure creator is registered as an accepted owner-educator so qm_list_my_educator_classes picks up this class.
  try {
    await supabase.from('qm_class_educators').upsert({ class_id: (data as any).id, educator_id: id, role: 'owner', invited_by: id, accepted_at: new Date().toISOString() }, { onConflict: 'class_id,educator_id' });
  } catch (_) { /* trigger or backfill may already cover this */ }
  return data as Klass;
}
export async function updateClass(id: string, patch: Partial<Klass>): Promise<void> {
  const { error } = await supabase.from('qm_classes').update(patch).eq('id', id); if (error) throw error;
}

export async function endClass(id: string): Promise<void> {
  const { error } = await supabase.from('qm_classes').update({ ended_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function reopenClass(id: string): Promise<void> {
  const { error } = await supabase.from('qm_classes').update({ ended_at: null }).eq('id', id);
  if (error) throw error;
}
export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('qm_classes').delete().eq('id', id); if (error) throw error;
}
export async function getClass(id: string): Promise<Klass | null> {
  const { data, error } = await supabase.from('qm_classes').select('*').eq('id', id).single();
  if (error) return null; return data as Klass;
}
export async function listClassMembers(classId: string) {
  // Fetch memberships without embed first so missing profile rows don't hide members
  const { data: members, error } = await supabase
    .from('qm_class_members')
    .select('user_id, joined_at')
    .eq('class_id', classId);
  if (error) throw error;
  const list = (members || []) as any[];
  if (list.length === 0) return list;
  // Then look up profiles separately and merge
  const ids = list.map((m: any) => m.user_id);
  const { data: profsRpc } = await supabase.rpc('qm_user_directory', { p_ids: ids });
  const { data: profsRoles } = await supabase.from('qm_profiles').select('id, role').in('id', ids);
  const roleById = new Map<string,string>((profsRoles||[]).map((p:any)=>[p.id, p.role]));
  const profs = ((profsRpc as any[]) || []).map((p:any)=>({ id: p.user_id, display_name: p.display_name, email: p.email, role: roleById.get(p.user_id) || 'participant' }));
  const byId = new Map<string, any>((profs || []).map((p: any) => [p.id, p]));
  return list.map((m: any) => ({ ...m, qm_profiles: byId.get(m.user_id) || null }));
}
export async function removeClassMember(classId: string, userId: string) {
  const { error } = await supabase.from('qm_class_members').delete().eq('class_id', classId).eq('user_id', userId); if (error) throw error;
}
export async function listClassInvites(classId: string): Promise<ClassInvite[]> {
  const { data, error } = await supabase.from('qm_class_invites').select('*').eq('class_id', classId).order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as ClassInvite[];
}
export async function createClassInvite(classId: string, email: string | null = null): Promise<ClassInvite> {
  const me = await uid();
  const { data, error } = await supabase.from('qm_class_invites').insert({ class_id: classId, email, invited_by: me }).select().single();
  if (error) throw error; return data as ClassInvite;
}
export async function joinClassByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('qm_join_class_by_code', { p_code: code });
  if (error) throw error; return data as string;
}
export async function acceptClassInvite(token: string): Promise<string> {
  const { data, error } = await supabase.rpc('qm_accept_class_invite', { p_token: token });
  if (error) throw error; return data as string;
}
export async function listMyHuntsByClass(classId: string): Promise<Hunt[]> {
  const id = await uid(); if (!id) return [];
  const { data, error } = await supabase.from('qm_hunts').select('*').eq('class_id', classId).order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Hunt[];
}
export async function createHuntInClass(classId: string, title: string, description?: string): Promise<Hunt> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const { data, error } = await supabase.from('qm_hunts').insert({ owner_id: id, class_id: classId, title, description: description || null, status: 'draft' }).select().single();
  if (error) throw error; return data as Hunt;
}

// === TEAMS CRUD ===
export async function createTeam(huntId: string, name: string, maxMembers: number = 5) {
  const { data, error } = await supabase.from('qm_teams').insert({ hunt_id: huntId, name, max_members: maxMembers }).select().single();
  if (error) throw error; return data as any;
}
export async function bulkCreateTeams(huntId: string, count: number, prefix: string = 'Team', maxMembers: number = 5) {
  const rows = Array.from({ length: count }).map((_, i) => ({ hunt_id: huntId, name: `${prefix} ${i + 1}`, max_members: maxMembers }));
  const { data, error } = await supabase.from('qm_teams').insert(rows).select();
  if (error) throw error; return data as any[];
}
export async function renameTeam(id: string, name: string) {
  const { error } = await supabase.from('qm_teams').update({ name }).eq('id', id); if (error) throw error;
}
export async function setTeamMaxMembers(id: string, max: number) {
  const { error } = await supabase.from('qm_teams').update({ max_members: max }).eq('id', id); if (error) throw error;
}
export async function deleteTeam(id: string) {
  const { error } = await supabase.from('qm_teams').delete().eq('id', id); if (error) throw error;
}

// === HUNT SCHEDULING ===
export async function updateHuntSchedule(id: string, patch: { start_at?: string | null; end_at?: string | null; timezone?: string; status?: string; }) {
  const { error } = await supabase.from('qm_hunts').update(patch).eq('id', id); if (error) throw error;
}

// === CHALLENGE POINTS ===
export async function updateChallengePoints(id: string, points: number) {
  const { error } = await supabase.from('qm_challenges').update({ points }).eq('id', id); if (error) throw error;
}
export async function updateChallenge(id: string, patch: { title?: string; prompt?: string; answer?: string; points?: number }) {
  const { error } = await supabase.from('qm_challenges').update(patch).eq('id', id); if (error) throw error;
}
export async function deleteChallenge(id: string) {
  const { error } = await supabase.from('qm_challenges').delete().eq('id', id); if (error) throw error;
}
export async function createChallenge(huntId: string, title: string, prompt: string, answer: string, points: number = 10) {
  const { data, error } = await supabase.from('qm_challenges').insert({ hunt_id: huntId, title, prompt, answer, points }).select().single();
  if (error) throw error; return data as any;
}

// === SCORE ADJUSTMENTS ===
export type ScoreAdjustment = { id: string; team_id: string; hunt_id: string; delta: number; reason: string | null; created_by: string | null; created_at: string };
export async function addScoreAdjustment(huntId: string, teamId: string, delta: number, reason?: string) {
  const me = await uid();
  const { data, error } = await supabase.from('qm_score_adjustments').insert({ hunt_id: huntId, team_id: teamId, delta, reason: reason || null, created_by: me }).select().single();
  if (error) throw error; return data as ScoreAdjustment;
}
export async function listScoreAdjustments(huntId: string): Promise<ScoreAdjustment[]> {
  const { data, error } = await supabase.from('qm_score_adjustments').select('*').eq('hunt_id', huntId).order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as ScoreAdjustment[];
}
export async function deleteScoreAdjustment(id: string) {
  const { error } = await supabase.from('qm_score_adjustments').delete().eq('id', id); if (error) throw error;
}

// === LIVE TEAM SCORES (view) ===
export type TeamScore = { team_id: string; hunt_id: string; team_name: string; base_score: number; task_score: number; adjustment_score: number; total_score: number };
export async function listTeamScores(huntId: string): Promise<TeamScore[]> {
  const { data, error } = await supabase.from('qm_team_scores').select('*').eq('hunt_id', huntId).order('total_score', { ascending: false });
  if (error) throw error; return (data || []) as TeamScore[];
}

export type ClassTeamScore = { team_id: string; class_id: string; team_name: string; base_score: number; task_score: number; adjustment_score: number; total_score: number };
export async function listClassTeamScores(classId: string): Promise<ClassTeamScore[]> {
  const { data, error } = await supabase.from('qm_class_team_scores').select('*').eq('class_id', classId).order('total_score', { ascending: false });
  if (error) throw error; return (data || []) as ClassTeamScore[];
}

// Individual (per-student) scores within a class. Backed by the qm_class_individual_scores
// view (migration 0027): each student's own approved-submission points + individual adjustments.
export type ClassIndividualScore = { class_id: string; user_id: string; display_name: string | null; total_score: number };

export async function listClassIndividualScores(classId: string): Promise<ClassIndividualScore[]> {
  const { data, error } = await supabase.from('qm_class_individual_scores').select('*').eq('class_id', classId).order('total_score', { ascending: false });
  if (error) throw error; return (data || []) as ClassIndividualScore[];
}

// Per-student manual score adjustments (bonus / penalty) within a class.
// Backed by qm_student_score_adjustments (migration 0027). Feeds the individual leaderboard.
export type StudentScoreAdjustment = { id: string; class_id: string; user_id: string; hunt_id: string | null; delta: number; reason: string | null; created_by: string | null; created_at: string };

export async function addStudentScoreAdjustment(classId: string, userId: string, delta: number, reason?: string): Promise<StudentScoreAdjustment> {
  const me = await uid();
  const { data, error } = await supabase.from('qm_student_score_adjustments').insert({ class_id: classId, user_id: userId, delta, reason: reason || null, created_by: me }).select().single();
  if (error) throw error; return data as StudentScoreAdjustment;
}

export async function listStudentScoreAdjustments(classId: string, userId?: string): Promise<StudentScoreAdjustment[]> {
  let q = supabase.from('qm_student_score_adjustments').select('*').eq('class_id', classId);
  if (userId) q = q.eq('user_id', userId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as StudentScoreAdjustment[];
}

export async function deleteStudentScoreAdjustment(id: string): Promise<void> {
  const { error } = await supabase.from('qm_student_score_adjustments').delete().eq('id', id); if (error) throw error;
}

// === QUEST MANAGEMENT (v2 simplified) ===
export type QuestCompletion = { id: string; hunt_id: string; team_id: string; awarded_points: number; adjustment_id: string|null; marked_by: string|null; created_at: string };

export async function updateQuestDetails(huntId: string, patch: { title?: string; description?: string|null; instructions?: string|null; link1?: string|null; link2?: string|null; submission_link?: string|null; submission_link_label?: string|null; submission_link_embed?: boolean; points?: number; status?: 'draft'|'active'|'archived' }): Promise<void> {
  const { error } = await supabase.from('qm_hunts').update(patch).eq('id', huntId);
  if (error) throw error;
}

export async function listQuestCompletions(huntId: string): Promise<QuestCompletion[]> {
  const { data, error } = await supabase.from('qm_team_quest_completions').select('*').eq('hunt_id', huntId);
  if (error) throw error;
  return (data || []) as QuestCompletion[];
}

export async function markTeamCompletion(huntId: string, teamId: string): Promise<void> {
  const me = await uid();
  // Read quest points
  const { data: hunt, error: hErr } = await supabase.from('qm_hunts').select('id, points, title').eq('id', huntId).single();
  if (hErr) throw hErr;
  const pts = (hunt as any)?.points ?? 0;
  // Insert score adjustment (+pts)
  const { data: adj, error: aErr } = await supabase.from('qm_score_adjustments').insert({ hunt_id: huntId, team_id: teamId, delta: pts, reason: `Quest completed: ${(hunt as any)?.title ?? ''}`.trim(), created_by: me }).select().single();
  if (aErr) throw aErr;
  // Insert completion (unique on hunt_id+team_id)
  const { error: cErr } = await supabase.from('qm_team_quest_completions').insert({ hunt_id: huntId, team_id: teamId, awarded_points: pts, adjustment_id: (adj as any).id, marked_by: me });
  if (cErr) {
    // rollback adjustment
    await supabase.from('qm_score_adjustments').delete().eq('id', (adj as any).id);
    throw cErr;
  }
}

export async function unmarkTeamCompletion(huntId: string, teamId: string): Promise<void> {
  // Find completion, delete its adjustment and the row
  const { data: comp, error: e1 } = await supabase.from('qm_team_quest_completions').select('id, adjustment_id').eq('hunt_id', huntId).eq('team_id', teamId).maybeSingle();
  if (e1) throw e1;
  if (!comp) return;
  if ((comp as any).adjustment_id) {
    await supabase.from('qm_score_adjustments').delete().eq('id', (comp as any).adjustment_id);
  }
  const { error: e2 } = await supabase.from('qm_team_quest_completions').delete().eq('id', (comp as any).id);
  if (e2) throw e2;
}

// Participant: list quests automatically derived from joined classes
export async function listQuestsForParticipant(): Promise<Hunt[]> {
  const id = await uid(); if (!id) return [];
  const { data: cm, error: e1 } = await supabase.from('qm_class_members').select('class_id').eq('user_id', id);
  if (e1) throw e1;
  const classIds = (cm || []).map((r: any) => r.class_id).filter(Boolean);
  if (classIds.length === 0) return [];
  const { data, error } = await supabase.from('qm_hunts').select('*').in('class_id', classIds).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Hunt[];
}

// === TEAM JOIN CODES ===
export async function joinTeamByCode(code: string): Promise<{ team_id: string; hunt_id: string }> {
  const me = await uid(); if (!me) throw new Error('Not signed in');
  const norm = code.trim().toUpperCase();
  if (!norm) throw new Error('Enter a team code');
  const { data: team, error: e1 } = await supabase.from('qm_teams').select('id, hunt_id, max_members').eq('join_code', norm).maybeSingle();
  if (e1) throw e1;
  if (!team) throw new Error('Invalid team code');
  // auto-enroll in class if not already a member
  const huntId = (team as any).hunt_id;
  const { data: hunt } = await supabase.from('qm_hunts').select('class_id').eq('id', huntId).maybeSingle();
  if (hunt?.class_id) {
    const { data: membership } = await supabase.from('qm_class_members').select('class_id').eq('class_id', hunt.class_id).eq('user_id', me).maybeSingle();
    if (!membership) {
      await supabase.from('qm_class_members').insert({ class_id: hunt.class_id, user_id: me });
    }
  }
  // capacity check
  const { count } = await supabase.from('qm_team_members').select('*', { count: 'exact', head: true }).eq('team_id', (team as any).id);
  if ((team as any).max_members && (count || 0) >= (team as any).max_members) throw new Error('This team is full');
  // already in?
  const { data: existing } = await supabase.from('qm_team_members').select('team_id').eq('user_id', me).eq('team_id', (team as any).id).maybeSingle();
  if (!existing) {
    const { error: e2 } = await supabase.from('qm_team_members').insert({ team_id: (team as any).id, user_id: me });
    if (e2) throw new Error(e2.message.includes('row-level security') ? 'You must join this class first before joining a team in it.' : e2.message);
  }
  return { team_id: (team as any).id, hunt_id: (team as any).hunt_id };
}

export async function regenerateTeamCode(teamId: string): Promise<string> {
  // Generate a unique 8-char uppercase code client-side using crypto then update.
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map(b => (b % 36).toString(36)).join('').toUpperCase().slice(0,8).padEnd(8,'X');
  const { error } = await supabase.from('qm_teams').update({ join_code: code }).eq('id', teamId);
  if (error) throw error;
  return code;
}

export async function leaveTeam(teamId: string): Promise<void> {
  const me = await uid(); if (!me) return;
  const { error } = await supabase.from('qm_team_members').delete().eq('team_id', teamId).eq('user_id', me);
  if (error) throw error;
}

export async function getTeamByCode(code: string): Promise<any | null> {
  const norm = code.trim().toUpperCase(); if (!norm) return null;
  const { data, error } = await supabase.from('qm_teams').select('id, hunt_id, name, join_code, max_members').eq('join_code', norm).maybeSingle();
  if (error) throw error;
  return data;
}

// === SELF PROFILE UPDATES ===
export async function updateMyDisplayName(name: string): Promise<void> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const { error } = await supabase.from('qm_profiles').update({ display_name: name }).eq('id', id);
  if (error) throw error;
  await supabase.auth.updateUser({ data: { display_name: name } });
}


export async function updateMyUsername(username: string): Promise<void> {
  const u = (username || '').trim().toLowerCase();
  if (!u) throw new Error('Username cannot be empty');
  if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(u)) {
    throw new Error('Username must be 3-30 chars: lowercase letters, digits, dot, hyphen or underscore');
  }
  const { data: au } = await supabase.auth.getUser();
  if (!au.user) throw new Error('Not signed in');
  // Check uniqueness (case-insensitive)
  const { data: existing, error: selErr } = await supabase
    .from('qm_profiles')
    .select('id')
    .ilike('username', u)
    .neq('id', au.user.id)
    .maybeSingle();
  if (selErr && selErr.code !== 'PGRST116') throw selErr;
  if (existing) throw new Error('That username is taken');
  const { error } = await supabase
    .from('qm_profiles')
    .update({ username: u, username_updated_at: new Date().toISOString() })
    .eq('id', au.user.id);
  if (error) throw error;
}
export async function updateMyEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}
export async function updateMyPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}
export async function updateMyBio(bio: string): Promise<void> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const trimmed = (bio || '').trim();
  if (trimmed.length > 500) throw new Error('Bio must be 500 characters or fewer');
  const value = trimmed.length === 0 ? null : trimmed;
  const { error } = await supabase.from('qm_profiles').update({ bio: value, bio_updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function updateMyIntroDisplayName(name: string): Promise<void> {
  const id = await uid(); if (!id) throw new Error('not authed');
  const trimmed = (name || '').trim();
  const value = trimmed.length === 0 ? null : trimmed.slice(0, 80);
  const { error } = await supabase.from('qm_profiles').update({ intro_display_name: value }).eq('id', id);
  if (error) throw error;
}


export async function softDeleteMyAccount(): Promise<void> {
  const id = await uid(); if (!id) throw new Error('not authed');
  // Soft-delete: mark profile as suspended and tag display name so admin can identify self-deleted accounts.
  const { data: prof } = await supabase.from('qm_profiles').select('display_name').eq('id', id).maybeSingle();
  const currentName = (prof && (prof as any).display_name) || '';
  const newName = currentName.startsWith('[Deleted]') ? currentName : `[Deleted] ${currentName}`.trim();
  const { error } = await supabase.from('qm_profiles').update({ suspended: true, display_name: newName }).eq('id', id);
  if (error) throw error;
  await supabase.auth.signOut();
}

// === ADMIN EXTENDED CRUD ===
export async function adminListAllClasses(): Promise<any[]> {
  const { data, error } = await supabase.from('qm_classes').select('*').order('created_at', { ascending: false });
  if (error) throw error; return data || [];
}
export async function adminUpdateClass(id: string, patch: any): Promise<void> {
  const { error } = await supabase.from('qm_classes').update(patch).eq('id', id); if (error) throw error;
}
export async function adminDeleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('qm_classes').delete().eq('id', id); if (error) throw error;
}
export async function adminUpdateHunt(id: string, patch: Partial<Hunt>): Promise<void> {
  const { error } = await supabase.from('qm_hunts').update(patch).eq('id', id); if (error) throw error;
}
export async function adminDeleteHunt(id: string): Promise<void> {
  const { error } = await supabase.from('qm_hunts').delete().eq('id', id); if (error) throw error;
}
export async function adminListAllTeams(): Promise<Team[]> {
  const { data, error } = await supabase.from('qm_teams').select('*').order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Team[];
}
export async function adminUpdateTeam(id: string, patch: Partial<Team>): Promise<void> {
  const { error } = await supabase.from('qm_teams').update(patch).eq('id', id); if (error) throw error;
}
export async function adminDeleteTeam(id: string): Promise<void> {
  const { error } = await supabase.from('qm_teams').delete().eq('id', id); if (error) throw error;
}
export async function adminListAllChallenges(): Promise<Challenge[]> {
  const { data, error } = await supabase.from('qm_challenges').select('*').order('order_idx', { ascending: true });
  if (error) throw error; return (data || []) as Challenge[];
}
export async function adminUpdateChallenge(id: string, patch: Partial<Challenge>): Promise<void> {
  const { error } = await supabase.from('qm_challenges').update(patch).eq('id', id); if (error) throw error;
}

export type UserMeta = { id: string; email: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed_at?: string | null };
export async function adminListUsersMeta(): Promise<Record<string, UserMeta>> {
  const { data, error } = await supabase.rpc('qm_admin_list_users_meta');
  if (error) { console.error(error); return {}; }
  const map: Record<string, UserMeta> = {};
  for (const row of (data || []) as UserMeta[]) map[row.id] = row;
  return map;
}
export async function adminDeleteUser(id: string): Promise<void> {
  const { error } = await supabase.rpc('qm_admin_delete_user', { target: id });
  if (error) throw error;
}
export async function adminVerifyEmail(id: string): Promise<void> {
  const { error } = await supabase.rpc('qm_admin_verify_email', { target: id });
  if (error) throw error;
}

// List members of a team (joins qm_profiles client-side)
export async function listTeamMembers(teamId: string) {
  const { data: rows, error } = await supabase.from('qm_team_members').select('user_id').eq('team_id', teamId);
  if (error) throw error;
  const list = (rows || []) as any[];
  if (list.length === 0) return list;
  const ids = list.map((r:any)=>r.user_id);
  const { data: profs, error: e2 } = await supabase.rpc('qm_user_directory', { p_ids: ids });
  if (e2) console.warn('qm_user_directory failed', e2);
  const byId = new Map<string, any>(((profs as any[]) || []).map((p:any)=>[p.user_id,p]));
  return list.map((r:any)=>({ user_id: r.user_id, profile: byId.get(r.user_id) || null }));
}

// === CO-EDUCATORS (migration 0009_co_educators) ===
import type {
  ClassEducator, ClassEducatorInvite, MyClassEducatorInvite, EducatorClassRow,
} from './types';

export async function listClassEducators(classId: string): Promise<ClassEducator[]> {
  const { data, error } = await supabase.rpc('qm_list_class_educators', { p_class: classId });
  if (error) throw error;
  return (data || []) as ClassEducator[];
}

export async function listClassEducatorInvites(classId: string): Promise<ClassEducatorInvite[]> {
  const { data, error } = await supabase.rpc('qm_list_class_educator_invites', { p_class: classId });
  if (error) throw error;
  return (data || []) as ClassEducatorInvite[];
}

export async function inviteClassEducator(classId: string, email: string) {
  const { data, error } = await supabase.rpc('qm_invite_class_educator', {
    p_class: classId, p_email: email,
  });
  if (error) throw error;
  // RPC returns a single-row TABLE; supabase-js gives us an array
  const row = Array.isArray(data) ? data[0] : data;
  return row as { id: string; code: string; token: string; expires_at: string; email: string; status: string };
}

export async function revokeClassEducatorInvite(inviteId: string) {
  const { error } = await supabase.rpc('qm_revoke_class_educator_invite', { p_invite: inviteId });
  if (error) throw error;
}

export async function removeClassEducator(classId: string, educatorId: string) {
  const { error } = await supabase.rpc('qm_remove_class_educator', {
    p_class: classId, p_educator: educatorId,
  });
  if (error) throw error;
}

export async function transferClassOwnership(classId: string, newOwnerId: string) {
  const { error } = await supabase.rpc('qm_transfer_class_ownership', {
    p_class: classId, p_new_owner: newOwnerId,
  });
  if (error) throw error;
}

export async function acceptClassEducatorInviteByCode(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('qm_accept_class_educator_invite_by_code', { p_code: code });
  if (error) throw error;
  return data as string; // class_id
}

export async function listMyClassEducatorInvites(): Promise<MyClassEducatorInvite[]> {
  const { data, error } = await supabase.rpc('qm_list_my_class_educator_invites');
  if (error) throw error;
  return (data || []) as MyClassEducatorInvite[];
}

export async function listMyEducatorClasses(): Promise<EducatorClassRow[]> {
  const { data, error } = await supabase.rpc('qm_list_my_educator_classes');
  if (error) throw error;
  return (data || []) as EducatorClassRow[];
}

/* ============================================================
 * Class duplication & learning-board import (added 2026-05-11)
 * ============================================================ */

export type DuplicateClassOptions = {
  newTitle?: string;
  copyLearningBoard?: boolean;
  copyActivities?: boolean;
  copyMembers?: boolean;
  copyEducators?: boolean;
  asTemplate?: boolean;
  asDraft?: boolean;
};

export async function duplicateClass(classId: string, opts: DuplicateClassOptions): Promise<{ classId: string; name: string; copied: any }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token; if (!token) throw new Error('not authed');
  const r = await fetch(`/api/classes/${classId}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(opts),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Failed to duplicate class');
  return data;
}

export async function importLearningBoardFromClass(
  destinationClassId: string,
  sourceClassId: string,
  mode: 'replace' | 'append',
): Promise<{ ok: true; mode: string; columns: number; cards: number }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token; if (!token) throw new Error('not authed');
  const r = await fetch(`/api/learning-boards/${destinationClassId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sourceClassId, mode }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || 'Failed to import learning board');
  return data;
}

/* =========================================================
 * Leave class (student & co-educator)
 * Added 2026-05-19
 * ========================================================= */
export async function leaveClassAsStudent(classId: string): Promise<void> {
  const { error } = await supabase.rpc('qm_leave_class_as_student', { p_class: classId });
  if (error) throw error;
}

export async function leaveClassAsEducator(classId: string): Promise<void> {
  const { error } = await supabase.rpc('qm_leave_class_as_educator', { p_class: classId });
  if (error) throw error;
}

// === ADMIN: class limits & visibility ===
export async function adminSetClassLimits(id: string, maxOwned: number | null, maxCoEducator: number | null): Promise<void> {
  const { error } = await supabase.from('qm_profiles')
    .update({ max_classes_owned: maxOwned, max_classes_as_coeducator: maxCoEducator })
    .eq('id', id);
  if (error) throw error;
}

// Classes an educator owns plus classes they belong to as a co-educator.
export async function adminListEducatorClasses(userId: string): Promise<{ owned: any[]; coEducator: any[] }> {
  const ownedRes = await supabase.from('qm_classes')
    .select('id,name,color,join_code,is_archived,ended_at,created_at')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (ownedRes.error) throw ownedRes.error;

  const ceRes = await supabase.from('qm_class_educators')
    .select('role,accepted_at,qm_classes(id,name,color,join_code,is_archived,ended_at,created_at,owner_id)')
    .eq('educator_id', userId)
    .not('accepted_at', 'is', null);
  if (ceRes.error) throw ceRes.error;
  const coEducator = (ceRes.data || [])
    .map((r: any) => r.qm_classes ? { ...r.qm_classes, member_role: r.role, accepted_at: r.accepted_at } : null)
    .filter(Boolean);

  return { owned: ownedRes.data || [], coEducator };
}

// Classes a participant has joined.
export async function adminListParticipantClasses(userId: string): Promise<any[]> {
  const { data, error } = await supabase.from('qm_class_members')
    .select('joined_at,qm_classes(id,name,color,join_code,is_archived,ended_at,created_at,owner_id)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  return (data || [])
    .map((r: any) => r.qm_classes ? { ...r.qm_classes, joined_at: r.joined_at } : null)
    .filter(Boolean);
}
