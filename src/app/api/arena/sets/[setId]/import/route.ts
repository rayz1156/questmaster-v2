// Import soalan Arena daripada CSV templat, fail .xlsx atau teks Aiken.
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireSetOwner } from '@/lib/arena/server';
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
// Next.js men-cache panggilan Supabase di dalam route handler secara lalai.
export const fetchCache = 'force-no-store';

/** Panjang maksimum rentetan base64 yang diterima sebelum nyahkod (2 MB -> ~2.8 juta aksara). */
const BASE64_MAX_CHARS = Math.ceil((ARENA_XLSX_MAX_BYTES / 3) * 4) + 16;

/**
 * POST /api/arena/sets/[setId]/import
 * Badan: {format: 'xlsx'|'csv'|'aiken', content: string}.
 * Untuk xlsx, `content` ialah base64 fail. Balas: {created:n, skipped:n}.
 *
 * csv/xlsx: semua atau tiada; satu baris rosak memulangkan 400 dengan
 * {errors:[{row,message}]} dan TIADA soalan disisip.
 * aiken: blok rosak dilangkau (dikira dalam skipped), seperti Live Quiz.
 */
export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  // Hanya pemilik set (atau admin): set_id sentiasa dari parameter laluan
  // yang telah disahkan, bukan dari badan permintaan.
  const own = await requireSetOwner(req, params.setId);
  if (own.response || !own.set) return own.response ?? ralatJson('Not found', 404);

  const body = (await req.json().catch(() => null)) as { format?: unknown; content?: unknown } | null;
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
    // tolak sebelum nyahkod: rentetan base64 besar tidak pernah dibaca
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
      // mesej penghurai adalah English jelas (bukan butiran dalaman)
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

  // order_idx seterusnya selepas soalan terakhir (corak laluan questions)
  const { data: last } = await own.svc
    .from('qm_arena_questions')
    .select('order_idx')
    .eq('set_id', own.set.id)
    .order('order_idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  let next = last ? Number((last as { order_idx: number }).order_idx) + 1 : 0;
  const rows = questions.map((q) => ({
    set_id: own.set!.id,
    order_idx: q.order_idx ?? next++,
    type: q.type,
    prompt: q.prompt,
    data: q.data,
    hint: q.hint ?? null,
    points: q.points ?? 100,
    time_limit_sec: q.time_limit_sec ?? 30,
    origin: q.origin ?? 'manual',
  }));
  const { error } = await own.svc.from('qm_arena_questions').insert(rows);
  if (error) return ralatJson(error.message, 500);
  await own.svc.from('qm_arena_sets').update({ updated_at: new Date().toISOString() }).eq('id', own.set.id);

  // balasan hanya kiraan: tiada kunci jawapan keluar dari laluan ini
  return NextResponse.json({ created: rows.length, skipped });
}