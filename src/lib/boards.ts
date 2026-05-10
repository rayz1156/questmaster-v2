// =============================================================================
// Boards data layer (Padlet/Wakelet-style content sharing for Cendekia)
// Tables: qm_boards, qm_intro_posts, qm_group_submissions
// Storage buckets: intro-photos, quest-submissions
// =============================================================================
import { supabase } from './supabase';

export type BoardType = 'introduction' | 'quest_submission';
export type LayoutMode = 'media' | 'compact' | 'grid' | 'moodboard' | 'columns';
export type SubmissionStatus = 'in_review' | 'needs_revision' | 'complete';
export type FileType = 'image' | 'pdf' | 'document' | 'other';

export interface Board {
  id: string;
  board_type: BoardType;
  class_id: string | null;
  hunt_id: string | null;
  title: string;
  description: string | null;
  layout_mode: LayoutMode;
  cover_color: string | null;
  due_date: string | null;
  max_score: number | null;
  show_scores_publicly: boolean;
  owner_id: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface IntroPost {
  id: string;
  board_id: string;
  author_id: string;
  display_name: string;
  description: string | null;
  image_url: string | null;
  image_path: string | null;
  is_hidden: boolean;
  hidden_by: string | null;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
  // Media-type extension (image OR video)
  media_type?: 'image' | 'video';
  video_adilo_file_id?: string | null;
  video_adilo_project_id?: string | null;
  video_thumbnail_url?: string | null;
  video_duration_seconds?: number | null;
  // Live profile bio (joined from qm_profiles) - overrides description when present
  author_bio?: string | null;
  author_display_name?: string | null;
  author_avatar_url?: string | null;
}

export interface GroupSubmission {
  id: string;
  board_id: string;
  team_id: string;
  submitted_by: string;
  title: string;
  description: string | null;
  file_url: string;
  file_path: string;
  file_name: string;
  file_type: FileType;
  file_size_bytes: number;
  status: SubmissionStatus;
  score: number | null;
  feedback: string | null;
  graded_by: string | null;
  graded_at: string | null;
  is_late: boolean;
  created_at: string;
  updated_at: string;
}

// ============================== BOARDS =====================================
export async function getBoardForClass(classId: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from('qm_boards')
    .select('*')
    .eq('class_id', classId)
    .eq('board_type', 'introduction')
    .maybeSingle();
  if (error) throw error;
  return data as Board | null;
}

export async function getBoardForHunt(huntId: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from('qm_boards')
    .select('*')
    .eq('hunt_id', huntId)
    .eq('board_type', 'quest_submission')
    .maybeSingle();
  if (error) throw error;
  return data as Board | null;
}

export async function getBoard(boardId: string): Promise<Board | null> {
  const { data, error } = await supabase
    .from('qm_boards').select('*').eq('id', boardId).maybeSingle();
  if (error) throw error;
  return data as Board | null;
}

export async function updateBoard(boardId: string, patch: Partial<Pick<Board,
  'title'|'description'|'layout_mode'|'cover_color'|'due_date'|'max_score'|'show_scores_publicly'|'is_archived'
>>) {
  const { error } = await supabase.from('qm_boards').update(patch).eq('id', boardId);
  if (error) throw error;
}

// =========================== INTRO POSTS ===================================
export interface IntroPostWithAuthor extends IntroPost {
  author_role?: string;
}

export async function listIntroPosts(boardId: string): Promise<IntroPost[]> {
  const { data, error } = await supabase
    .from('qm_intro_posts')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const posts = (data || []) as IntroPost[];
  if (posts.length === 0) return posts;
  // Fetch live author profiles (bio + avatar) so the intro board
  // always reflects the user's current profile, not the stale per-post copy.
  const authorIds = Array.from(new Set(posts.map(p => p.author_id))).filter(Boolean);
  if (authorIds.length === 0) return posts;
  const { data: profs } = await supabase
    .from('qm_profiles')
    .select('id, display_name, bio, avatar_url')
    .in('id', authorIds);
  const byId = new Map<string, { display_name: string | null; bio: string | null; avatar_url: string | null }>();
  (profs || []).forEach((r: any) => byId.set(r.id, { display_name: r.display_name ?? null, bio: r.bio ?? null, avatar_url: r.avatar_url ?? null }));
  return posts.map(p => {
    const prof = byId.get(p.author_id);
    return {
      ...p,
      author_bio: prof?.bio ?? null,
      author_display_name: prof?.display_name ?? null,
      author_avatar_url: prof?.avatar_url ?? null,
    };
  });
}

export async function getMyIntroPost(boardId: string): Promise<IntroPost | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return null;
  const { data, error } = await supabase
    .from('qm_intro_posts')
    .select('*')
    .eq('board_id', boardId)
    .eq('author_id', u.user.id)
    .maybeSingle();
  if (error) throw error;
  return data as IntroPost | null;
}

export async function uploadIntroPhoto(file: File): Promise<{ path: string; url: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('intro-photos')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('intro-photos').getPublicUrl(path);
  return { path, url: pub.publicUrl };
}

export async function createOrUpdateIntroPost(input: {
  boardId: string;
  displayName: string;
  description: string;
  imageFile?: File;
  existingPath?: string;
  existingUrl?: string;
}): Promise<IntroPost> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');

  let image_url = input.existingUrl || '';
  let image_path = input.existingPath || '';
  if (input.imageFile) {
    const up = await uploadIntroPhoto(input.imageFile);
    image_url = up.url;
    image_path = up.path;
    // best-effort: clean previous file
    if (input.existingPath) {
      await supabase.storage.from('intro-photos').remove([input.existingPath]).catch(() => {});
    }
  }
  if (!image_url || !image_path) throw new Error('Image is required');

  const row = {
    board_id: input.boardId,
    author_id: u.user.id,
    display_name: input.displayName.trim(),
    description: input.description?.trim() || null,
    image_url,
    image_path,
  };
  const { data, error } = await supabase
    .from('qm_intro_posts')
    .upsert(row, { onConflict: 'board_id,author_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as IntroPost;
}

export async function deleteIntroPost(postId: string): Promise<void> {
  const { data: post } = await supabase
    .from('qm_intro_posts').select('image_path').eq('id', postId).maybeSingle();
  const { error } = await supabase.from('qm_intro_posts').delete().eq('id', postId);
  if (error) throw error;
  if (post?.image_path) {
    await supabase.storage.from('intro-photos').remove([post.image_path]).catch(() => {});
  }
}

export async function hideIntroPost(postId: string, hide: boolean): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('qm_intro_posts').update({
    is_hidden: hide,
    hidden_by: hide ? u.user?.id : null,
    hidden_at: hide ? new Date().toISOString() : null,
  }).eq('id', postId);
  if (error) throw error;
}

// ======================== GROUP SUBMISSIONS ================================
export function detectFileType(mime: string): FileType {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (
    mime.startsWith('application/vnd.openxmlformats') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'text/plain'
  ) return 'document';
  return 'other';
}

export async function listGroupSubmissions(boardId: string): Promise<GroupSubmission[]> {
  const { data, error } = await supabase
    .from('qm_group_submissions')
    .select('*')
    .eq('board_id', boardId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as GroupSubmission[];
}

export async function getMyGroupSubmission(boardId: string, teamId: string): Promise<GroupSubmission | null> {
  const { data, error } = await supabase
    .from('qm_group_submissions')
    .select('*')
    .eq('board_id', boardId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (error) throw error;
  return data as GroupSubmission | null;
}

// Returns the team_id of the current user for the hunt linked to a board
export async function getMyTeamForBoard(boardId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('qm_my_team_for_board', { p_board_id: boardId });
  if (error) throw error;
  return (data as string | null) || null;
}

export async function uploadSubmissionFile(file: File): Promise<{ path: string; url: string }> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const path = `${u.user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safeName}`;
  const { error: upErr } = await supabase.storage
    .from('quest-submissions')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('quest-submissions').getPublicUrl(path);
  return { path, url: pub.publicUrl };
}

export async function createOrUpdateGroupSubmission(input: {
  boardId: string;
  teamId: string;
  title: string;
  description: string;
  file?: File;
  existingPath?: string;
  existingUrl?: string;
  existingFileName?: string;
  existingFileType?: FileType;
  existingFileSize?: number;
}): Promise<GroupSubmission> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Not authenticated');

  let file_url = input.existingUrl || '';
  let file_path = input.existingPath || '';
  let file_name = input.existingFileName || '';
  let file_type: FileType = input.existingFileType || 'other';
  let file_size_bytes = input.existingFileSize || 0;

  if (input.file) {
    const up = await uploadSubmissionFile(input.file);
    file_url = up.url;
    file_path = up.path;
    file_name = input.file.name;
    file_type = detectFileType(input.file.type);
    file_size_bytes = input.file.size;
    if (input.existingPath) {
      await supabase.storage.from('quest-submissions').remove([input.existingPath]).catch(() => {});
    }
  }
  if (!file_url || !file_path) throw new Error('File is required');

  // late detection: compare board.due_date
  let is_late = false;
  const { data: board } = await supabase
    .from('qm_boards').select('due_date').eq('id', input.boardId).maybeSingle();
  if (board?.due_date) is_late = new Date() > new Date(board.due_date);

  const row = {
    board_id: input.boardId,
    team_id: input.teamId,
    submitted_by: u.user.id,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    file_url, file_path, file_name, file_type, file_size_bytes,
    is_late,
    status: 'in_review' as SubmissionStatus,
    // re-submitting clears prior grade
    score: null, feedback: null, graded_by: null, graded_at: null,
  };
  const { data, error } = await supabase
    .from('qm_group_submissions')
    .upsert(row, { onConflict: 'board_id,team_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data as GroupSubmission;
}

export async function gradeSubmission(submissionId: string, input: {
  status: SubmissionStatus;
  score?: number | null;
  feedback?: string | null;
}): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  const patch: any = {
    status: input.status,
    score: input.status === 'complete' ? (input.score ?? null) : null,
    feedback: input.feedback?.trim() || null,
    graded_by: u.user?.id || null,
    graded_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from('qm_group_submissions').update(patch).eq('id', submissionId);
  if (error) throw error;
}

export async function deleteGroupSubmission(submissionId: string): Promise<void> {
  const { data: row } = await supabase
    .from('qm_group_submissions').select('file_path').eq('id', submissionId).maybeSingle();
  const { error } = await supabase.from('qm_group_submissions').delete().eq('id', submissionId);
  if (error) throw error;
  if (row?.file_path) {
    await supabase.storage.from('quest-submissions').remove([row.file_path]).catch(() => {});
  }
}

// =========================== TEAMS HELPER ==================================
export async function listTeamsForHunt(huntId: string): Promise<Array<{ id: string; name: string; score: number }>> {
  // Resolve the hunt's class so we can pull both hunt-attached teams (legacy)
  // and class-level teams (current model). Every quest in a class auto-gets
  // a column per team in that class.
  const { data: hunt, error: hErr } = await supabase
    .from('qm_hunts').select('class_id').eq('id', huntId).maybeSingle();
  if (hErr) throw hErr;
  const classId = (hunt as any)?.class_id || null;
  const filter = classId ? `hunt_id.eq.${huntId},class_id.eq.${classId}` : `hunt_id.eq.${huntId}`;
  const { data, error } = await supabase
    .from('qm_teams').select('id,name,score').or(filter).order('name');
  if (error) throw error;
  // Deduplicate in case a team is linked by both hunt_id and class_id.
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string; score: number }> = [];
  for (const r of (data || []) as any[]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.name, score: r.score });
  }
  return out;
}

export async function listTeamMembers(teamId: string): Promise<Array<{ user_id: string; display_name: string | null }>> {
  const { data, error } = await supabase
    .from('qm_team_members')
    .select('user_id, qm_profiles:qm_profiles!inner(display_name)')
    .eq('team_id', teamId);
  if (error) throw error;
  return (data || []).map((r: any) => ({
    user_id: r.user_id,
    display_name: r.qm_profiles?.display_name || null,
  }));
}

// === Submission link (external Drive/Dropbox/Padlet/etc) ===
export interface HuntSubmissionLink {
  url: string | null;
  label: string | null;
  embed: boolean;
}
export async function getHuntSubmissionLink(huntId: string): Promise<HuntSubmissionLink> {
  const { data, error } = await supabase
    .from('qm_hunts')
    .select('submission_link, submission_link_label, submission_link_embed')
    .eq('id', huntId)
    .single();
  if (error) {
    return { url: null, label: null, embed: false };
  }
  const r: any = data || {};
  return {
    url: (r.submission_link && String(r.submission_link).trim()) || null,
    label: (r.submission_link_label && String(r.submission_link_label).trim()) || null,
    embed: !!r.submission_link_embed,
  };
}

// Best-effort rewrite of common provider "share" URLs into embed-friendly form.
// Returns the original URL if no rewrite rule applies.
export function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Google Drive: convert /file/d/ID/view -> /file/d/ID/preview
    if (host.endsWith('drive.google.com')) {
      const m = u.pathname.match(/^\/file\/d\/([^\/]+)/);
      if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
      // /drive/folders/ID -> /embeddedfolderview?id=ID#list (read-only)
      const f = u.pathname.match(/^\/drive\/folders\/([^\/?]+)/);
      if (f) return `https://drive.google.com/embeddedfolderview?id=${f[1]}#list`;
    }
    // Google Docs/Sheets/Slides: /edit -> /preview
    if (host === 'docs.google.com') {
      return url.replace(/\/edit(?=[?#]|$)/, '/preview');
    }
    // YouTube: youtu.be/ID or watch?v=ID -> embed/ID
    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0];
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
  } catch {}
  return url;
}
