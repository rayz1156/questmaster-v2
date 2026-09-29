import { NextRequest, NextResponse } from 'next/server';
import { fileluUpload, fileluDelete } from '@/lib/filelu';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { reserveMuatNaik, rekodMuatNaik } from '@/lib/kuotaStoran';

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
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  if (!board.class_id) return NextResponse.json({ error: 'Board has no class' }, { status: 400 });

  const { data: klass } = await admin
    .from('qm_classes').select('id, owner_id').eq('id', board.class_id).single();
  if (!klass) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
  if (klass.owner_id !== auth.user!.id) {
    const { data: member } = await admin
      .from('qm_class_members').select('user_id').eq('class_id', board.class_id).eq('user_id', auth.user!.id).maybeSingle();
    // Ko-educator yang sudah menerima jemputan juga diterima (kzsec 5):
    // dia bukan qm_class_members tetapi berhak memuat naik.
    const { data: edu } = await admin
      .from('qm_class_educators').select('educator_id')
      .eq('class_id', board.class_id).eq('educator_id', auth.user!.id)
      .not('accepted_at', 'is', null).maybeSingle();
    if (!member && !edu) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  const mime = file.type || 'application/octet-stream';
  if (!mime.startsWith('image/')) return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 415 });

  // Kuota disemak SEBELUM bait dihantar dan SEBELUM injap 15MB (tiket
  // V2-002b-baiki, kzsec 4): had pelan (file_mb) dikuatkuasakan lebih
  // dahulu supaya mesej ralat pelan yang tepat sampai kepada pengguna.
  // Pemilik kuota ialah pemilik kelas papan ini; 15MB dikekalkan sebagai
  // injap operasi di hadapan had pelan.
  const kuota = await reserveMuatNaik(auth.supa, board.class_id, file.size, mime);
  if (kuota) return NextResponse.json(kuota.body, { status: kuota.status });

  if (file.size > MAX_BYTES) return NextResponse.json({ error: `File too large. Max ${Math.round(MAX_BYTES/1024/1024)} MB` }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await fileluUpload(buf, file.name || `intro.${(mime.split('/')[1]||'jpg')}`, mime);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'FileLu upload failed' }, { status: 502 });
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
