/**
 * POST /api/admin/certificate-gallery/[libraryId]/asset-ticket
 *
 * Tiket muat naik latar/logo item galeri (V2-016a), corak laluan
 * asset-ticket V2-015 tetapi untuk pentadbir aktif sahaja (qm_admin_aktif
 * di pelayan) dan laluan sentiasa gallery/<libraryId>/<kind>-<rawak>.<ext>.
 *
 * Body: { kind: 'background' | 'logo', mimeType, size }. Pelayan menjana
 * laluan (klien tidak pernah menawarkan laluan) dan mengeluarkan URL PUT
 * bertandatangan melalui klien service role HANYA selepas semua semakan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { MAX_ASET_BYTES } from '@/lib/sijil/aset';
import { laluanGaleri } from '@/lib/sijil/pustaka';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL bertandatangan sah 2 jam (dokumentasi storage-js). */
const EXPIRY_S = 7200;

/**
 * Semak bahawa URL bertandatangan ialah URL awam yang boleh dicapai dari
 * luar VPS (localhost/kong bermakna konfigurasi rosak).
 */
function urlAwam(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !(
      host === 'localhost'
      || host === 'kong'
      || host === '127.0.0.1'
      || host === '::1'
      || host.endsWith('.internal')
    );
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { libraryId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  if (!UUID.test(String(params.libraryId))) {
    return ralatJson('Not found.', 404);
  }
  if (!dalamHad(`cert-gallery-aset:${userId}`)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429);
  }

  const { data: adminAktif } = await auth.supa.rpc('qm_admin_aktif');
  if (adminAktif !== true) {
    return ralatJson('Admin only', 403);
  }

  // Item mesti wujud dan berjenis galeri (RLS galeri pentadbir).
  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select('id, scope')
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .maybeSingle();
  if (!item) {
    return ralatJson('Gallery item not found.', 404);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === 'background' || body.kind === 'logo' ? body.kind : null;
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const size = typeof body.size === 'number' && Number.isFinite(body.size) ? Math.floor(body.size) : 0;

  if (!kind) {
    return ralatJson('kind must be background or logo.', 400);
  }
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
    return ralatJson('mimeType must be image/png or image/jpeg.', 400);
  }
  if (size <= 0) {
    return ralatJson('size is required.', 400);
  }
  if (size > MAX_ASET_BYTES) {
    return ralatJson('Image must be 8 MB or smaller.', 400);
  }

  // Laluan sentiasa dalam ruang nama galeri item ini.
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const path = laluanGaleri(params.libraryId, kind, randomBytes(8).toString('hex'), ext);

  // Klien service role HANYA di sini, selepas semua semakan lulus.
  const svc = getServiceSupabase();
  const { data: signed, error: signErr } = await svc.storage
    .from('certificate-assets')
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    return ralatJson(signErr?.message ?? 'Could not create the upload URL.', 500);
  }

  if (!urlAwam(signed.signedUrl)) {
    console.error(`[cert-gallery-aset] NEXT_PUBLIC_SUPABASE_URL bukan awam: ${signed.signedUrl}`);
    return ralatJson('The storage URL is not publicly reachable. Contact the administrator.', 500);
  }

  return NextResponse.json({
    upload_url: signed.signedUrl,
    token: signed.token,
    path,
    expires_in: EXPIRY_S,
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
  });
}
