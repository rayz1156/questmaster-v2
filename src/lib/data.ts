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
  const { data, error } = await supabase.from('qm_hunts').select('*').eq('owner_id', id).order('created_at', { ascending: false });
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
export type Klass = { id: string; owner_id: string; name: string; description: string | null; color: string | null; join_code: string; is_archived: boolean; created_at: string };
export type ClassMember = { class_id: string; user_id: string; joined_at: string };
export type ClassInvite = { id: string; class_id: string; email: string | null; token: string; invited_by: string | null; accepted_at: string | null; expires_at: string | null; created_at: string };

export async function listMyClasses(): Promise<Klass[]> {
  const id = await uid(); if (!id) return [];
  const { data, error } = await supabase.from('qm_classes').select('*').eq('owner_id', id).order('created_at', { ascending: false });
  if (error) throw error; return (data || []) as Klass[];
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
  if (error) throw error; return data as Klass;
}
export async function updateClass(id: string, patch: Partial<Klass>): Promise<void> {
  const { error } = await supabase.from('qm_classes').update(patch).eq('id', id); if (error) throw error;
}
export async function deleteClass(id: string): Promise<void> {
  const { error } = await supabase.from('qm_classes').delete().eq('id', id); if (error) throw error;
}
export async function getClass(id: string): Promise<Klass | null> {
  const { data, error } = await supabase.from('qm_classes').select('*').eq('id', id).single();
  if (error) return null; return data as Klass;
}
export async function listClassMembers(classId: string) {
  const { data, error } = await supabase.from('qm_class_members').select('user_id, joined_at, qm_profiles(id, display_name, email, role)').eq('class_id', classId);
  if (error) throw error; return (data || []) as any[];
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
  const { data, error } = await supabase.from('qm_hunts').select('*').eq('owner_id', id).eq('class_id', classId).order('created_at', { ascending: false });
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

// === QUEST MANAGEMENT (v2 simplified) ===
export type QuestCompletion = { id: string; hunt_id: string; team_id: string; awarded_points: number; adjustment_id: string|null; marked_by: string|null; created_at: string };

export async function updateQuestDetails(huntId: string, patch: { title?: string; description?: string|null; instructions?: string|null; link1?: string|null; link2?: string|null; points?: number; status?: 'draft'|'active'|'archived' }): Promise<void> {
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
export async function updateMyEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw error;
}
export async function updateMyPassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
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
