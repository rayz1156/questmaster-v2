/**
 * POST /api/classes/[id]/certificates/templates/[templateId]/sample
 *
 * Jana PDF contoh templat sijil (V2-015) supaya kedudukan nama pada latar
 * reka bentuk penuh boleh disemak tanpa mengeluarkan sijil. Body:
 * { name?: string }. TIADA rekod qm_certificates dicipta dan kod contoh
 * CONTOH0000 tidak akan lulus pengesahan awam.
 *
 * Tanpa ?format=url: balas bait application/pdf terus.
 * Dengan ?format=url: simpan dalam bucket `certificates` pada
 * samples/<class_id>/<rawak>.pdf dan pulangkan URL bertandatangan sah
 * 10 minit supaya alat MCP dan pelayar boleh membukanya dalam tab baharu.
 *
 * Kebenaran: pendidik kelas (semakPendidikKelas), templat milik kelas.
 * Latar/logo dimuat turun dengan klien service role HANYA selepas
 * kebenaran disahkan (corak laluan preview).
 */
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { janaPdfSijil } from '@/lib/sijil/janaPdf';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kod contoh: tidak akan pernah wujud dalam qm_certificates kerana kod
 *  sebenar tidak mengandungi angka sifar (abjad 0042). */
const KOD_CONTOH = 'CONTOH0000';
const NAMA_LALAI = 'Nama Peserta Contoh';

/** Umur URL bertandatangan untuk contoh PDF. */
const SAAT_URL = 600;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; templateId: string } },
) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!UUID.test(String(classId)) || !UUID.test(String(params.templateId))) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  if (!dalamHad(`cert-sample:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const template = await bacaTemplatKelas(auth.supa, params.templateId, classId);
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const nama = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : NAMA_LALAI;

  // Nama kelas sebagai program pada PDF contoh (corak laluan preview).
  const { data: kelas } = await auth.supa
    .from('qm_classes')
    .select('name')
    .eq('id', classId)
    .maybeSingle();

  // Latar/logo: bait dimuat turun hanya jika templat memanggilnya.
  const svc = getServiceSupabase();
  let latarBait: Uint8Array | undefined;
  let logoBait: Uint8Array | undefined;
  try {
    if (template.background_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.background_path);
      if (d) latarBait = new Uint8Array(await d.arrayBuffer());
    }
    if (template.logo_path) {
      const { data: d } = await svc.storage.from('certificate-assets').download(template.logo_path);
      if (d) logoBait = new Uint8Array(await d.arrayBuffer());
    }
  } catch {
    // Gagal muat turun aset tidak menghalang contoh: PDF dijana tanpa aset.
  }

  // Normalkan layout (V2-015) sebelum PDF dijana.
  const layout = normaliseSusunAtur(template.layout);
  const bait = await janaPdfSijil({
    nama,
    program: kelas?.name ?? 'Sample Program',
    tarikh: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    pengeluar: 'Sample Educator',
    kod: KOD_CONTOH,
    urlSah: `https://kuizen.fun/sijil/${KOD_CONTOH}`,
    latar: latarBait,
    logo: logoBait,
    tera: true,
    layout,
  });

  // format=url: simpan dalam bucket certificates (pdf sahaja mengikut
  // allowed_mime_types 0042) dan pulangkan URL bertandatangan 10 minit.
  if (req.nextUrl.searchParams.get('format') === 'url') {
    const namaFail = `samples/${classId}/${randomBytes(12).toString('hex')}.pdf`;
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
