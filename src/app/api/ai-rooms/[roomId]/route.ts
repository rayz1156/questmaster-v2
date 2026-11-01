/**
 * PATCH  /api/ai-rooms/[roomId]: kemas kini tetapan bilik (guru sahaja).
 * DELETE /api/ai-rooms/[roomId]: padam bilik (guru sahaja).
 *
 * KZ-033. Badan PATCH camelCase (title, description, modelId,
 * aiEnabled, contextEnabled, contextWindow, status), ikut borang UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { aksesBilik, ralatBilik, bacaJsonKecil } from '@/lib/bilikAi';

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
      return NextResponse.json({ error: 'Tajuk chatroom mesti teks.' }, { status: 400 });
    }
    const title = body.title.trim();
    if (title.length < 1 || title.length > 80) {
      return NextResponse.json(
        { error: 'Tajuk chatroom mesti 1 hingga 80 aksara.' },
        { status: 400 },
      );
    }
    set.title = title;
  }

  if (body.description !== undefined) {
    if (body.description === null) {
      set.description = null;
    } else if (typeof body.description === 'string') {
      const d = body.description.trim() || null;
      if (d && d.length > 300) {
        return NextResponse.json(
          { error: 'Penerangan chatroom maksimum 300 aksara.' },
          { status: 400 },
        );
      }
      set.description = d;
    } else {
      return NextResponse.json({ error: 'Penerangan chatroom mesti teks.' }, { status: 400 });
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
        return NextResponse.json(
          { error: 'Model tidak ditemui atau tidak didayakan.' },
          { status: 400 },
        );
      }
      set.model_id = model.id;
    } else {
      return NextResponse.json({ error: 'modelId mesti teks.' }, { status: 400 });
    }
  }

  if (body.aiEnabled !== undefined) {
    if (typeof body.aiEnabled !== 'boolean') {
      return NextResponse.json({ error: 'aiEnabled mesti boolean.' }, { status: 400 });
    }
    set.ai_enabled = body.aiEnabled;
  }

  if (body.contextEnabled !== undefined) {
    if (typeof body.contextEnabled !== 'boolean') {
      return NextResponse.json({ error: 'contextEnabled mesti boolean.' }, { status: 400 });
    }
    set.context_enabled = body.contextEnabled;
  }

  if (body.contextWindow !== undefined) {
    const n = Number(body.contextWindow);
    if (!Number.isInteger(n) || n < 0 || n > 50) {
      return NextResponse.json(
        { error: 'Tetingkap konteks mesti integer 0 hingga 50.' },
        { status: 400 },
      );
    }
    set.context_window = n;
  }

  if (body.status !== undefined) {
    if (body.status !== 'open' && body.status !== 'closed') {
      return NextResponse.json(
        { error: 'Status chatroom mesti open atau closed.' },
        { status: 400 },
      );
    }
    set.status = body.status;
  }

  if (Object.keys(set).length === 0) {
    return NextResponse.json({ error: 'Tiada medan untuk dikemas kini.' }, { status: 400 });
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
    return NextResponse.json({ error: 'Chatroom tidak dapat dikemas kini.' }, { status: 500 });
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
    return NextResponse.json({ error: 'Chatroom tidak dapat dipadam.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}