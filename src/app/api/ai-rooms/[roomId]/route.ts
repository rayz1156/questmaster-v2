/**
 * PATCH  /api/ai-rooms/[roomId]: kemas kini tetapan bilik (guru sahaja).
 * DELETE /api/ai-rooms/[roomId]: padam bilik (guru sahaja).
 *
 * KZ-033. Badan PATCH camelCase (title, description, modelId,
 * aiEnabled, contextEnabled, contextWindow, status), ikut borang UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { aksesBilik, ralatBilik, bacaJsonKecil } from '@/lib/bilikAi';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const LAJUR_BILIK =
  'id, title, description, join_code, status, ai_enabled, context_enabled, context_window, model_id, created_at, updated_at, qm_ai_models(label)';

export async function PATCH(req: NextRequest, { params }: { params: { roomId: string } }) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatBilik(403, 'TEACHER_ONLY', 'Hanya guru boleh mengubah tetapan chatroom.');
  }
  const supa = akses.supa!;

  const hasil = await bacaJsonKecil(req);
  if (!hasil.ok) return hasil.response;
  const body = hasil.body;

  const set: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string') {
      return ralatJson('The chatroom title must be text.', 400);
    }
    const title = body.title.trim();
    if (title.length < 1 || title.length > 80) {
      return ralatJson('The chatroom title must be 1 to 80 characters.', 400);
    }
    set.title = title;
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      set.description = null;
    } else if (typeof body.description === 'string') {
      const d = body.description.trim() || null;
      if (d && d.length > 300) {
        return ralatJson('The chatroom description is limited to 300 characters.', 400);
      }
      set.description = d;
    } else {
      return ralatJson('The chatroom description must be text.', 400);
    }
  }

  if (body.modelId !== undefined) {
    if (body.modelId === null || body.modelId === '') {
      set.model_id = null;
    } else if (typeof body.modelId === 'string') {
      // Model mesti masih didayakan untuk dipilih.
      const { data: model } = await supa
        .from('qm_ai_models')
        .select('id')
        .eq('id', body.modelId)
        .eq('enabled', true)
        .maybeSingle();
      if (!model) {
        return ralatJson('Model not found or not enabled.', 400);
      }
      set.model_id = model.id;
    } else {
      return ralatJson('modelId must be text.', 400);
    }
  }

  if (body.aiEnabled !== undefined) {
    if (typeof body.aiEnabled !== 'boolean') {
      return ralatJson('aiEnabled must be boolean.', 400);
    }
    set.ai_enabled = body.aiEnabled;
  }

  if (body.contextEnabled !== undefined) {
    if (typeof body.contextEnabled !== 'boolean') {
      return ralatJson('contextEnabled must be boolean.', 400);
    }
    set.context_enabled = body.contextEnabled;
  }

  if (body.contextWindow !== undefined) {
    const n = Number(body.contextWindow);
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      return ralatJson('The context window must be an integer from 0 to 50.', 400);
    }
    set.context_window = n;
  }

  if (body.status !== undefined) {
    if (body.status !== 'open' && body.status !== 'closed') {
      return ralatJson('The chatroom status must be open or closed.', 400);
    }
    set.status = body.status;
  }

  if (Object.keys(set).length === 0) {
    return ralatJson('No fields to update.', 400);
  }

  // updated_at sentiasa ditetapkan pada setiap kemas kini.
  set.updated_at = new Date().toISOString();

  const { data, error } = await supa
    .from('qm_ai_rooms')
    .update(set)
    .eq('id', params.roomId)
    .select(LAJUR_BILIK)
    .single();
  if (error || !data) {
    console.error('[bilik-ai] kemas kini bilik gagal:', error?.message);
    return ralatJson('The chatroom could not be updated.', 500);
  }
  return NextResponse.json({ room: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { roomId: string } }) {
  const akses = await aksesBilik(req, params.roomId);
  if (akses.response) return akses.response;
  if (akses.role !== 'teacher') {
    return ralatBilik(403, 'TEACHER_ONLY', 'Hanya guru boleh memadam chatroom.');
  }
  const supa = akses.supa!;

  // on delete cascade memadam ahli dan mesej bersama bilik.
  const { error } = await supa
    .from('qm_ai_rooms')
    .delete()
    .eq('id', params.roomId);
  if (error) {
    console.error('[bilik-ai] padam bilik gagal:', error.message);
    return ralatJson('The chatroom could not be deleted.', 500);
  }
  return NextResponse.json({ ok: true });
}