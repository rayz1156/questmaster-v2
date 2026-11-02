import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { parseYouTubeId, youtubeThumbnail } from '@/lib/video-embed';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;
  const { supa, user } = auth;

  // Find the board
  const { data: board } = await supa
    .from('qm_submission_boards')
    .select('*')
    .eq('activity_id', params.huntId)
    .eq('class_id', params.classId)
    .maybeSingle();
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  if (!board.is_open) return NextResponse.json({ error: 'Board is closed for submissions' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const itemType: string = body.itemType;
  if (itemType === 'chatbot') {
    // KZ-039: pilihan chatbot dibuang daripada semua papan.
    return NextResponse.json({ error: 'Item chatbot tidak lagi disokong.' }, { status: 400 });
  }
  if (itemType === 'video') {
    // KZ-039: item video HANYA melalui pautan YouTube. Provider lain
    // (bunny/adilo) ialah muat naik terus dan ditolak; URL YouTube disahkan
    // oleh parseYouTubeId dalam cabang di bawah.
    if (body.videoProvider !== 'youtube') {
      return NextResponse.json(
        { error: 'Muat naik video terus tidak lagi disokong. Kongsi pautan YouTube.' },
        { status: 400 },
      );
    }
  } else if (!['text', 'image', 'link', 'file'].includes(itemType)) {
    return NextResponse.json({ error: 'Invalid itemType' }, { status: 400 });
  }

  const insert: any = {
    board_id: board.id,
    // Optional: place into a specific column.
    column_id: (typeof body.columnId === 'string' ? body.columnId : null),
    submitted_by: user!.id,
    item_type: itemType,
    title: typeof body.title === 'string' ? body.title : null,
    description: typeof body.description === 'string' ? body.description : null,
  };

  if (itemType === 'link') {
    if (!body.linkUrl) return NextResponse.json({ error: 'linkUrl required' }, { status: 400 });
    insert.link_url = body.linkUrl;
    insert.link_title = body.linkTitle ?? null;
    insert.link_description = body.linkDescription ?? null;
    insert.link_image_url = body.linkImageUrl ?? null;
    insert.link_site_name = body.linkSiteName ?? null;
    insert.link_favicon_url = body.linkFaviconUrl ?? null;
  } else if (itemType === 'image') {
    if (!body.imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
    insert.image_url = body.imageUrl;
    insert.image_path = body.imagePath ?? null;
    if (typeof body.fileluFileCode === 'string') insert.filelu_file_code = body.fileluFileCode;
  } else if (itemType === 'file') {
    if (!body.fileUrl) return NextResponse.json({ error: 'fileUrl required' }, { status: 400 });
    insert.file_url = body.fileUrl;
    insert.file_path = body.filePath ?? null;
    insert.file_name = body.fileName ?? null;
    insert.file_mime_type = body.fileMimeType ?? null;
    insert.file_size_bytes = typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : null;
    insert.file_extension = body.fileExtension ?? null;
    if (typeof body.fileluFileCode === 'string') insert.filelu_file_code = body.fileluFileCode;
  } else if (itemType === 'video') {
    // KZ-039: hanya YouTube. Provider bunny/adilo sudah ditolak di atas,
    // dan URL mesti lulus parseYouTubeId supaya cabang ini tidak boleh
    // dipakai untuk menyimpan URL bukan YouTube sebagai video.
    const ytId = parseYouTubeId(String(body.youtubeUrl || body.videoProviderId || ''));
    if (!ytId) return NextResponse.json({ error: 'Please provide a valid YouTube link' }, { status: 400 });
    insert.video_provider = 'youtube';
    insert.video_provider_id = ytId;
    insert.video_thumbnail_url = youtubeThumbnail(ytId);
    insert.video_duration_seconds = typeof body.videoDurationSeconds === 'number' ? body.videoDurationSeconds : null;
  }

  const { data, error } = await supa.from('qm_submission_board_items').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}
