/**
 * GET /api/classes/[id]/certificates/templates/[templateId]/background-url
 *
 * URL bertandatangan 10 minit untuk latar templat kelas (V2-016a),
 * untuk APA-APA laluan (kelas sendiri, galeri atau peribadi) supaya editor
 * susun atur V2-015 berfungsi untuk latar pustaka. Polisi storan 0042
 * hanya membenarkan pelayar membaca laluan <class_id>/, jadi laluan
 * gallery/ dan library/ mesti ditandatangani pelayan.
 *
 * Kebenaran: pendidik kelas (semakPendidikKelas), templat milik kelas.
 * Klien service role hanya dipanggil selepas semakan lulus.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';
import { dalamHad } from '@/lib/hadKadar';
import { bacaTemplatKelas } from '@/lib/sijil/keluarkan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAAT_URL = 600;

export async function GET(
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
  if (!dalamHad(`cert-bg-url:${userId}`)) {
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
  if (!template.background_path) {
    return NextResponse.json({ error: 'This template has no background image.' }, { status: 404 });
  }

  const svc = getServiceSupabase();
  const { data: signed, error: signErr } = await svc.storage
    .from('certificate-assets')
    .createSignedUrl(template.background_path, SAAT_URL);
  if (signErr || !signed) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Could not sign the background URL.' },
      { status: 500 },
    );
  }
  return NextResponse.json({ url: signed.signedUrl, expires_in: SAAT_URL });
}
