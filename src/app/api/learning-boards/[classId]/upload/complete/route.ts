import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
import { getBunnyVideo } from '@/lib/bunny';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Completes a Bunny upload + creates the video learning_card row.
 * Educator/class-owner only.
 * Body: { columnId, videoGuid, filename?, durationSeconds?, title?, description?, insertIndex? }
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  if (owner.klass!.owner_id !== owner.user!.id) {
    return NextResponse.json({ error: 'Video upload requires educator permission.' }, { status: 403 });
  }
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { columnId, videoGuid, filename, durationSeconds, title, description, insertIndex } = body;
  if (!columnId || !videoGuid) {
    return NextResponse.json({ error: 'columnId and videoGuid required' }, { status: 400 });
  }

  let thumbnailUrl: string | null = null;
  let realDuration: number | null = null;
  try {
    const info = await getBunnyVideo(String(videoGuid));
    thumbnailUrl = info.thumbnailUrl ?? null;
    realDuration = typeof info.durationSeconds === 'number' && info.durationSeconds > 0 ? info.durationSeconds : null;
  } catch { /* Bunny may still be processing; thumbnail arrives later */ }

  const { data: col } = await owner.supa
    .from('qm_learning_columns')
    .select('id, board_id')
    .eq('id', columnId)
    .single();
  if (!col) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  const { data: existingCards } = await owner.supa
    .from('qm_learning_cards')
    .select('id, position')
    .eq('column_id', columnId)
    .order('position', { ascending: true });
  const cardsList = existingCards || [];
  const maxPos = cardsList.length ? cardsList[cardsList.length - 1].position : -1;
  const hasInsert = typeof insertIndex === 'number' && insertIndex >= 0 && insertIndex <= cardsList.length;
  const nextPos = hasInsert ? insertIndex : maxPos + 1;
  if (hasInsert) {
    for (let i = cardsList.length - 1; i >= 0; i--) {
      const c = cardsList[i];
      if (c.position >= insertIndex) {
        await admin.from('qm_learning_cards').update({ position: c.position + 1 }).eq('id', c.id);
      }
    }
  }

  const { data, error } = await owner.supa
    .from('qm_learning_cards')
    .insert({
      column_id: columnId,
      board_id: col.board_id,
      position: nextPos,
      card_type: 'video',
      title: typeof title === 'string' && title ? title : (typeof filename === 'string' ? filename : 'Video'),
      description: typeof description === 'string' ? description : null,
      video_provider: 'bunny',
      video_provider_id: String(videoGuid),
      adilo_file_id: null,
      adilo_project_id: null,
      video_thumbnail_url: thumbnailUrl,
      video_duration_seconds: realDuration ?? (typeof durationSeconds === 'number' ? durationSeconds : null),
      created_by: owner.user!.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
