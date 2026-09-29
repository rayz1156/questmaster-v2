/**
 * POST /api/certificates/[id]/revoke
 *
 * Pembatalan sijil (tiada DELETE). Hanya pendidik kelas. Badan: {reason}.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase-route';
import { semakPendidikKelas } from '@/lib/peer-server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!reason) {
    return NextResponse.json({ error: 'A revocation reason is required.' }, { status: 400 });
  }

  // Baris sijil dibaca melalui klien Bearer supaya RLS peserta tidak bocor.
  const { data: cert } = await auth.supa
    .from('qm_certificates')
    .select('id, class_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!cert) {
    return NextResponse.json({ error: 'Certificate not found.' }, { status: 404 });
  }

  const ok = await semakPendidikKelas(auth.supa, cert.class_id, auth.user!.id);
  if (!ok) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await auth.supa.rpc('qm_revoke_certificate', {
    p_id: cert.id,
    p_reason: reason,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ revoked: true });
}
