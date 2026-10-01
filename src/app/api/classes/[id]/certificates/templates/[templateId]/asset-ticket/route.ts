/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/asset-ticket
 *
 * Tiket muat naik latar/logo/tandatangan sijil (V2-015, V2-016b) untuk
 * bucket `certificate-assets`. Body: { kind: 'background' | 'logo' |
 * 'signature', mimeType, size }. Pelayan MENJANA laluan objek (klien
 * tidak pernah menawarkan laluan), mengeluarkan URL PUT bertandatangan
 * melalui klien service role HANYA selepas semua semakan kebenaran dan
 * pelan, dan memulangkannya bersama token.
 *
 * Tandatangan (V2-016b): PNG/JPEG lutsinar maksimum 1 MB, laluan
 * <classId>/<templateId>/signature-<rawak>.png|jpg.
 *
 * Pemanggil (pelayar, curl, alat MCP) kemudian memuat naik fail TERUS ke
 * storan dengan PUT; tiada bait melalui pelayan aplikasi atau model.
 *
 * Kebenaran: pendidik kelas (semakPendidikKelas), templat milik kelas,
 * pelan berkesan PEMILIK kelas pro/institution (402 selain itu; sama
 * dengan pencetus qm_certificate_template_plan_guard 0054).
 */
import { NextRequest, NextResponse } from 'next/server';
import { pelanSijilBerbayar } from '@/lib/sijil/pelanSijil';
import { randomBytes } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Had muat naik aset sijil: 8 MB supaya PNG A4 300 dpi diterima. */
const MAX_ASET_BYTES = 8 * 1024 * 1024;
/** Had muat naik imej tandatangan (V2-016b): 1 MB. */
const MAX_SIG_BYTES = 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL bertandatangan sah 2 jam (dokumentasi storage-js). */
const EXPIRY_S = 7200;

/**
 * Semak bahawa URL bertandatangan ialah URL awam yang boleh dicapai dari
 * luar VPS. Klien pelayar memakai NEXT_PUBLIC_SUPABASE_URL untuk auth,
 * jadi nilai ini semestinya awam di produksi; localhost/kong bermakna
 * konfigurasi rosak dan URL tidak akan berfungsi, jadi gagal dengan jelas.
 */
function urlAwam(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !(host === 'localhost' || host === 'kong' || host === '127.0.0.1' || host === '::1' || host.endsWith('.internal'));
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; templateId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  // Tolak parameter bukan UUID awal (kzsec V2-013 R4).
  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  if (!dalamHad(`cert-asset-ticket:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Templat mesti milik kelas ini (klien Bearer; RLS pendidik).
  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  // Pelan berkesan PEMILIK kelas mengawal aset, bukan pelan pendidik yang
  // memanggil (pencetus 0042 memaksa NULL untuk bukan pro/institution).
  const { data: kelas } = await auth.supa
    .from('qm_classes')
    .select('owner_id')
    .eq('id', classId)
    .maybeSingle();
  const ownerId = (kelas as { owner_id?: string } | null)?.owner_id;
  let pelan = 'free';
  if (ownerId) {
    const { data: rpcPlan, error: rpcErr } = await auth.supa.rpc('qm_effective_plan', { p_user: ownerId });
    if (!rpcErr && typeof rpcPlan === 'string') pelan = rpcPlan;
  }
  if (!pelanSijilBerbayar(pelan)) {
    return NextResponse.json(
      { error: 'Certificate backgrounds, logos and signatures are available on Pro, Institution and Unlimited plans.' },
      { status: 402 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind =
    body.kind === 'background' || body.kind === 'logo' || body.kind === 'signature'
      ? body.kind
      : null;
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
  const size = typeof body.size === 'number' && Number.isFinite(body.size) ? Math.floor(body.size) : 0;

  if (!kind) {
    return NextResponse.json({ error: 'kind must be background, logo or signature.' }, { status: 400 });
  }
  if (mimeType !== 'image/png' && mimeType !== 'image/jpeg') {
    return NextResponse.json(
      { error: 'mimeType must be image/png or image/jpeg.' },
      { status: 400 },
    );
  }
  if (size <= 0) {
    return NextResponse.json({ error: 'size is required.' }, { status: 400 });
  }
  const hadBytes = kind === 'signature' ? MAX_SIG_BYTES : MAX_ASET_BYTES;
  if (size > hadBytes) {
    return NextResponse.json(
      { error: `Image must be ${hadBytes / (1024 * 1024)} MB or smaller.` },
      { status: 400 },
    );
  }

  // Laluan objek SENTIASA dijana pelayan dalam ruang nama kelas+templat,
  // jadi tiket tidak boleh menulis ke templat atau kelas lain.
  const ext = mimeType === 'image/png' ? 'png' : 'jpg';
  const rawak16 = randomBytes(8).toString('hex');
  const path = `${classId}/${params.templateId}/${kind}-${rawak16}.${ext}`;

  // Klien service role HANYA di sini, selepas semua semakan lulus.
  const svc = getServiceSupabase();
  const { data: signed, error: signErr } = await svc.storage
    .from('certificate-assets')
    .createSignedUploadUrl(path);
  if (signErr || !signed) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Could not create the upload URL.' },
      { status: 500 },
    );
  }

  if (!urlAwam(signed.signedUrl)) {
    console.error(
      `[cert-asset-ticket] NEXT_PUBLIC_SUPABASE_URL bukan awam: ${signed.signedUrl}`,
    );
    return NextResponse.json(
      { error: 'The storage URL is not publicly reachable. Contact the administrator.' },
      { status: 500 },
    );
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
