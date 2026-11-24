/**
 * GET/POST /api/nama/[token] (KZ-E): laluan awam pautan kemas kini nama.
 *
 * Tanpa log masuk. Token 256 bit dalam URL ialah kebenarannya; hanya hash
 * SHA-256 disimpan. Had kadar mengikut IP dan maksimum 5 penghantaran gagal
 * bagi setiap token (selepas itu token dibatalkan). Respons tidak pernah
 * memaparkan e-mel atau maklumat peserta lain. Mesej dalam Bahasa Melayu
 * kerana halaman ini untuk peserta.
 *
 * Bendera ui_hide_certificates tidak menyekat laluan ini.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { dalamHad, bakiSaat } from '@/lib/hadKadar';
import { ipPermintaan } from '@/lib/lumba-solo-api';
import { hashIp, hashToken, sahkanNamaPenuh, tokenBerbentukSah } from '@/lib/sijil/namaPenuh';
import { cariToken, maklumatHalaman, selepasPengesahan, statusBerkesan } from '@/lib/sijil/pengesahanNama';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MESEJ_STATUS: Record<string, string> = {
  used: 'Pautan ini sudah digunakan. Nama anda telah dikemas kini. Jika anda perlu membuat pembetulan lagi, sila hubungi pendidik anda.',
  expired: 'Pautan ini telah tamat tempoh. Sila hubungi pendidik anda untuk mendapatkan pautan baharu.',
  revoked: 'Pautan ini tidak lagi sah. Sila hubungi pendidik anda untuk mendapatkan pautan baharu.',
  not_found: 'Pautan ini tidak sah. Pastikan anda membuka pautan penuh daripada e-mel, atau hubungi pendidik anda.',
};

function jawab(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

function hadIp(req: NextRequest, jenis: string, maks: number): NextResponse | null {
  const kunci = `nama-${jenis}:${ipPermintaan(req)}`;
  if (dalamHad(kunci, maks)) return null;
  const saat = bakiSaat(kunci);
  return jawab({ error: 'Terlalu banyak cubaan. Sila tunggu sebentar dan cuba lagi.', retry_after_seconds: saat }, 429);
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const had = hadIp(req, 'baca', 30);
  if (had) return had;
  if (!tokenBerbentukSah(params.token)) return jawab({ status: 'not_found', message: MESEJ_STATUS.not_found }, 404);
  const svc = getServiceSupabase();
  const t = await cariToken(svc, params.token);
  if (!t) return jawab({ status: 'not_found', message: MESEJ_STATUS.not_found }, 404);
  const status = statusBerkesan(t);
  if (status !== 'pending') return jawab({ status, message: MESEJ_STATUS[status] });
  return jawab({ status, ...(await maklumatHalaman(svc, t)) });
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const had = hadIp(req, 'hantar', 10);
  if (had) return had;
  if (!tokenBerbentukSah(params.token)) return jawab({ status: 'not_found', error: MESEJ_STATUS.not_found }, 404);
  const svc = getServiceSupabase();
  const t = await cariToken(svc, params.token);
  if (!t) return jawab({ status: 'not_found', error: MESEJ_STATUS.not_found }, 404);
  const status = statusBerkesan(t);
  if (status !== 'pending') return jawab({ status, error: MESEJ_STATUS[status] }, 409);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.confirmed !== true) {
    return jawab({ error: 'Sila tandakan kotak pengesahan bahawa nama ini betul.' }, 400);
  }
  const semak = sahkanNamaPenuh(body.full_name);
  if (!semak.ok) {
    const { data: cubaan } = await svc.rpc('qm_name_token_failed_attempt', { p_token_hash: hashToken(params.token) });
    const baki = Math.max(0, 5 - Number(cubaan ?? 5));
    if (baki === 0) return jawab({ status: 'revoked', error: `${semak.mesej} ${MESEJ_STATUS.revoked}` }, 400);
    return jawab({ error: semak.mesej, attempts_left: baki }, 400);
  }

  const { data, error } = await svc.rpc('qm_confirm_name_token', {
    p_token_hash: hashToken(params.token),
    p_name: semak.nama,
    p_ip_hash: hashIp(ipPermintaan(req)),
  });
  if (error) {
    const m = error.message || '';
    const s = m.includes('TOKEN_USED') ? 'used' : m.includes('TOKEN_EXPIRED') ? 'expired' : m.includes('TOKEN_') ? 'revoked' : null;
    if (s) return jawab({ status: s, error: MESEJ_STATUS[s] }, 409);
    console.error('[nama] pengesahan gagal:', m);
    return jawab({ error: 'Nama tidak dapat disimpan sekarang. Sila cuba lagi sebentar.' }, 500);
  }
  const hasil = Array.isArray(data) ? data[0] : data;
  // Jana/keluarkan sijil dan masuk baris gilir; e-mel dihantar oleh pekerja.
  await selepasPengesahan(svc, hasil).catch((e) => console.error('[nama] selepas pengesahan gagal:', e));
  return jawab({
    status: 'used',
    new_name: hasil?.new_name,
    message: 'Terima kasih. Sijil dengan nama penuh anda akan dihantar ke e-mel anda dalam beberapa minit.',
  });
}
