/**
 * GET /api/live/play/[code]/whoami (tiket V2-007)
 *
 * Laluan ringan untuk skrin masuk Kuiz Langsung. Bearer pilihan:
 *   * tanpa Bearer atau token tidak sah: { registeredName: null };
 *   * dengan Bearer sah dan pengguna ahli (qm_class_members) atau educator
 *     (qm_class_educators dengan accepted_at, atau pemilik qm_classes) kelas
 *     milik kuiz sesi itu: { registeredName: "<nama>" }.
 *
 * Nama datang daripada token yang disahkan di pelayan, BUKAN daripada badan
 * permintaan. Semakan keahlian dibuat dengan service role kerana polisi
 * SELECT qm_class_members ialah p_cm_owner (pemilik sahaja), jadi ahli biasa
 * tidak boleh membaca baris keahliannya sendiri melalui klien berperanan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase, getServiceSupabase, bearerFromReq } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Bacaan mesti pergi ke pangkalan data, bukan cache Next.js (lihat CLAUDE.md).
export const fetchCache = 'force-no-store';

// Potong nama kepada 24 aksara, mengikut had nickname qm_live_players.
function potongNama(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const bersih = v.trim();
  if (bersih.length === 0) return null;
  return bersih.slice(0, 24);
}

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    return NextResponse.json({ registeredName: null });
  }

  const token = bearerFromReq(req);
  if (!token) return NextResponse.json({ registeredName: null });

  // Sahkan token (corak sedia ada: auth.getUser, bukan kuki).
  const routeSupa = getRouteSupabase(req);
  const { data: gu } = await routeSupa.auth.getUser(token);
  const user = gu.user;
  if (!user) return NextResponse.json({ registeredName: null });

  const supa = getServiceSupabase();

  // Sesi mengikut kod, kemudian kelas milik kuiz sesi itu.
  const { data: session } = await supa
    .from('qm_live_sessions')
    .select('id, quiz_id')
    .eq('code', code)
    .limit(1)
    .maybeSingle();
  if (!session?.quiz_id) return NextResponse.json({ registeredName: null });

  const { data: quiz } = await supa
    .from('qm_live_quizzes')
    .select('class_id')
    .eq('id', session.quiz_id)
    .limit(1)
    .maybeSingle();
  const classId = quiz?.class_id as string | null | undefined;
  if (!classId) return NextResponse.json({ registeredName: null });

  // Ahli kelas, educator diterima, atau pemilik kelas.
  const { data: member } = await supa
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', classId)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  let educator: { educator_id: string } | null = null;
  let owner: { id: string } | null = null;
  if (!member) {
    const r = await supa
      .from('qm_class_educators')
      .select('educator_id')
      .eq('class_id', classId)
      .eq('educator_id', user.id)
      .not('accepted_at', 'is', null)
      .limit(1)
      .maybeSingle();
    educator = (r.data as { educator_id: string } | null) ?? null;
  }
  if (!member && !educator) {
    const r = await supa
      .from('qm_classes')
      .select('id')
      .eq('id', classId)
      .eq('owner_id', user.id)
      .limit(1)
      .maybeSingle();
    owner = (r.data as { id: string } | null) ?? null;
  }
  if (!member && !educator && !owner) {
    return NextResponse.json({ registeredName: null });
  }

  // Nama berdaftar: display_name, jika tiada bahagian emel sebelum @.
  const { data: profil } = await supa
    .from('qm_profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .limit(1)
    .maybeSingle();
  const nama =
    potongNama(profil?.display_name) ??
    (typeof profil?.email === 'string' && profil.email.includes('@')
      ? potongNama(profil.email.split('@')[0])
      : null);
  return NextResponse.json({ registeredName: nama });
}
