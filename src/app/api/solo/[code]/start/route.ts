import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import {
  ciptaLarian,
  ipPermintaan,
  kadarLebih,
  larianUjianSedia,
  muatKuizSolo,
  sambungLarianUjian,
  namaPemainSolo,
  semakMasukSolo,
  tamatkanGendala,
} from '@/lib/lumba-solo-api';
import { hashIp } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * POST /api/solo/[code]/start, badan { nickname? }.
 *
 * Semak masuk (corak join Arena), tamatkan larian tergendala milik pemain
 * sama (playing lebih 30 minit), kuat kuasa had kadar (maksimum 20 larian
 * dalam 10 minit), kemudian cipta larian baharu dengan soalan serasi yang
 * dikocok pelayan (maksimum 30). Token larian mentah dipulangkan sekali
 * sahaja; pangkalan data hanya menyimpan sha256 hex.
 *
 * KZ-UTT (mod ujian): log masuk wajib walaupun kuiz tanpa kelas, pendidik
 * mesti sudah membuka satu titik (T1, T2 atau T3), dan setiap pengguna hanya
 * ada SATU larian bagi setiap titik. Larian yang belum selesai disambung
 * (token baharu, soalan seterusnya); larian yang sudah selesai ditolak 409.
 */
export async function POST(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);

  const masuk = await semakMasukSolo(req, svc, kuiz);
  if (masuk.response) return masuk.response;

  if (kuiz.test_mode) {
    if (!masuk.user) {
      return ralatJson('Sign in to take this test.', 401, { code: 'LOGIN_REQUIRED' });
    }
    if (!kuiz.measure_point) {
      return ralatJson('This test is not open yet.', 409, { code: 'TEST_NOT_OPEN' });
    }
    const sedia = await larianUjianSedia(svc, kuiz.id, masuk.user.id, kuiz.measure_point);
    if (sedia) {
      if (sedia.status === 'finished') {
        return ralatJson('You have already completed this test.', 409, { code: 'TEST_DONE' });
      }
      const sambung = await sambungLarianUjian(svc, sedia);
      if (!sambung.larian || !sambung.token) {
        return ralatJson('Could not resume the test.', 503);
      }
      return NextResponse.json({
        runId: sambung.larian.id,
        runToken: sambung.token,
        totalQuestions: sambung.larian.question_ids.length,
        answered: sambung.larian.next_idx,
        resumed: true,
        testMode: true,
      });
    }
  }

  // KZ-UTT: mod ujian sentiasa memakai nama berdaftar pengguna (log masuk wajib).
  const nickname = await namaPemainSolo(
    svc,
    masuk.keputusan === 'ahli' || (kuiz.test_mode && masuk.user) ? 'ahli' : 'tetamu',
    masuk.user,
    body.nickname,
  );
  if (!nickname) return ralatJson('A player name must be 1 to 24 characters.', 400);

  const ipHash = hashIp(ipPermintaan(req));

  // Had kadar sebelum apa-apa ditulis.
  if (await kadarLebih(svc, kuiz.id, masuk.user?.id ?? null, ipHash)) {
    return ralatJson('Too many runs. Please wait a minute and try again.', 429);
  }

  // Larian playing yang tergendala milik pemain sama ditandakan expired
  // (mod ujian tidak perlu: larian ujian disambung, bukan diganti).
  if (!kuiz.test_mode) await tamatkanGendala(svc, kuiz.id, masuk.user?.id ?? null, ipHash);

  const cipta = await ciptaLarian(svc, kuiz, nickname, masuk.user?.id ?? null, ipHash, {
    testMode: kuiz.test_mode,
    measurePoint: kuiz.measure_point,
  });
  if (cipta.sebab === 'kurang') {
    return ralatJson('This quiz needs at least 3 multiple-choice questions.', 409);
  }
  if (!cipta.larian || !cipta.token) {
    return ralatJson('Could not start the run.', 503);
  }

  return NextResponse.json({
    runId: cipta.larian.id,
    runToken: cipta.token,
    totalQuestions: cipta.larian.question_ids.length,
    answered: 0,
    resumed: false,
    testMode: kuiz.test_mode,
  });
}