import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { admin } from '@/lib/mcp/db';
import { s5HeadObject, s5FileCode, s5DeleteObject } from '@/lib/s5';
import { fileluShareUrl } from '@/lib/filelu';
import { reserveMuatNaik, rekodMuatNaik } from '@/lib/kuotaStoran';
import { failVideo, MESEJ_SEKAT_VIDEO } from '@/lib/sekatVideo';
import { ralatJson } from '@/lib/i18n/ralatApi';

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
  if (!ticketId) return ralatJson('ticketId required', 400);

  const { data: ticket } = await admin()
    .from('upload_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  const t = ticket as any;
  if (!t) return ralatJson('Ticket not found', 404);
  if (t.user_id !== owner.user!.id) {
    return ralatJson('Ticket belongs to another user', 403);
  }
  if (t.class_id !== params.classId) {
    return ralatJson('Ticket belongs to another class', 403);
  }
  if (t.consumed_at) return ralatJson('Ticket already used', 409);
  if (new Date(t.expires_at).getTime() < Date.now()) {
    return ralatJson('Ticket expired', 410);
  }

  let head: any;
  try {
    head = await s5HeadObject(t.object_key);
  } catch (e: any) {
    return ralatJson(`Storage read failed: ${e?.message || e}`, 502);
  }
  if (!head?.exists) {
    return ralatJson('No object at the ticket path. Was the file actually PUT to upload_url?', 409);
  }
  const size = Number(head.size || 0);
  if (size <= 0) return ralatJson('Uploaded object is empty', 409);

  // Guna sekali sahaja. Kemas kini bersyarat supaya dua finalize serentak
  // tidak boleh kedua-duanya berjaya.
  const { data: claimed } = await admin()
    .from('upload_tickets')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', ticketId)
    .is('consumed_at', null)
    .select('id')
    .maybeSingle();
  if (!claimed) return ralatJson('Ticket already used', 409);

  const fileCode = s5FileCode(t.object_key);
  const mime = head.contentType || t.mime_type || 'application/octet-stream';

  // Pembetulan CTO (kzsec KZ-039 #1): tiket hanya menyemak nama dan MIME
  // yang diisytihar klien; semak semula MIME sebenar daripada storan supaya
  // video tidak boleh diseludup melalui URL pratertanda.
  if (failVideo(String(t.file_name ?? ''), mime)) {
    try { await s5DeleteObject(t.object_key); } catch {}
    return ralatJson(MESEJ_SEKAT_VIDEO, 400);
  }

  // Kuota disemak dengan saiz SEBENAR yang diterima di storan (head.size),
  // bukan saiz yang diisytihar klien (tiket V2-002b, risiko kzsec).
  const kuota = await reserveMuatNaik(owner.supa, params.classId, size, mime);
  if (kuota) {
    // Tolak dan kemas objek supaya storan tidak bertambah dengan fail
    // yang tidak direkod. Kegagalan padam tidak menghalang penolakan.
    try {
      await s5DeleteObject(t.object_key);
    } catch (e: unknown) {
      console.error(`[upload-finalize] gagal padam objek selepas kuota menolak: ${e instanceof Error ? e.message : e}`);
    }
    return NextResponse.json(kuota.body, { status: kuota.status });
  }

  const rekod = await rekodMuatNaik(owner.supa, params.classId, fileCode, size, mime, 'learning_board_presigned');
  if (rekod) {
    // Rekod gagal selepas objek disahkan wujud (kzsec 2/3): padam objek
    // supaya tiada fail yatim di luar kuota, kemudian balas ralat. Jangan
    // gagal senyap.
    try {
      await s5DeleteObject(t.object_key);
    } catch (e: unknown) {
      console.error(`[upload-finalize] gagal padam objek selepas rekod gagal: ${e instanceof Error ? e.message : e}`);
    }
    return NextResponse.json(rekod.body, { status: rekod.status });
  }

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
