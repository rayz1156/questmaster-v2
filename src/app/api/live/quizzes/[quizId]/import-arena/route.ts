/**
 * POST /api/live/quizzes/[quizId]/import-arena (KZ-045)
 *
 * Import soalan 6 jenis Arena (templat CSV/xlsx KZ-044 atau teks Aiken)
 * terus ke dalam bank Kuiz tunggal (qm_live_questions) melalui
 * arenaInputToLiveRow. Sama seperti import set Arena:
 *   - csv/xlsx: semua atau tiada; satu baris rosak memulangkan 400 dengan
 *     {errors:[{row,message}]} dan TIADA soalan disisip;
 *   - aiken: blok rosak dilangkau (dikira dalam skipped).
 *
 * Kebenaran: requireQuizHost (pemilik kuiz, pendidik kelas atau admin).
 * Badan: {format: 'xlsx'|'csv'|'aiken', content: string} (xlsx: base64).
 */
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireQuizHost } from '@/lib/live-quiz';
import { arenaInputToLiveRow } from '@/lib/kuiz-bank';
import {
  ARENA_IMPORT_MAX,
  ARENA_TEXT_MAX_CHARS,
  ARENA_XLSX_MAX_BYTES,
  parseArenaAiken,
  parseArenaCsv,
  parseArenaSheet,
  readXlsxRows,
} from '@/lib/arena/import';
import type { ArenaQuestionInput } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js men-cache panggilan Supabase di dalam route handler secara lalai;
// paksa setiap bacaan pergi ke pangkalan data.
export const fetchCache = 'force-no-store';

/** Panjang maksimum rentetan base64 sebelum nyahkod (2 MB -> ~2.8 juta aksara). */
const BASE64_MAX_CHARS = Math.ceil((ARENA_XLSX_MAX_BYTES / 3) * 4) + 16;

/** Baca badan permintaan sebagai teks; null jika melebihi `max` bait. */
async function bacaBerhad(req: NextRequest, max: number): Promise<string | null> {
  const panjang = Number(req.headers.get('content-length') || 0);
  if (panjang > max) return null;
  const reader = req.body?.getReader();
  if (!reader) return '';
  const cebisan: Buffer[] = [];
  let jumlah = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    jumlah += value.byteLength;
    if (jumlah > max) {
      await reader.cancel();
      return null;
    }
    cebisan.push(Buffer.from(value));
  }
  return Buffer.concat(cebisan).toString('utf8');
}

export async function POST(req: NextRequest, { params }: { params: { quizId: string } }) {
  const host = await requireQuizHost(req, params.quizId);
  if (host.response || !host.quiz) return host.response || ralatJson('Quiz not found.', 404);

  // KZ-044 kzsec SED-02: had saiz badan SEBELUM JSON dihurai.
  const teks = await bacaBerhad(req, BASE64_MAX_CHARS + 4096);
  if (teks === null) return ralatJson('That Excel file is too large. The limit is 2 MB.', 413);
  let body: { format?: unknown; content?: unknown } | null = null;
  try {
    body = JSON.parse(teks) as { format?: unknown; content?: unknown } | null;
  } catch {
    body = null;
  }
  if (!body || typeof body !== 'object') return ralatJson('Invalid body', 400);
  const format = body.format;
  if (typeof body.content !== 'string' || !body.content.trim()) {
    return ralatJson('The file content is required.', 400);
  }

  let questions: ArenaQuestionInput[];
  let skipped = 0;

  if (format === 'csv') {
    if (body.content.length > ARENA_TEXT_MAX_CHARS) {
      return ralatJson('That file is too large. The limit is about 500 KB.', 400);
    }
    const parsed = parseArenaCsv(body.content);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: 'Some rows are invalid.', errors: parsed.errors }, { status: 400 });
    }
    questions = parsed.questions;
  } else if (format === 'xlsx') {
    if (body.content.length > BASE64_MAX_CHARS) {
      return ralatJson('That Excel file is too large. The limit is 2 MB.', 400);
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(body.content, 'base64');
    } catch {
      return ralatJson('That Excel file is not valid base64.', 400);
    }
    if (buf.length > ARENA_XLSX_MAX_BYTES) {
      return ralatJson('That Excel file is too large. The limit is 2 MB.', 400);
    }
    let rows: string[][];
    try {
      rows = readXlsxRows(buf);
    } catch (e) {
      return ralatJson(e instanceof Error ? e.message : 'That Excel file could not be read.', 400);
    }
    const parsed = parseArenaSheet(rows);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ error: 'Some rows are invalid.', errors: parsed.errors }, { status: 400 });
    }
    questions = parsed.questions;
  } else if (format === 'aiken') {
    if (body.content.length > ARENA_TEXT_MAX_CHARS) {
      return ralatJson('That file is too large. The limit is about 500 KB.', 400);
    }
    const parsed = parseArenaAiken(body.content);
    if (parsed.questions.length === 0) {
      return NextResponse.json(
        { created: 0, skipped: parsed.skipped, error: 'No valid questions found.' },
        { status: 400 },
      );
    }
    questions = parsed.questions;
    skipped = parsed.skipped;
  } else {
    return ralatJson('format must be xlsx, csv or aiken.', 400);
  }

  if (questions.length === 0) {
    return NextResponse.json({ created: 0, skipped, error: 'No valid questions found.' }, { status: 400 });
  }
  if (questions.length > ARENA_IMPORT_MAX) {
    return ralatJson(`Import is limited to ${ARENA_IMPORT_MAX} questions per upload.`, 400);
  }

  // order_idx selepas soalan terakhir kuiz (semua jenis).
  const { data: last } = await host.supa
    .from('qm_live_questions')
    .select('order_idx')
    .eq('quiz_id', params.quizId)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = last ? Number((last as { order_idx: number }).order_idx) + 1 : 0;
  const rows = questions.map((q) => {
    const baris = arenaInputToLiveRow(q);
    return {
      quiz_id: params.quizId,
      order_idx: q.order_idx ?? next++,
      prompt: baris.prompt,
      options: baris.options,
      correct_key: baris.correct_key,
      qtype: baris.qtype,
      data: baris.data,
      hint: baris.hint,
      points: baris.points,
      time_limit_sec: baris.time_limit_sec,
    };
  });
  const { error } = await host.supa.from('qm_live_questions').insert(rows);
  if (error) return ralatJson(error.message, 500);

  // balasan hanya kiraan: tiada kunci jawapan keluar dari laluan ini
  return NextResponse.json({ created: rows.length, skipped });
}
