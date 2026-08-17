import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { admin } from '@/lib/mcp/db';
import { s5HeadObject, s5FileCode } from '@/lib/s5';
import { fileluShareUrl } from '@/lib/filelu';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.substring(i + 1).toLowerCase();
}

/**
 * POST /api/learning-boards/[classId]/upload/finalize
 * Body: { ticketId }
 *
 * Jangan percaya bahawa muat naik berjaya hanya kerana tiket dikeluarkan.
 * Objek disahkan wujud di storan sebelum sebarang file_code dipulangkan.
 */
export async function POST(req: NextRequest, { params }: { params: { classId: string } }) {
  const owner = await requireClassMember(req, params.classId);
  if (owner.response) return owner.response;

  const body = await req.json().catch(() => ({} as any));
  const ticketId = typeof body.ticketId === 'string' ? body.ticketId.trim() : '';
  if (!ticketId) return NextResponse.json({ error: 'ticketId required' }, { status: 400 });

  const { data: ticket } = await admin()
    .from('upload_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  const t = ticket as any;
  if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  if (t.user_id !== owner.user!.id) {
    return NextResponse.json({ error: 'Ticket belongs to another user' }, { status: 403 });
  }
  if (t.class_id !== params.classId) {
    return NextResponse.json({ error: 'Ticket belongs to another class' }, { status: 403 });
  }
  if (t.consumed_at) return NextResponse.json({ error: 'Ticket already used' }, { status: 409 });
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Ticket expired' }, { status: 410 });
  }

  let head: any;
  try {
    head = await s5HeadObject(t.object_key);
  } catch (e: any) {
    return NextResponse.json({ error: `Storage read failed: ${e?.message || e}` }, { status: 502 });
  }
  if (!head?.exists) {
    return NextResponse.json(
      { error: 'No object at the ticket path. Was the file actually PUT to upload_url?' },
      { status: 409 }
    );
  }
  const size = Number(head.size || 0);
  if (size <= 0) return NextResponse.json({ error: 'Uploaded object is empty' }, { status: 409 });

  // Guna sekali sahaja. Kemas kini bersyarat supaya dua finalize serentak
  // tidak boleh kedua-duanya berjaya.
  const { data: claimed } = await admin()
    .from('upload_tickets')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', ticketId)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) return NextResponse.json({ error: 'Ticket already used' }, { status: 409 });

  const fileCode = s5FileCode(t.object_key);
  const mime = head.contentType || t.mime_type || 'application/octet-stream';

  console.log(
    `[upload-finalize] user=${owner.user!.id} class=${params.classId} key=${t.object_key} bytes=${size}`
  );

  return NextResponse.json({
    fileCode,
    fileUrl: fileluShareUrl(fileCode),
    fileluFileUrl: `/api/learning-boards/${params.classId}/file-redirect/${fileCode}`,
    fileName: t.file_name,
    fileMimeType: mime,
    fileSizeBytes: size,
    fileExtension: extOf(t.file_name) || null,
  });
}
