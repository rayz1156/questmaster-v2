import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

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
    if (!t) return ralatJson('title cannot be empty', 400);
    if (t.length > 80) return ralatJson('title too long (max 80)', 400);
    updates.title = t;
  }
  if (typeof body.position === 'number' && Number.isFinite(body.position)) {
    updates.position = Math.max(0, Math.floor(body.position));
  }
  if (!Object.keys(updates).length) {
    return ralatJson('Nothing to update', 400);
  }

  const { data, error } = await supa
    .from('qm_submission_board_columns')
    .update(updates)
    .eq('id', params.columnId)
    .select('*')
    .single();
  if (error) return ralatJson(error.message, 403);
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
      return ralatJson(`Column has ${count} item${count === 1 ? '' : 's'}. Move them first, or ask your educator to delete.`, 409);
    }
    return ralatJson(error.message, 403);
  }
  return NextResponse.json({ ok: true });
}
