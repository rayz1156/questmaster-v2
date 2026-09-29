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
import { namaBerdaftar } from '@/lib/live-quiz';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Bacaan mesti pergi ke pangkalan data, bukan cache Next.js (lihat CLAUDE.md).
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const code = String(params.code || '').toUpperCase();
  // Kod format salah dibalas serta-merta (temuan R2 V2-007-sec): tiada
  // pertanyaan pangkalan data untuk dipandang daripada luarnya.
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

  // Temuan R2 (V2-007-sec): SEMUA pertanyaan dijalankan dahulu, keputusan
  // dibuat selepas itu, supaya bilangan pertanyaan (dan masa respons) SAMA
  // untuk setiap pemanggil disahkan. Tanpa ini, bilangan pertanyaan berbeza
  // mengikut laluan dan masa respons membocorkan status keahlian.
  const { data: session } = await supa
    .from('qm_live_sessions')
    .select('id, quiz_id')
    .eq('code', code)
    .limit(1)
    .maybeSingle();

  const { data: quiz } = await supa
    .from('qm_live_quizzes')
    .select('class_id')
    .eq('id', session?.quiz_id ?? '')
    .limit(1)
    .maybeSingle();
  const classId = (quiz?.class_id as string | null | undefined) || null;

  const { data: member } = await supa
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', classId ?? '')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const { data: educator } = await supa
    .from('qm_class_educators')
    .select('educator_id')
    .eq('class_id', classId ?? '')
    .eq('educator_id', user.id)
    .not('accepted_at', 'is', null)
    .limit(1)
    .maybeSingle();

  const { data: owner } = await supa
    .from('qm_classes')
    .select('id')
    .eq('id', classId ?? '')
    .eq('owner_id', user.id)
    .limit(1)
    .maybeSingle();

  // Nama berdaftar diambil untuk SETIAP pemanggil disahkan supaya bilangan
  // pertanyaan kekal seragam; nilai itu digunakan sahaja jika berkeahlian.
  const nama = await namaBerdaftar(supa, user.id);

  const berkeahlian =
    !!classId && !!session?.quiz_id && !!(member || educator || owner);
  return NextResponse.json({ registeredName: berkeahlian ? nama : null });
}
