/**
 * Cadangan item LNA oleh AI (KZ-036).
 *
 * GET  /api/classes/[id]/lna/suggest: sama ada penyedia qwen sedia
 *      ({ available: true|false }). Guru kelas sahaja.
 * POST /api/classes/[id]/lna/suggest: teks sinopsis kursus atau senarai
 *      CLO, balas senarai item cadangan untuk senarai LNA. Guru kelas
 *      sahaja; guru masih mesti menyemak dan menekan "Cipta LNA" sendiri
 *      (tiada LNA dicipta di sini).
 *
 * Keselamatan (kzsec): bukan ahli menerima 404 generik (corak KZ-035);
 * had kadar 5 seminit menghalang penyalahgunaan kos; kunci API tidak
 * pernah dilog atau dipulangkan; teks pengguna tidak dilog.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { perananKelas, sahUuid } from '@/lib/lnaAkses';
import { bacaJsonKecil } from '@/lib/bilikAi';
import { dalamHad } from '@/lib/hadKadar';
import { penyediaSedia, dapatkanPenyedia } from '@/lib/ai/penyedia';
import { PROMPT_CADANGAN_LNA, bersihkanCadangan } from '@/lib/lnaCadangan';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/** Had aksara teks pengguna. */
const TEKS_MIN = 30;
const TEKS_MAKS = 4000;

/** Tamat masa panggilan penyedia (ms). */
const TAMAT_MASA_MS = 45_000;

/** Had token keluaran model. */
const MAX_TOKENS = 900;

/** Model tetap untuk cadangan LNA (keputusan Boss, tiket KZ-036). */
const MODEL_CADANGAN = 'qwen3.7-plus';

/** 404 generik untuk bukan ahli: kewujudan kelas tidak terbongkar. */
function tidakDitemui(): NextResponse {
  return ralatJson('Not found.', 404);
}

/** Semakan bersama kedua-dua kaedah: log masuk, UUID, guru kelas. */
async function semakGuru(
  req: NextRequest,
  classId: string,
): Promise<{ user: NonNullable<Awaited<ReturnType<typeof requireUser>>['user']>; response: null } | { user: null; response: NextResponse }> {
  const auth = await requireUser(req);
  if (auth.response) return { user: null, response: auth.response };
  const user = auth.user!;
  if (!sahUuid(classId)) {
    return { user: null, response: ralatJson('Not a valid class id.', 400) };
  }
  const supa = getServiceSupabase();
  const role = await perananKelas(supa, user.id, classId);
  if (role !== 'teacher') {
    return { user: null, response: tidakDitemui() };
  }
  return { user, response: null };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const semak = await semakGuru(req, String(params.id ?? ''));
  if (semak.response) return semak.response;

  // Tiada panggilan penyedia di sini: hanya semak kunci env.
  return NextResponse.json({ available: penyediaSedia('qwen') });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const classId = String(params.id ?? '');
  const semak = await semakGuru(req, classId);
  if (semak.response) return semak.response;
  const user = semak.user;

  // Had kadar dahulu: kos model dikuasakan sebelum badan dibaca.
  if (!dalamHad('lna-cadang:' + user.id, 5)) {
    return ralatJson('Too many requests. Please try again shortly.', 429);
  }

  const badan = await bacaJsonKecil(req);
  if (!badan.ok) return badan.response;
  const teks = badan.body.text;
  if (typeof teks !== 'string' || teks.length < TEKS_MIN || teks.length > TEKS_MAKS) {
    return ralatJson('The text must be 30 to 4,000 characters.', 400);
  }

  if (!penyediaSedia('qwen')) {
    return ralatJson('AI is not configured. Type your own list.', 503);
  }
  const penyedia = dapatkanPenyedia('qwen');
  if (!penyedia) {
    return ralatJson('AI is not configured. Type your own list.', 503);
  }

  const pemutus = new AbortController();
  const pemasa = setTimeout(() => pemutus.abort(), TAMAT_MASA_MS);

  try {
    let jawapan = '';
    for await (const peristiwa of penyedia.streamChat({
      model: MODEL_CADANGAN,
      messages: [
        { role: 'system', content: PROMPT_CADANGAN_LNA },
        { role: 'user', content: teks },
      ],
      maxTokens: MAX_TOKENS,
      signal: pemutus.signal,
    })) {
      if (typeof peristiwa.delta === 'string') jawapan += peristiwa.delta;
    }
    clearTimeout(pemasa);

    const { items, amaran } = bersihkanCadangan(jawapan);
    if (items.length < 3) {
      return ralatJson('AI did not give a valid suggestion. Try again or type it yourself.', 502);
    }
    return NextResponse.json({ items, amaran });
  } catch (e) {
    clearTimeout(pemasa);
    // Tiada teks pengguna dalam log; hanya jenis ralat dan mesej penyedia.
    console.error('[lna-cadang] panggilan penyedia gagal:', e instanceof Error ? e.message : e);
    return ralatJson('AI could not be reached. Try again or type it yourself.', 502);
  }
}
