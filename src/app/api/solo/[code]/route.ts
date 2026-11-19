import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { getServiceSupabase } from '@/lib/supabase-route';
import {
  muatKuizSolo,
  soalanIdsSerasi,
  papanSolo,
  semakMasukSolo,
} from '@/lib/lumba-solo-api';
import { topengPapan } from '@/lib/lumba-solo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan fetch Supabase di dalam route handler secara
// lalai, yang membekukan keadaan sesi (corak laluan live). Paksa setiap
// bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/**
 * GET /api/solo/[code]: maklumat awam cabaran. TIADA kunci jawapan: hanya
 * tajuk kuiz, bilangan soalan serasi, perlu log masuk atau tidak, dan papan
 * top 10.
 *
 * Kuiz berkelas: nama pada papan ialah nama berdaftar pelajar, jadi nama
 * penuh hanya dipulangkan kepada ahli kelas (Bearer sah). Pemanggil lain
 * (tanpa log masuk, bukan ahli) menerima inisial sahaja.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const svc = getServiceSupabase();
  const kuiz = await muatKuizSolo(svc, params.code);
  if (!kuiz) return ralatJson('Challenge not found.', 404);

  const ids = await soalanIdsSerasi(svc, kuiz.id);
  let papan = await papanSolo(svc, kuiz.id);
  if (kuiz.class_id) {
    const masuk = await semakMasukSolo(req, svc, kuiz);
    if (masuk.response) papan = topengPapan(papan);
  }

  // Perlu log masuk bila kuiz berkelas: tetamu tidak dibenarkan langsung.
  const needLogin = !!kuiz.class_id;

  return NextResponse.json({
    title: kuiz.title,
    totalQuestions: ids.length,
    needLogin,
    leaderboard: papan,
  });
}