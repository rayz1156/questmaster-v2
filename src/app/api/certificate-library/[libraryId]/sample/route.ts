/**
 * POST /api/certificate-library/[libraryId]/sample
 *
 * Jana PDF contoh item pustaka (V2-016a), corak laluan sample V2-015:
 * tiada rekod qm_certificates dicipta dan kod contoh CONTOH0000 tidak
 * lulus pengesahan awam. Body: { name?: string }.
 *
 * Tanpa ?format=url: balas bait application/pdf terus.
 * Dengan ?format=url: simpan dalam bucket `certificates` pada
 * samples/library/<libraryId>/<rawak>.pdf dan pulangkan URL bertandatangan
 * sah 10 minit.
 *
 * Tera "Dijana dengan Kuizen" mengikut pelan PEMANGGIL (bukan pemilik
 * kelas): item pustaka tidak terikat kepada satu kelas.
 *
 * Kebenaran: item mesti kelihatan kepada pemanggil (RLS qm_certificate_library:
 * galeri diterbitkan, galeri penuh untuk pentadbir, personal milik sendiri).
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad } from '@/lib/hadKadar';
import { pelanSijilBerbayar } from '@/lib/sijil/pelanSijil';
import { janaPdfSijil } from '@/lib/sijil/janaPdf';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import type { ItemPustaka } from '@/lib/sijil/pustaka';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kod contoh: tidak akan wujud dalam qm_certificates (abjad 0042 tiada sifar). */
const KOD_CONTOH = 'CONTOH0000';
const NAMA_LALAI = 'Nama Peserta Contoh';
const SAAT_URL = 600;

const LAJUR_ITEM =
  'id, scope, owner_id, title, kind, text_tone, background_path, logo_path, layout, free_tier, published, sort_order';

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
  if (!dalamHad(`cert-lib-sample:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  // RLS mengawal keterlihatan: item yang tidak boleh dilihat pemanggil
  // tidak akan dipulangkan di sini.
  const { data: item } = await auth.supa
    .from('qm_certificate_library')
    .select(LAJUR_ITEM)
    .eq('id', params.libraryId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }
  const itemPenuh = item as ItemPustaka;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nama =
    typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : NAMA_LALAI;

  // Latar/logo dimuat turun dengan klien service role HANYA selepas
  // keterlihatan disahkan oleh RLS pada bacaan di atas.
  const svc = getServiceSupabase();
  let latarBait: Uint8Array | undefined;
  let logoBait: Uint8Array | undefined;
  try {
    if (itemPenuh.background_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(itemPenuh.background_path);
      if (d) latarBait = new Uint8Array(await d.arrayBuffer());
    }
    if (itemPenuh.logo_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(itemPenuh.logo_path);
      if (d) logoBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    // Gagal muat turun aset tidak menghalang contoh: PDF dijana tanpa aset.
  }

  // Pelan berkesan PEMANGGIL menentukan tera.
  const { data: pelanData, error: pelanErr } = await auth.supa.rpc('qm_effective_plan', {
    p_user: userId,
  });
  const pelan = !pelanErr && typeof pelanData === 'string' ? pelanData : 'free';

  const layout = normaliseSusunAtur(itemPenuh.layout);
  const bait = await janaPdfSijil({
    nama,
    program: itemPenuh.title,
    tarikh: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    pengeluar: 'Sample Educator',
    kod: KOD_CONTOH,
    urlSah: `https://kuizen.fun/sijil/${KOD_CONTOH}`,
    latar: latarBait,
    logo: logoBait,
    tera: !pelanSijilBerbayar(pelan),
    layout,
  });

  if (req.nextUrl.searchParams.get('format') === 'url') {
    const namaFail = `samples/library/${params.libraryId}/${randomBytes(12).toString('hex')}.pdf`;
    const { error: upErr } = await svc.storage
      .from('certificates')
      .upload(namaFail, bait, { contentType: 'application/pdf' });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    const { data: signed, error: signErr } = await svc.storage
      .from('certificates')
      .createSignedUrl(namaFail, SAAT_URL);
    if (signErr || !signed) {
      return NextResponse.json(
        { error: signErr?.message ?? 'Could not sign the sample URL.' },
        { status: 500 },
      );
    }
    return NextResponse.json({ url: signed.signedUrl, expires_in: SAAT_URL });
  }

  return new NextResponse(bait as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="certificate-sample.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
