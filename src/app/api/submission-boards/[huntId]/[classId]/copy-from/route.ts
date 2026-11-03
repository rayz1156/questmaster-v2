import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const dynamic = 'force-dynamic';

async function isEducator(supa: any, classId: string, userId: string, ownerId: string): Promise<boolean> {
  if (ownerId === userId) return true;
  const { data } = await supa.from('qm_class_educators').select('user_id').eq('class_id', classId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

// Copy a submission board (settings + columns only, no submissions) from another
// activity in the SAME class into this activity.
export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa, klass, user } = auth;
  const educator = await isEducator(supa, params.classId, user!.id, klass!.owner_id);
  if (!educator) return ralatJson('Only educators can copy boards', 403);

  const body = await req.json().catch(() => ({}));
  const sourceActivityId = typeof body.sourceActivityId === 'string' ? body.sourceActivityId : '';
  if (!sourceActivityId) return ralatJson('sourceActivityId required', 400);
  if (sourceActivityId === params.huntId) return ralatJson('Source and target are the same activity', 400);

  // A board must not already exist for the target activity in this class.
  const { data: existingTarget } = await supa
    .from('qm_submission_boards')
    .select('id')
    .eq('activity_id', params.huntId)
    .eq('class_id', params.classId)
    .maybeSingle();
  if (existingTarget) return ralatJson('This activity already has a board', 409);

  // Load the source board. It must be in the SAME class.
  const { data: source, error: sErr } = await supa
    .from('qm_submission_boards')
    .select('*')
    .eq('activity_id', sourceActivityId)
    .eq('class_id', params.classId)
    .maybeSingle();
  if (sErr) return ralatJson(sErr.message, 500);
  if (!source) return ralatJson('Source board not found in this class', 404);

  // Create the new board with the source board's settings.
  const { data: newBoard, error: cErr } = await supa
    .from('qm_submission_boards')
    .insert({
      activity_id: params.huntId,
      class_id: params.classId,
      title: source.title,
      description: source.description,
      visibility: source.visibility,
      view_mode: source.view_mode,
      created_by: user!.id,
    })
    .select('*')
    .single();
  if (cErr) return ralatJson(cErr.message, 500);

  // Copy the source board's columns (title + position only).
  const { data: srcCols } = await supa
    .from('qm_submission_board_columns')
    .select('title, position')
    .eq('board_id', source.id)
    .order('position', { ascending: true });
  let copiedColumns = 0;
  if (srcCols && srcCols.length) {
    const rows = srcCols.map((c: any) => ({ board_id: newBoard.id, title: c.title, position: c.position, created_by: user!.id }));
    const { error: colErr } = await supa.from('qm_submission_board_columns').insert(rows);
    if (!colErr) copiedColumns = rows.length;
  }

  return NextResponse.json({ board: newBoard, copiedColumns });
}
