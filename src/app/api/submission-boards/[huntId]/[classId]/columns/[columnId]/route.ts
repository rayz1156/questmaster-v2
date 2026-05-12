import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

// PATCH /api/submission-boards/[huntId]/[classId]/columns/[columnId]
//   { title?, position? }  -- rename and/or reorder. RLS allows any class member.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { huntId: string; classId: string; columnId: string } }
) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa } = auth;

  const body = await req.json().catch(() => ({}));
  const updates: any = {};
  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    if (t.length > 80) return NextResponse.json({ error: 'title too long (max 80)' }, { status: 400 });
    updates.title = t;
  }
  if (typeof body.position === 'number' && Number.isFinite(body.position)) {
    updates.position = Math.max(0, Math.floor(body.position));
  }
  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supa
    .from('qm_submission_board_columns')
    .update(updates)
    .eq('id', params.columnId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 403 });
  return NextResponse.json({ column: data });
}

// DELETE /api/submission-boards/[huntId]/[classId]/columns/[columnId]
//   Allowed by RLS when:
//     - caller is class educator (full control), OR
//     - caller is class member AND column is empty.
//   This route just tries the delete; RLS enforces the rules.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { huntId: string; classId: string; columnId: string } }
) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa } = auth;

  // Pre-check: count items in this column for a clearer error message.
  const { count } = await supa
    .from('qm_submission_board_items')
    .select('id', { count: 'exact', head: true })
    .eq('column_id', params.columnId);

  const { error } = await supa
    .from('qm_submission_board_columns')
    .delete()
    .eq('id', params.columnId);

  if (error) {
    // If the column is non-empty and the caller is not an educator, RLS will block delete.
    if (count && count > 0) {
      return NextResponse.json(
        { error: `Column has ${count} item${count === 1 ? '' : 's'}. Move them first, or ask your educator to delete.` },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
