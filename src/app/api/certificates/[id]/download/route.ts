/**
 * GET /api/certificates/[id]/download
 *
 * Peserta pemilik sijil atau pendidik kelas. Balas redirect ke URL
 * bertandatangan Supabase Storage yang sah 5 minit.
 *
 * M3: bacaan baris guna klien Bearer (RLS menapis), dan setiap kegagalan
 * akses dibalas 404 generik supaya kewujudan ID sijil tidak bocor melalui
 * beza kod status 403 vs 404.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const certId = params.id;

  // Baca dengan klien Bearer: RLS hanya menunjukkan baris kepada pemilik
  // sijil atau pendidik kelas. Baris tidak kelihatan = 404 generik.
  const { data: cert } = await auth.supa
    .from('qm_certificates')
    .select('id, participant_id, class_id, pdf_path')
    .eq('id', certId)
    .maybeSingle();
  if (!cert) {
    return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  }

  if (!cert.pdf_path) {
    return NextResponse.json({ error: 'Certificate PDF is not ready.' }, { status: 409 });
  }

  // Service role HANYA untuk menandatangani URL storage (bucket peribadi,
  // tiada akses langsung).
  const svc = getServiceSupabase();
  const { data, error } = await svc.storage
    .from('certificates')
    .createSignedUrl(cert.pdf_path, 300);
  if (error || !data) {
    return NextResponse.json({ error: 'Could not sign the download URL.' }, { status: 500 });
  }
  return NextResponse.redirect(data.signedUrl, 302);
}
