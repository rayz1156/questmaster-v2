/**
 * POST /api/classes/[id]/certificates/preview
 *
 * Pratonton PDF templat sijil dengan data contoh (nama "Sample Participant",
 * program = nama kelas). Hanya pendidik kelas. Badan: {template_id}.
 * PDF dimulangkan sebagai bait application/pdf, bukan JSON.
 *
 * Latar/logo dimuat turun daripada bucket `certificate-assets` dengan klien
 * service role HANYA selepas kebenaran pendidik disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { janaPdfSijil } from '@/lib/sijil/janaPdf';
import { normaliseSusunAtur } from '@/lib/sijil/susunAtur';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const classId = params.id;
  const userId = auth.user!.id;

  if (!dalamHad(`cert-preview:${userId}`)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a minute and try again.' },
      { status: 429 },
    );
  }

  const ok = await semakPendidikKelas(auth.supa, classId, userId);
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const templateId = typeof body.template_id === 'string' ? body.template_id : '';
  if (!templateId) return NextResponse.json({ error: 'template_id is required.' }, { status: 400 });

  // Templat mesti milik kelas ini (klien Bearer, RLS pendidik).
  const { data: template } = await auth.supa
    .from('qm_certificate_templates')
    .select('id, class_id, title, background_path, logo_path, layout')
    .eq('id', templateId)
    .eq('class_id', classId)
    .maybeSingle();
  if (!template) {
    return NextResponse.json({ error: 'Certificate template not found.' }, { status: 404 });
  }

  // Nama kelas sebagai program pada PDF contoh.
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
    // Gagal muat turun aset tidak menghalang pratonton: PDF dijana tanpa aset.
  }

  // Normalkan layout (V2-015) sebelum PDF dijana.
  const layout = normaliseSusunAtur(template.layout);
  const bait = await janaPdfSijil({
    nama: 'Sample Participant',
    program: kelas?.name ?? 'Sample Program',
    tarikh: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    pengeluar: 'Sample Educator',
    kod: 'PREVIEW',
    urlSah: 'https://kuizen.fun/sijil/PREVIEW',
    latar: latarBait,
    logo: logoBait,
    tera: true,
    layout,
  });

  return new NextResponse(bait as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="certificate-preview.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
