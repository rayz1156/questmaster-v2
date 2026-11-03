/**
 * GET /api/admin/certificate-gallery/[libraryId]/background-url
 *
 * URL bertandatangan 10 minit untuk latar item galeri (V2-016a) supaya
 * editor susun atur admin boleh memaparkan latar laluan gallery/, yang
 * tidak diliputi polisi storan 0042 (pelayar tidak boleh menandatangan
 * sendiri). Pentadbir aktif sahaja.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAAT_URL = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: { libraryId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  if (!UUID.test(String(params.libraryId))) {
    return ralatJson('Not found.', 404);
  }
  if (!dalamHad(`cert-gallery-admin:${userId}`)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429);
  }

  const { data: adminAktif } = await auth.supa.rpc('qm_admin_aktif');
  if (adminAktif !== true) {
    return ralatJson('Admin only', 403);
  }

  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select('background_path')
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .maybeSingle();
  if (!item) {
    return ralatJson('Gallery item not found.', 404);
  }
  const latar = (item as { background_path?: string | null }).background_path ?? null;
  if (!latar) {
    return ralatJson('This item has no background image.', 404);
  }

  const svc = getServiceSupabase();
  const { data: signed, error: signErr } = await svc.storage
    .from('certificate-assets')
    .createSignedUrl(latar, SAAT_URL);
  if (signErr || !signed) {
    return ralatJson(signErr?.message ?? 'Could not sign the background URL.', 500);
  }
  return NextResponse.json({ url: signed.signedUrl, expires_in: SAAT_URL });
}
