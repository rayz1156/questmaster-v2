/**
 * POST /api/certificate-defaults/asset (KZ-B)
 *
 * Muat naik latar/logo/tandatangan ke tetapan lalai sijil pemanggil tanpa
 * shell. Badan sama seperti asset-upload templat:
 *   { kind, source_url? | content_base64?, remove_white_background? }
 * Objek disimpan di certificate-assets/defaults/<user_id>/. Pelan pemanggil
 * mesti berbayar (sama seperti aset templat), jika tidak 402.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad, bakiSaat } from '@/lib/hadKadar';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { pelanSijilBerbayar } from '@/lib/sijil/pelanSijil';
import {
  RalatAset,
  bacaImejPermintaan,
  laluanAset,
  padamJikaTidakDipakai,
  simpanAset,
  type JenisAset,
} from '@/lib/sijil/asetMasuk';
import { bacaTetapanLalai, bentukAwam, semakPendidikAktif } from '@/lib/sijil/tetapanLalai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LAJUR: Record<JenisAset, 'background_path' | 'logo_path' | 'signature_path'> = {
  background: 'background_path',
  logo: 'logo_path',
  signature: 'signature_path',
};

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;
  if (!(await semakPendidikAktif(auth.supa, userId))) return ralatJson('Forbidden', 403);

  const kunci = `cert-defaults-asset:${userId}`;
  if (!dalamHad(kunci, 10)) {
    return ralatJson('Too many requests. Please wait a minute and try again.', 429, { retry_after_seconds: bakiSaat(kunci) });
  }

  const { data: pelan, error: pelanErr } = await auth.supa.rpc('qm_effective_plan', { p_user: userId });
  if (pelanErr || !pelanSijilBerbayar(typeof pelan === 'string' ? pelan : 'free')) {
    return ralatJson('Certificate backgrounds, logos and signatures are available on Pro, Institution and Unlimited plans.', 402);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind === 'background' || body.kind === 'logo' || body.kind === 'signature' ? body.kind : null;
  if (!kind) return ralatJson('kind must be background, logo or signature.', 400);

  let imej;
  try {
    imej = await bacaImejPermintaan(body, kind);
  } catch (e) {
    if (e instanceof RalatAset) return ralatJson(e.message, e.status);
    throw e;
  }

  const svc = getServiceSupabase();
  const path = laluanAset(`defaults/${userId}/`, kind, imej.mime);
  try {
    await simpanAset(svc, path, imej);
  } catch (e) {
    return ralatJson(e instanceof Error ? e.message : 'Could not store the image.', 500);
  }

  const lama = await bacaTetapanLalai(auth.supa, userId);
  const { error } = await auth.supa
    .from('qm_certificate_defaults')
    .upsert(
      { educator_id: userId, [LAJUR[kind]]: path, updated_at: new Date().toISOString() },
      { onConflict: 'educator_id' },
    );
  if (error) {
    await svc.storage.from('certificate-assets').remove([path]).catch(() => undefined);
    return ralatJson(error.message, 400);
  }
  const p = lama?.[LAJUR[kind]];
  if (p && p !== path) await padamJikaTidakDipakai(svc, p);

  return NextResponse.json({
    defaults: bentukAwam(await bacaTetapanLalai(auth.supa, userId)),
    kind,
    bytes: imej.bytes.length,
    content_type: imej.mime,
    white_background_removed: body.remove_white_background === true,
  });
}
