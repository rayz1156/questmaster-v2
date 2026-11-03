/**
 * POST /api/admin/certificate-gallery/[libraryId]/asset-finalize
 *
 * Sahkan muat naik latar/logo item galeri (V2-016a) selepas klien PUT ke
 * URL bertandatangan, corak laluan asset-finalize V2-015 tetapi untuk
 * pentadbir aktif. Body: { kind: 'background' | 'logo', path }.
 *
 *   1. Laluan mesti berprefiks gallery/<libraryId>/<kind>- (dijana
 *      asset-ticket) dan bebas traversal.
 *   2. Tandatangan bait PNG/JPEG disemak; bukan imej dipadam dan 400.
 *   3. Item dikemas kini melalui klien pengguna (RLS galeri pentadbir).
 *   4. Objek lama dipadam hanya jika qm_certificate_asset_in_use palsu
 *      (fail boleh dikongsi antara templat).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { muat16Bait, tandatanganImej } from '@/lib/sijil/aset';
import { laluanAsetSah } from '@/lib/sijil/pustaka';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LAJUR_ITEM =
  'id, scope, owner_id, title, kind, text_tone, background_path, logo_path, layout, free_tier, published, sort_order';

/** Medan item yang dikemas kini mengikut kind. */
const LAJUR: Record<'background' | 'logo', 'background_path' | 'logo_path'> = {
  background: 'background_path',
  logo: 'logo_path',
};

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

  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .maybeSingle();
  if (!item) {
    return ralatJson('Gallery item not found.', 404);
  }
  const itemPenuh = item as typeof item & {
    background_path: string | null;
    logo_path: string | null;
  };

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === 'background' || body.kind === 'logo' ? body.kind : null;
  const path = typeof body.path === 'string' ? body.path : '';

  if (!kind) {
    return ralatJson('kind must be background or logo.', 400);
  }

  const prefiks = `gallery/${params.libraryId}/${kind}-`;
  if (!path.startsWith(prefiks) || !laluanAsetSah(path)) {
    return ralatJson('Invalid path. Use the path returned by the asset ticket.', 400);
  }

  const bait = await muat16Bait(path);
  if (!bait) {
    return ralatJson('Uploaded file not found. Upload it to the signed URL first.', 404);
  }
  if (!tandatanganImej(bait)) {
    // Bukan PNG/JPEG: padam objek supaya bucket tidak menimpan sampah.
    const svc = getServiceSupabase();
    await svc.storage.from('certificate-assets').remove([path]).catch(() => undefined);
    return ralatJson('The uploaded file is not a valid PNG or JPEG image.', 400);
  }

  const lajur = LAJUR[kind];
  const lama = kind === 'background' ? itemPenuh.background_path : itemPenuh.logo_path;

  // Tulis melalui klien pengguna: polisi galeri pentadbir (qm_admin_aktif)
  // berkuat kuasa pada UPDATE.
  const { data: updated, error: updErr } = await auth.supa
    .from('qm_certificate_library')
    .update({ [lajur]: path, updated_at: new Date().toISOString() })
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .select(LAJUR_ITEM)
    .single();
  if (updErr || !updated) {
    return ralatJson(updErr?.message ?? 'Could not attach the image.', 400);
  }

  // Padam objek lama hanya jika tiada baris lain yang masih merujuknya
  // (item galeri ini sudah tidak lagi merujuknya, tetapi templat kelas
  // yang memakai item ini mungkin masih menyimpan laluan sama).
  if (lama && lama !== path) {
    const svc = getServiceSupabase();
    const { data: dipakai, error: ralatGuna } = await svc.rpc('qm_certificate_asset_in_use', { p_path: lama });
    if (!ralatGuna && dipakai === false) { // CTO: ralat RPC = jangan padam
      await svc.storage.from('certificate-assets').remove([lama]).catch(() => undefined);
    }
  }

  return NextResponse.json({ item: updated });
}
