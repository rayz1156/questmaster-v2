import { NextRequest, NextResponse } from 'next/server';
import { requireClassMember } from '@/lib/supabase-route';
import { assertCapability } from '@/lib/capabilities';
import { fileluUpload, fileluShareUrl, fileluDelete } from '@/lib/filelu';
import { imejRasterSebenar, checkRateLimit } from '@/lib/upload-guard';
import { reserveMuatNaik, rekodMuatNaik } from '@/lib/kuotaStoran';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Had tetap 150MB digugurkan (tiket V2-002b): had sebenar kini datang
// daripada pelan berkesan pemilik kelas melalui qm_reserve_upload.
// Video DITERUSKAN ke qm_reserve_upload (V2-002b-baiki): pelan dengan
// kunci video = true dibenarkan, yang lain ditolak oleh fungsi pangkalan
// data, bukan oleh senarai ini.
const ALLOWED_MIME_PREFIXES = [
  'image/',
  'audio/',
  'video/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats',
  'application/vnd.ms-',
  'application/zip',
  'text/',
];

function extOf(name: string): string {
  const m = name.match(/\.([a-zA-Z0-9]+)$/);
  return m ? m[1].toLowerCase() : '';
}

export async function POST(req: NextRequest, { params }: { params: { huntId: string; classId: string } }) {
  const auth = await requireClassMember(req, params.classId);
  if (auth.response) return auth.response;

  // KZ-017 R2-3 (pembetulan kzsec pusingan 2, penemuan 2): semakan pantas
  // SEBELUM badan berbilang bahagian dibaca. req.formData() menimbal seluruh
  // badan dalam memori, jadi permintaan besar daripada peminta tanpa hak
  // ditolak lebih awal. Semakan ini adalah gagal-cepat sahaja; semakan tepat
  // selepas penghiduan bait dikekalkan di bawah.
  const rate = checkRateLimit(auth.user!.id);
  if (!rate.ok) {
    return NextResponse.json(
      { error: `Too many uploads. Try again in ${rate.retryAfterSec}s` },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec) } },
    );
  }
  // Keupayaan dikira SEKALI di sini dan diguna semula selepas penghiduan bait
  // (jangan panggil assertCapability kali kedua). Pengguna tanpa keupayaan
  // fail hanya boleh memuat naik imej raster, jadi had 25 MB pada badan yang
  // diumumkan adalah munasabah sebagai tolakan awal tanpa membaca badan.
  const capAwal = await assertCapability(auth.supa, auth.user!.id, 'files', { classId: params.classId });
  const panjangDiumum = Number(req.headers.get('content-length') || 0);
  if (!capAwal.ok && panjangDiumum > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'Image too large. Maximum 25 MB.' }, { status: 413 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'multipart/form-data expected' }, { status: 400 });
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field missing' }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: 'empty file' }, { status: 400 });
  const mime = (file.type || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    return NextResponse.json({ error: `Unsupported file type: ${mime}` }, { status: 415 });
  }

  // KZ-017 P1 (pembetulan kzsec penemuan 1): bait dibaca SEKALI di sini, sebelum
  // keputusan keupayaan, supaya jenis MIME untuk keupayaan dihidu daripada
  // tandatangan bait sebenar. PERHATIAN: file.type ialah Content-Type bahagian
  // multipart yang DIKAWAL KLIEN, jadi ia TIDAK dipercayai untuk keputusan
  // keupayaan (ia kekal dipakai untuk senarai dibenarkan dan FileLu sahaja).
  // Imej raster sebenar (PNG/JPEG/GIF/WebP) tidak disekat oleh keupayaan; SVG
  // dan apa-apa yang mengisytihar image/* tetapi bukan raster perlu keupayaan
  // fail, diwarisi daripada pemilik kelas. Pemanggil sudah disahkan ahli kelas
  // oleh requireClassMember.
  const bytes = Buffer.from(await file.arrayBuffer());
  const imejRaster = imejRasterSebenar(bytes);
  if (!imejRaster && !capAwal.ok) {
    // R2-3: capAwal dikira sekali sebelum formData() dan diguna semula di
    // sini, bukan semakan kedua. Imej raster sebenar tidak perlu keupayaan.
    return NextResponse.json({ error: capAwal.message }, { status: capAwal.status });
  }

  // Kuota disemak SEBELUM bait dihantar ke FileLu (tiket V2-002b). Had fail
  // dan jumlah storan mengikut pelan berkesan pemilik kelas.
  const kuota = await reserveMuatNaik(auth.supa, params.classId, file.size, mime);
  if (kuota) return NextResponse.json(kuota.body, { status: kuota.status });

  const ext = extOf(file.name);
  let uploaded;
  try {
    uploaded = await fileluUpload(bytes, file.name || `upload.${ext || 'bin'}`, mime);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'FileLu upload failed' }, { status: 502 });
  }

  const rekod = await rekodMuatNaik(auth.supa, params.classId, uploaded.fileCode, uploaded.sizeBytes, mime, 'submission_board');
  if (rekod) {
    // Rekod gagal: padam fail daripada storan supaya tiada fail yatim
    // yang tidak dikira dalam kuota (kzsec 2/3).
    const padam = await fileluDelete(uploaded.fileCode);
    console.error(`[submission-upload-file] rekod gagal, padam=${padam} code=${uploaded.fileCode}`);
    return NextResponse.json(rekod.body, { status: rekod.status });
  }

  const fileluFileUrl = `/api/submission-boards/${params.huntId}/${params.classId}/file-redirect/${uploaded.fileCode}`;
  return NextResponse.json({
    fileCode: uploaded.fileCode,
    fileUrl: fileluShareUrl(uploaded.fileCode),
    fileluFileUrl,
    fileName: file.name,
    fileMimeType: mime,
    fileSizeBytes: file.size,
    fileExtension: ext,
  });
}
