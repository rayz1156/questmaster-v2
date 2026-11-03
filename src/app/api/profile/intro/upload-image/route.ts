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

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const admin = getServiceSupabase();

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

  // Kuota foto profil dikira dalam kuota PENGGUNA SENDIRI, bukan kelas
  // mana-mana (p_class NULL). Disemak SEBELUM bait dihantar dan SEBELUM
  // injap 15MB (kzsec 4) supaya mesej had pelan yang tepat dipaparkan;
  // 15MB kekal sebagai injap operasi.
  const kuota = await reserveMuatNaik(auth.supa, null, file.size, mime);
  if (kuota) return NextResponse.json(kuota.body, { status: kuota.status });

  if (file.size > MAX_BYTES) return ralatJson(`File too large. Max ${Math.round(MAX_BYTES/1024/1024)} MB`, 413);

  const buf = Buffer.from(await file.arrayBuffer());
  let uploaded;
  try {
    uploaded = await fileluUpload(buf, file.name || `profile.${(mime.split('/')[1]||'jpg')}`, mime);
  } catch (e: any) {
    return ralatJson(e?.message || 'FileLu upload failed', 502);
  }

  const rekod = await rekodMuatNaik(auth.supa, null, uploaded.fileCode, uploaded.sizeBytes ?? file.size, mime, 'profile_intro');
  if (rekod) {
    // Rekod gagal selepas muat naik (kzsec 2/3): cuba padam fail daripada
    // storan supaya tiada fail yatim di luar kuota, kemudian balas ralat.
    const padam = await fileluDelete(uploaded.fileCode);
    console.error(`[profile-upload-image] rekod gagal, padam=${padam} code=${uploaded.fileCode}`);
    return NextResponse.json(rekod.body, { status: rekod.status });
  }

  // Persist on profile (and clear any existing video fields).
  const { error: upErr } = await admin.from('qm_profiles').update({
    intro_media_type: 'image',
    intro_image_file_code: uploaded.fileCode,
    intro_image_path: uploaded.fileCode,
    intro_media_updated_at: new Date().toISOString(),
  }).eq('id', auth.user!.id);
  if (upErr) return ralatJson(upErr.message, 500);

  const url = `/api/profile/image/${uploaded.fileCode}`;
  return NextResponse.json({ url, fileCode: uploaded.fileCode });
}
