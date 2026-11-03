/**
 * DELETE /api/ai-rooms/[roomId]/messages/[msgId]: padam lembut satu
 * mesej (KZ-033).
 *
 * Guru boleh memadam apa-apa mesej; pelajar hanya mesej manusia yang
 * mereka sendiri tulis. Padam lembut: deleted_at, deleted_by, body ''
 * dan updated_at = now(), supaya semua klien melihat "Mesej dipadam".
 * msgId yang bukan milik bilik ini: 404 (IDOR dikawal).
 */
import { NextRequest, NextResponse } from 'next/server';
import { aksesBilik, ralatBilik } from '@/lib/bilikAi';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { roomId: string; msgId: string } },
) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  const user = akses.user!;
  const supa = akses.supa!;

  // Mesej mesti milik bilik ini (404 jika tidak).
  const { data: mesej } = await supa
    .from('qm_ai_messages')
    .select('id, author_kind, author_id, deleted_at')
    .eq('id', params.msgId)
    .eq('room_id', params.roomId)
    .maybeSingle();
  if (!mesej) {
    return ralatJson('Mesej tidak ditemui.', 404);
  }
  if (mesej.deleted_at) {
    // Sudah dipadam; balas ok supaya klien bergerak tanpa ralat.
    return NextResponse.json({ ok: true });
  }

  // Guru boleh padam apa-apa; pelajar hanya mesej manusia sendiri.
  if (akses.role !== 'teacher') {
    if (mesej.author_kind !== 'human' || mesej.author_id !== user.id) {
      return ralatBilik(
        403,
        'NOT_AUTHOR',
        'Pelajar hanya boleh memadam mesej sendiri.',
      );
    }
  }

  const now = new Date().toISOString();
  const { error } = await supa
    .from('qm_ai_messages')
    .update({
      deleted_at: now,
      deleted_by: user.id,
      body: '',
      updated_at: now,
    })
    .eq('id', params.msgId);
  if (error) {
    console.error('[bilik-ai] padam mesej gagal:', error.message);
    return ralatJson('Mesej tidak dapat dipadam.', 500);
  }
  return NextResponse.json({ ok: true });
}