/**
 * Server-side upload capability checks.
 *
 * Two independently-admin-controlled capabilities live on qm_profiles:
 *   can_upload_files  -> FileLu document uploads
 *   can_upload_videos -> Bunny Stream video uploads
 *
 * Admins and superadmins ALWAYS pass, regardless of the column values.
 * Images are never gated and have no helper here on purpose.
 *
 * Usage inside a route (after resolving the Supabase client + user id):
 *   const gate = await assertCapability(supa, userId, 'videos');
 *   if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 403 });
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type UploadCapability = 'files' | 'videos';

const COLUMN: Record<UploadCapability, 'can_upload_files' | 'can_upload_videos'> = {
  files: 'can_upload_files',
  videos: 'can_upload_videos',
};

const DENY_MESSAGE: Record<UploadCapability, string> = {
  files: 'File upload is not enabled for your account by the admin. Please contact your administrator, or share a link instead.',
  videos: 'Video upload is not enabled for your account by the admin. Please contact your administrator, or paste a YouTube link instead.',
};

export type CapabilityResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; status: 403; message: string };

export async function assertCapability(
  supa: SupabaseClient,
  userId: string,
  capability: UploadCapability,
): Promise<CapabilityResult> {
  const { data, error } = await supa
    .from('qm_profiles')
    .select(`role, ${COLUMN[capability]}`)
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    // Fail closed: if we can't confirm the capability, deny.
    return { ok: false, status: 403, message: DENY_MESSAGE[capability] };
  }
  const role = (data as any).role as string | undefined;
  if (role === 'admin' || role === 'superadmin') return { ok: true, isAdmin: true };

  const enabled = (data as any)[COLUMN[capability]] === true;
  if (enabled) return { ok: true, isAdmin: false };
  return { ok: false, status: 403, message: DENY_MESSAGE[capability] };
}
