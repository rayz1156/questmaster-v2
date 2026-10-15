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
 * KZ-017: keupayaan kini boleh diwarisi daripada PEMILIK KELAS. Kuota storan
 * sudah dicaj mengikut pelan berkesan pemilik kelas (qm_reserve_upload), jadi
 * kebenaran muat naik peserta juga patut mengikut pemilik, bukan hanya bendera
 * akaun peserta sendiri.
 *
 * Usage inside a route (after resolving the Supabase client + user id):
 *   const gate = await assertCapability(supa, userId, 'videos');
 *   if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 403 });
 *
 * Untuk muat naik dalam konteks kelas, hantar classId supaya kebenaran pemilik
 * kelas diambil kira:
 *   const gate = await assertCapability(supa, userId, 'files', { classId });
 *   if (!gate.ok) return NextResponse.json({ error: gate.message }, { status: 403 });
 * Pemanggil route mesti SUDAH disahkan ahli/pemilik/ko-pendidik kelas dengan
 * requireClassMember sebelum memanggil fungsi ini; classId di sini hanya untuk
 * mencari pemilik, bukan untuk menggantikan semakan keahlian.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminPublic } from '@/lib/mcp/db';

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

/** Bentuk minimum baris qm_profiles yang diperlukan untuk keputusan. */
export type ProfilKeupayaan = {
  role?: string | null;
  can_upload_files?: boolean | null;
  can_upload_videos?: boolean | null;
} | null;

function isAdminRole(role: string | undefined | null): boolean {
  return role === 'admin' || role === 'superadmin';
}

/**
 * Keputusan tulen (tanpa pangkalan data) supaya boleh diuji oleh
 * scripts/selftest-keupayaan-kelas.ts.
 *
 * Peraturan, tertib:
 *   1. Pemanggil admin/superadmin -> lulus.
 *   2. Bendera sendiri true -> lulus.
 *   3. Pemilik kelas ada, admin/superadmin atau bendera pemilik true -> lulus.
 *   4. Lain (termasuk profil pemilik tiada) -> gagal. Fail closed.
 */
export function putuskanKeupayaan(args: {
  keupayaan: UploadCapability;
  pemanggil: ProfilKeupayaan;
  /** null/tak ditakrif apabila tiada classId atau profil pemilik tidak dijumpai. */
  pemilik?: ProfilKeupayaan;
}): { ok: boolean; isAdmin: boolean } {
  const { keupayaan, pemanggil, pemilik } = args;
  if (!pemanggil) return { ok: false, isAdmin: false };
  if (isAdminRole(pemanggil.role)) return { ok: true, isAdmin: true };
  if (pemanggil[COLUMN[keupayaan]] === true) return { ok: true, isAdmin: false };
  if (pemilik) {
    if (isAdminRole(pemilik.role)) return { ok: true, isAdmin: false };
    if (pemilik[COLUMN[keupayaan]] === true) return { ok: true, isAdmin: false };
  }
  return { ok: false, isAdmin: false };
}

export async function assertCapability(
  supa: SupabaseClient,
  userId: string,
  capability: UploadCapability,
  opts?: { classId?: string },
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
  const pemanggil = data as ProfilKeupayaan;

  // Laluan pantas lama: admin atau bendera sendiri sudah cukup.
  if (isAdminRole(pemanggil?.role) || pemanggil?.[COLUMN[capability]] === true) {
    return { ok: true, isAdmin: isAdminRole(pemanggil?.role) };
  }

  if (opts?.classId) {
    // Klien service_role pada skema public: carian peranan/keupayaan sahaja
    // (pengecualian yang didokumenkan dalam src/lib/mcp/db.ts). Hanya
    // owner_id, role dan satu lajur keupayaan dibaca; tiada data lain.
    const admin = adminPublic();
    const { data: klass, error: klassErr } = await admin
      .from('qm_classes')
      .select('owner_id')
      .eq('id', opts.classId)
      .maybeSingle();
    if (klassErr || !klass) {
      // Fail closed.
      return { ok: false, status: 403, message: DENY_MESSAGE[capability] };
    }
    const ownerId = (klass as { owner_id?: string | null }).owner_id;
    if (ownerId) {
      const { data: pemilikBaris, error: pemilikErr } = await admin
        .from('qm_profiles')
        .select(`role, ${COLUMN[capability]}`)
        .eq('id', ownerId)
        .maybeSingle();
      if (pemilikErr) {
        // Fail closed.
        return { ok: false, status: 403, message: DENY_MESSAGE[capability] };
      }
      const keputusan = putuskanKeupayaan({
        keupayaan: capability,
        pemanggil,
        pemilik: (pemilikBaris as ProfilKeupayaan) ?? null,
      });
      if (keputusan.ok) return { ok: true, isAdmin: keputusan.isAdmin };
    }
  }

  return { ok: false, status: 403, message: DENY_MESSAGE[capability] };
}

/**
 * Keupayaan berkesan untuk route API (KZ-017): logik sama dengan
 * assertCapability tetapi memulangkan ketiga-tiga bendera sekaligus, untuk
 * GET /api/classes/[id]/upload-capabilities. classId null bermakna profil
 * sendiri sahaja, seperti gelagat lama.
 */
export async function getEffectiveCapabilities(
  supa: SupabaseClient,
  userId: string,
  classId: string | null,
): Promise<{ canUploadFiles: boolean; canUploadVideos: boolean; isAdmin: boolean }> {
  const { data, error } = await supa
    .from('qm_profiles')
    .select('role, can_upload_files, can_upload_videos')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    return { canUploadFiles: false, canUploadVideos: false, isAdmin: false };
  }
  const pemanggil = data as ProfilKeupayaan;

  let pemilik: ProfilKeupayaan = null;
  if (classId) {
    const admin = adminPublic();
    const { data: klass, error: klassErr } = await admin
      .from('qm_classes')
      .select('owner_id')
      .eq('id', classId)
      .maybeSingle();
    if (!klassErr && klass?.owner_id) {
      const { data: pemilikBaris } = await admin
        .from('qm_profiles')
        .select('role, can_upload_files, can_upload_videos')
        .eq('id', (klass as { owner_id: string }).owner_id)
        .maybeSingle();
      pemilik = (pemilikBaris as ProfilKeupayaan) ?? null;
    }
    // Jika kelas atau pemilik tidak dijumpai, pemilik kekal null: keputusan
    // jatuh kembali kepada profil sendiri. Route ini sudah dilindungi
    // requireClassMember, jadi kelas mesti wujud pada amnya.
  }

  const files = putuskanKeupayaan({ keupayaan: 'files', pemanggil, pemilik });
  const videos = putuskanKeupayaan({ keupayaan: 'videos', pemanggil, pemilik });
  return {
    canUploadFiles: files.ok,
    canUploadVideos: videos.ok,
    isAdmin: isAdminRole(pemanggil?.role),
  };
}
