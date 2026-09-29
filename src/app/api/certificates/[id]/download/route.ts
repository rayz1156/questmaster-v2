/**
 * GET /api/certificates/[id]/download
 *
 * Peserta pemilik sijil atau pendidik kelas. Balas redirect ke URL
 * bertandatangan Supabase Storage yang sah 5 minit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const certId = params.id;
  const userId = auth.user!.id;

  // Baca baris dengan service role HANYA selepas semakan hak di bawah
  // (RLS peserta akan menapis, tetapi kita perlu tahu kelas untuk educator).
  const svc = getServiceSupabase();
  const { data: cert } = await svc
    .from('qm_certificates')
    .select('id, participant_id, class_id, pdf_path')
    .eq('id', certId)
    .maybeSingle();
  if (!cert) {
    return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  }

  const sebagaiPemilik = cert.participant_id === userId;
  const sebagaiPendidik = sebagaiPemilik
    ? false
    : await semakPendidikKelas(auth.supa, cert.class_id, userId);
  if (!sebagaiPemilik && !sebagaiPendidik) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!cert.pdf_path) {
    return NextResponse.json({ error: 'Certificate PDF is not ready.' }, { status: 409 });
  }

  // URL bertandatangan 5 minit; bucket peribadi, tiada akses langsung.
  const { data, error } = await svc.storage
    .from('certificates')
    .createSignedUrl(cert.pdf_path, 300);
  if (error || !data) {
    return NextResponse.json({ error: 'Could not sign the download URL.' }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
