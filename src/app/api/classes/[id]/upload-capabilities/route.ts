import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { getEffectiveCapabilities } from '@/lib/capabilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/classes/[id]/upload-capabilities
 *
 * KZ-017: keupayaan muat naik berkesan untuk pengguna SEMASA dalam konteks
 * kelas. Auth melalui header Authorization: Bearer (requireClassMember);
 * bukan ahli/pemilik/ko-pendidik ditolak dengan 403/404 oleh requireClassMember
 * sebelum apa-apa keupayaan dikira.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireClassMember(req, params.id);
  if (auth.response) return auth.response;

  const caps = await getEffectiveCapabilities(auth.supa, auth.user!.id, params.id);
  return NextResponse.json(caps);
}
