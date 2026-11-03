/**
 * POST /api/ai-rooms/[roomId]/messages/[msgId]/stop: hentikan jawapan
 * AI yang sedang berjalan (KZ-033).
 *
 * Hanya penanya (asked_by) atau guru. Hanya jika status masih
 * queued/streaming; tetapkan 'stopped'. Laluan ask membaca semula
 * status ini pada setiap kemas kini berkala (800 ms) dan membatalkan
 * strim, jadi berhenti berlaku dalam kira-kira satu saat.
 */
import { NextRequest, NextResponse } from 'next/server';
import { aksesBilik, ralatBilik } from '@/lib/bilikAi';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(
  req: NextRequest,
  { params }: { params: { roomId: string; msgId: string } },
) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  const user = akses.user!;
  const supa = akses.supa!;

  // Mesej mesti milik bilik ini (404 jika msgId dari bilik lain).
  const { data: mesej } = await supa
    .from('qm_ai_messages')
    .select('id, author_kind, asked_by, ai_status, deleted_at')
    .eq('id', params.msgId)
    .eq('room_id', params.roomId)
    .maybeSingle();
  if (!mesej) {
    return ralatJson('Message not found.', 404);
  }
  if (mesej.author_kind !== 'ai' || mesej.deleted_at) {
    return ralatJson('This message is not an AI answer.', 409);
  }
  // Hanya penanya atau guru boleh menghentikan.
  if (akses.role !== 'teacher' && mesej.asked_by !== user.id) {
    return ralatBilik(403, 'NOT_ASKER', 'Hanya penanya atau guru boleh menghentikan jawapan AI.');
  }
  if (mesej.ai_status !== 'queued' && mesej.ai_status !== 'streaming') {
    return ralatJson('This AI answer is already finished.', 409, { code: 'AI_DONE' });
  }

  const now = new Date().toISOString();
  const { error } = await supa
    .from('qm_ai_messages')
    .update({ ai_status: 'stopped', updated_at: now })
    .eq('id', params.msgId)
    .in('ai_status', ['queued', 'streaming']);
  if (error) {
    console.error('[bilik-ai] henti jawapan gagal:', error.message);
    return ralatJson('The answer could not be stopped.', 500);
  }
  return NextResponse.json({ status: 'stopped' });
}