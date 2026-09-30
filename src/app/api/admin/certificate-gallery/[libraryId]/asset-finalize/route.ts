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
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }
  if (!dalamHad(`cert-gallery-aset:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const { data: adminAktif } = await auth.supa.rpc('qm_admin_aktif');
  if (adminAktif !== true) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', params.libraryId)
    .eq('scope', 'gallery')
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Gallery item not found.' }, { status: 404 });
  }
  const itemPenuh = item as typeof item & {
    background_path: string | null;
    logo_path: string | null;
  };

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === 'background' || body.kind === 'logo' ? body.kind : null;
  const path = typeof body.path === 'string' ? body.path : '';

  if (!kind) {
    return NextResponse.json({ error: 'kind must be background or logo.' }, { status: 400 });
  }

  const prefiks = `gallery/${params.libraryId}/${kind}-`;
  if (!path.startsWith(prefiks) || !laluanAsetSah(path)) {
    return NextResponse.json(
      { error: 'Invalid path. Use the path returned by the asset ticket.' },
      { status: 400 },
    );
  }

  const bait = await muat16Bait(path);
  if (!bait) {
    return NextResponse.json(
      { error: 'Uploaded file not found. Upload it to the signed URL first.' },
      { status: 404 },
    );
  }
  if (!tandatanganImej(bait)) {
    // Bukan PNG/JPEG: padam objek supaya bucket tidak menimpan sampah.
    const svc = getServiceSupabase();
    await svc.storage.from('certificate-assets').remove([path]).catch(() => undefined);
    return NextResponse.json(
      { error: 'The uploaded file is not a valid PNG or JPEG image.' },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: updErr?.message ?? 'Could not attach the image.' },
      { status: 400 },
    );
  }

  // Padam objek lama hanya jika tiada baris lain yang masih merujuknya
  // (item galeri ini sudah tidak lagi merujuknya, tetapi templat kelas
  // yang memakai item ini mungkin masih menyimpan laluan sama).
  if (lama && lama !== path) {
    const svc = getServiceSupabase();
    const { data: dipakai } = await svc.rpc('qm_certificate_asset_in_use', { p_path: lama });
    if (dipakai !== true) {
      await svc.storage.from('certificate-assets').remove([lama]).catch(() => undefined);
    }
  }

  return NextResponse.json({ item: updated });
}
