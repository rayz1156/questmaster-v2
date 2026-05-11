import { NextRequest, NextResponse } from 'next/server';
import { requireClassOwner, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DupOpts = {
  newTitle?: string;
  copyLearningBoard?: boolean;
  copyActivities?: boolean;
  copyMembers?: boolean;
  copyEducators?: boolean;
  asTemplate?: boolean;   // strip content, keep structure
  asDraft?: boolean;      // unpublish learning board
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireClassOwner(req, params.id);
  if (auth.response) return auth.response;

  const admin = getServiceSupabase();
  const body: DupOpts = await req.json().catch(() => ({} as DupOpts));

  // ---- 1. Load source class
  const { data: src, error: srcErr } = await admin
    .from('qm_classes')
    .select('id, name, description, color, owner_id')
    .eq('id', params.id)
    .single();
  if (srcErr || !src) return NextResponse.json({ error: 'Source class not found' }, { status: 404 });

  const title = (body.newTitle && body.newTitle.trim()) || `Copy of ${src.name}`;
  const ownerId = auth.user!.id;

  // ---- 2. Create new class row
  const { data: newClass, error: insErr } = await admin
    .from('qm_classes')
    .insert({ owner_id: ownerId, name: title, description: src.description ?? null, color: src.color ?? '#6366f1' })
    .select('id, name')
    .single();
  if (insErr || !newClass) {
    return NextResponse.json({ error: insErr?.message || 'Failed to create class' }, { status: 500 });
  }
  const newClassId = newClass.id as string;

  // Add the owner to qm_class_educators as 'owner' (matches existing createClass behaviour)
  await admin.from('qm_class_educators').upsert(
    { class_id: newClassId, educator_id: ownerId, role: 'owner', invited_by: ownerId, accepted_at: new Date().toISOString() },
    { onConflict: 'class_id,educator_id' }
  );

  const summary: any = { classId: newClassId, name: title, copied: { columns: 0, cards: 0, hunts: 0, challenges: 0, members: 0, educators: 0 } };

  // ---- 3. Learning board (copy structure always — but cards conditionally)
  if (body.copyLearningBoard) {
    const { data: srcBoard } = await admin
      .from('qm_learning_boards')
      .select('id, is_published')
      .eq('class_id', params.id)
      .maybeSingle();

    // Always create a destination board row (most learning_board API routes assume one exists)
    const { data: newBoard } = await admin
      .from('qm_learning_boards')
      .insert({ class_id: newClassId, is_published: body.asDraft ? false : (srcBoard?.is_published ?? true) })
      .select('id')
      .single();

    if (srcBoard && newBoard) {
      const { data: srcCols } = await admin
        .from('qm_learning_columns')
        .select('id, title, position')
        .eq('board_id', srcBoard.id)
        .order('position', { ascending: true });

      for (const col of srcCols || []) {
        const { data: newCol } = await admin
          .from('qm_learning_columns')
          .insert({ board_id: newBoard.id, title: col.title, position: col.position })
          .select('id')
          .single();
        if (!newCol) continue;
        summary.copied.columns++;

        if (!body.asTemplate) {
          // copy cards by reference (same file/image URLs — no re-upload)
          const { data: srcCards } = await admin
            .from('qm_learning_cards')
            .select('*')
            .eq('column_id', col.id)
            .order('position', { ascending: true });
          for (const card of srcCards || []) {
            const { id, column_id, created_at, updated_at, created_by, ...rest } = card as any;
            await admin.from('qm_learning_cards').insert({ ...rest, column_id: newCol.id, created_by: ownerId });
            summary.copied.cards++;
          }
        }
      }
    }
  }

  // ---- 4. Activities (hunts + challenges, NO submissions)
  if (body.copyActivities) {
    const { data: srcHunts } = await admin
      .from('qm_hunts')
      .select('*')
      .eq('class_id', params.id);
    for (const hunt of srcHunts || []) {
      const { id: oldHuntId, created_at, updated_at, ...huntRest } = hunt as any;
      const { data: newHunt } = await admin
        .from('qm_hunts')
        .insert({ ...huntRest, owner_id: ownerId, class_id: newClassId, status: body.asDraft ? 'draft' : huntRest.status })
        .select('id')
        .single();
      if (!newHunt) continue;
      summary.copied.hunts++;

      if (!body.asTemplate) {
        const { data: srcCh } = await admin
          .from('qm_challenges')
          .select('*')
          .eq('hunt_id', oldHuntId);
        for (const ch of srcCh || []) {
          const { id, hunt_id, created_at: c2, updated_at: u2, ...chRest } = ch as any;
          await admin.from('qm_challenges').insert({ ...chRest, hunt_id: newHunt.id });
          summary.copied.challenges++;
        }
      }
    }
  }

  // ---- 5. Members (copy as-is)
  if (body.copyMembers && !body.asTemplate) {
    const { data: srcMembers } = await admin
      .from('qm_class_members')
      .select('user_id')
      .eq('class_id', params.id);
    if (srcMembers && srcMembers.length) {
      const rows = srcMembers.map((m: any) => ({ class_id: newClassId, user_id: m.user_id }));
      const { error: mErr } = await admin.from('qm_class_members').upsert(rows, { onConflict: 'class_id,user_id' });
      if (!mErr) summary.copied.members = rows.length;
    }
  }

  // ---- 6. Co-educators (excluding owner)
  if (body.copyEducators) {
    const { data: srcEdu } = await admin
      .from('qm_class_educators')
      .select('educator_id, role')
      .eq('class_id', params.id)
      .neq('role', 'owner');
    if (srcEdu && srcEdu.length) {
      const rows = srcEdu.map((e: any) => ({ class_id: newClassId, educator_id: e.educator_id, role: e.role, invited_by: ownerId, accepted_at: new Date().toISOString() }));
      const { error: eErr } = await admin.from('qm_class_educators').upsert(rows, { onConflict: 'class_id,educator_id' });
      if (!eErr) summary.copied.educators = rows.length;
    }
  }

  return NextResponse.json(summary);
}
