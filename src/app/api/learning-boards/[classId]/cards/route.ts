import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember, getServiceSupabase } from '@/lib/supabase-route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/learning-boards/[classId]/cards
 * Body: { columnId, cardType, ...payload }
 * Used for non-video card types (link, image, text). Video cards are created
 * by the upload/complete route which has the Adilo file metadata.
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;
  const admin = getServiceSupabase();
  const body = await req.json().catch(() => ({}));
  const { columnId, cardType } = body;
  if (!columnId || !cardType) return NextResponse.json({ error: 'columnId and cardType required' }, { status: 400 });
  if (!['link', 'image', 'text', 'file'].includes(cardType)) {
    return NextResponse.json({ error: 'Use upload/complete for video cards' }, { status: 400 });
  }

  const { data: col } = await admin.from('qm_learning_columns').select('id, board_id').eq('id', columnId).single();
  if (!col) return NextResponse.json({ error: 'Column not found' }, { status: 404 });

  const { data: existing } = await owner.supa
    .from('qm_learning_cards')
    .select('id, position')
    .eq('column_id', columnId)
    .order('position', { ascending: true });
  const cardsList = existing || [];
  const maxPos = cardsList.length ? cardsList[cardsList.length - 1].position : -1;
  const rawInsert = (body as any).insertIndex;
  const hasInsert = typeof rawInsert === 'number' && rawInsert >= 0 && rawInsert <= cardsList.length;
  const nextPos = hasInsert ? rawInsert : maxPos + 1;
  if (hasInsert) {
    // Shift cards at or after insertIndex up by 1, descending to avoid unique conflicts
    for (let i = cardsList.length - 1; i >= 0; i--) {
      const c = cardsList[i];
      if (c.position >= rawInsert) {
        await admin.from('qm_learning_cards').update({ position: c.position + 1 }).eq('id', c.id);
      }
    }
  }

  const insert: any = {
    column_id: columnId,
    board_id: col.board_id,
    position: nextPos,
    card_type: cardType,
    created_by: owner.user!.id,
    title: typeof body.title === 'string' ? body.title : null,
    description: typeof body.description === 'string' ? body.description : null,
  };

  if (cardType === 'link') {
    if (!body.linkUrl) return NextResponse.json({ error: 'linkUrl required' }, { status: 400 });
    insert.link_url = body.linkUrl;
    insert.link_title = body.linkTitle ?? null;
    insert.link_description = body.linkDescription ?? null;
    insert.link_image_url = body.linkImageUrl ?? null;
    insert.link_site_name = body.linkSiteName ?? null;
    insert.link_favicon_url = body.linkFaviconUrl ?? null;
  } else if (cardType === 'image') {
    if (!body.imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
    insert.image_url = body.imageUrl;
    insert.image_path = body.imagePath ?? null;
    if (typeof body.fileluFileCode === 'string') insert.filelu_file_code = body.fileluFileCode;
  } else if (cardType === 'file') {
    if (!body.fileUrl) return NextResponse.json({ error: 'fileUrl required' }, { status: 400 });
    insert.file_url = body.fileUrl;
    insert.file_path = body.filePath ?? null;
    insert.file_name = body.fileName ?? null;
    insert.file_mime_type = body.fileMimeType ?? null;
    insert.file_size_bytes = typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : null;
    insert.file_extension = body.fileExtension ?? null;
    if (typeof body.fileluFileCode === 'string') insert.filelu_file_code = body.fileluFileCode;
  }
  // 'text' card just uses title + description.

  const { data, error } = await admin.from('qm_learning_cards').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ card: data });
}
