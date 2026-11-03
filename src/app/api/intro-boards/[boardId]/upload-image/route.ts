import { NextRequest, NextResponse } from 'next/server';
import { fileluUpload, fileluDelete } from '@/lib/filelu';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { reserveMuatNaik, rekodMuatNaik } from '@/lib/kuotaStoran';
import { failVideo, MESEJ_SEKAT_VIDEO } from '@/lib/sekatVideo';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

export async function POST(req: NextRequest, { params }: { params: { boardId: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();

  // Look up board + class; ensure user is owner or member
  const { data: board } = await admin
    .from('qm_boards').select('id, class_id').eq('id', params.boardId).single();
  if (!board) return ralatJson('Board not found', 404);
  if (!board.class_id) return ralatJson('Board has no class', 400);

  const { data: klass } = await admin
    .from('qm_classes').select('id, owner_id').eq('id', board.class_id).single();
  if (!klass) return ralatJson('Class not found', 404);
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin
      .from('qm_class_members').select('user_id').eq('class_id', board.class_id).eq('user_id', auth.user!.id).maybeSingle();
    // Ko-educator yang sudah menerima jemputan juga diterima (kzsec 5):
    // dia bukan qm_class_members tetapi berhak memuat naik.
    const { data: edu } = await admin
      .from('qm_class_educators').select('educator_id')
      .eq('class_id', board.class_id).eq('educator_id', auth.user!.id)
      .not('accepted_at', 'is', null).maybeSingle();
    if (!member && !edu) return ralatJson('Forbidden', 403);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return ralatJson('multipart/form-data expected', 400);
  const file = form.get('file');
  if (!(file instanceof File)) return ralatJson('file field missing', 400);
  if (file.size <= 0) return ralatJson('empty file', 400);
  const mime = file.type || 'application/octet-stream';
  // KZ-039: fail video tidak dibenarkan walau MIME dipalsukan sebagai imej;
  // sambungan nama fail turut disemak oleh failVideo.
  if (failVideo(file.name, file.type)) {
    return ralatJson(MESEJ_SEKAT_VIDEO, 400);
  }
  if (!mime.startsWith('image/')) return ralatJson(`Unsupported file type: ${mime}`, 415);

  // Kuota disemak SEBELUM bait dihantar dan SEBELUM injap 15MB (tiket
  // V2-002b-baiki, kzsec 4): had pelan (file_mb) dikuatkuasakan lebih
  // dahulu supaya mesej ralat pelan yang tepat sampai kepada pengguna.
  // Pemilik kuota ialah pemilik kelas papan ini; 15MB dikekalkan sebagai
  // injap operasi di hadapan had pelan.
  const kuota = await reserveMuatNaik(auth.supa, board.class_id, file.size, mime);
  if (kuota) return NextResponse.json(kuota.body, { status: kuota.status });

  if (file.size > MAX_BYTES) return ralatJson(`File too large. Max ${Math.round(MAX_BYTES/1024/1024)} MB`, 413);

  const buf = Buffer.from(await file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await fileluUpload(buf, file.name || `intro.${(mime.split('/')[1]||'jpg')}`, mime);
  } catch (e: any) {
    return ralatJson(e?.message || 'FileLu upload failed', 502);
  }

  const rekod = await rekodMuatNaik(auth.supa, board.class_id, uploaded.fileCode, uploaded.sizeBytes ?? file.size, mime, 'intro_board');
  if (rekod) {
    // Rekod gagal selepas muat naik (kzsec 2/3): cuba padam fail daripada
    // storan supaya tiada fail yatim di luar kuota, kemudian balas ralat.
    const padam = await fileluDelete(uploaded.fileCode);
    console.error(`[intro-upload-image] rekod gagal, padam=${padam} code=${uploaded.fileCode}`);
    return NextResponse.json(rekod.body, { status: rekod.status });
  }

  const url = `/api/intro-boards/${params.boardId}/image/${uploaded.fileCode}`;
  return NextResponse.json({ url, path: uploaded.fileCode, fileCode: uploaded.fileCode });
}
