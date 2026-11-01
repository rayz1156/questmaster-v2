/**
 * POST /api/ai-rooms/[roomId]/members/[userId]/mute: bisukan atau
 * nyahbisukan seorang pelajar (KZ-033).
 *
 * Guru sahaja boleh menukar; guru lain tidak boleh dibisukan.
 * Badan: { muted: boolean }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { aksesBilik, ralatBilik, bacaJsonKecil } from '@/lib/bilikAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string; userId: string } },
) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatBilik(403, 'TEACHER_ONLY', 'Hanya guru boleh mengubah bisu ahli.');
  }
  const supa = akses.supa!;

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  if (typeof hasil.body.muted !== 'boolean') {
    return NextResponse.json({ error: 'muted mesti boolean.' }, { status: 400 });
  }
  const muted = hasil.body.muted;

  // Sasaran mesti ahli bilik ini (404 jika bukan).
  const { data: sasaran } = await supa
    .from('qm_ai_room_members')
    .select('user_id, role')
    .eq('room_id', params.roomId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (!sasaran) {
    return NextResponse.json({ error: 'Ahli tidak ditemui dalam bilik ini.' }, { status: 404 });
  }
  // Guru tidak boleh dibisukan oleh sesiapa pun.
  if (sasaran.role === 'teacher') {
    return NextResponse.json(
      { error: 'Guru tidak boleh dibisukan dalam bilik ini.' },
      { status: 403 },
    );
  }

  const { error } = await supa
    .from('qm_ai_room_members')
    .update({ muted })
    .eq('room_id', params.roomId)
    .eq('user_id', params.userId);
  if (error) {
    console.error('[bilik-ai] bisu ahli gagal:', error.message);
    return NextResponse.json({ error: 'Bisu ahli tidak dapat diubah.' }, { status: 500 });
  }
  return NextResponse.json({ userId: params.userId, muted });
}