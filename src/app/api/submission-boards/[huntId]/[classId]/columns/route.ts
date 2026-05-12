import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

// GET /api/submission-boards/[huntId]/[classId]/columns
// List columns for the board belonging to (huntId, classId)
export async function GET(
  req: NextRequest,
  { params }: { params: { huntId: string; classId: string } }
) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa } = auth;

  // Find the board
  const { data: board, error: bErr } = await supa
    .from('qm_submission_boards')
    .select('id')
    .eq('activity_id', params.huntId)
    .eq('class_id', params.classId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 403 });
  if (!board) return NextResponse.json({ columns: [] });

  const { data, error } = await supa
    .from('qm_submission_board_columns')
    .select('*')
    .eq('board_id', board.id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ columns: data || [] });
}

// POST /api/submission-boards/[huntId]/[classId]/columns  { title }
// Any class member can create. RLS enforces membership.
export async function POST(
  req: NextRequest,
  { params }: { params: { huntId: string; classId: string } }
) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa, user } = auth;

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  if (title.length > 80) return NextResponse.json({ error: 'title too long (max 80)' }, { status: 400 });

  const { data: board, error: bErr } = await supa
    .from('qm_submission_boards')
    .select('id')
    .eq('activity_id', params.huntId)
    .eq('class_id', params.classId)
    .maybeSingle();
  if (bErr || !board) return NextResponse.json({ error: bErr?.message || 'Board not found' }, { status: 404 });

  // Next position = max(position)+1
  const { data: existing } = await supa
    .from('qm_submission_board_columns')
    .select('position')
    .eq('board_id', board.id)
    .order('position', { ascending: false })
    .limit(1);
  const nextPos = (existing && existing[0]?.position != null) ? existing[0].position + 1 : 0;

  const { data, error } = await supa
    .from('qm_submission_board_columns')
    .insert({ board_id: board.id, title, position: nextPos, created_by: user!.id })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ column: data });
}
