/**
 * POST /api/arena/sets/[setId]/ai-generate
 * Jana soalan dengan Claude untuk pemilik set. TIDAK menyimpan ke pangkalan data;
 * UI pendidik menyemak dahulu, kemudian POST ke /api/arena/sets/[setId]/questions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { requireSetOwner } from '@/lib/arena/server';
import { generateArenaQuestions } from '@/lib/arena/ai';
import type { ArenaAiDifficulty, ArenaAiLanguage } from '@/lib/arena/ai';
import { ARENA_QTYPES } from '@/lib/arena/types';
import type { ArenaQType } from '@/lib/arena/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const DIFFICULTIES: readonly ArenaAiDifficulty[] = ['mudah', 'sederhana', 'sukar'];

function isQType(v: unknown): v is ArenaQType {
  return typeof v === 'string' && (ARENA_QTYPES as readonly string[]).includes(v);
}

export async function POST(req: NextRequest, { params }: { params: { setId: string } }) {
  const own = await requireSetOwner(req, params.setId);
  if (own.response) return own.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return ralatJson('Invalid JSON body', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return ralatJson('Invalid JSON body', 400);
  }
  const b = body as Record<string, unknown>;

  // topik & teks sumber
  if (b.topic !== undefined && typeof b.topic !== 'string') return ralatJson('topic must be a string', 400);
  if (b.sourceText !== undefined && b.sourceText !== null && typeof b.sourceText !== 'string') {
    return ralatJson('sourceText must be a string', 400);
  }
  const sourceText = typeof b.sourceText === 'string' ? b.sourceText.trim() : '';
  let topic = typeof b.topic === 'string' ? b.topic.trim() : '';
  if (!topic && sourceText) topic = own.set?.title ?? 'Teks sumber';
  if (!topic) return ralatJson('topic is required', 400);
  if (topic.length > 300) return ralatJson('topic is too long (max 300 characters)', 400);
  if (sourceText.length > 200_000) return ralatJson('sourceText is too long', 400);

  // bilangan 1..20
  let count = 10;
  if (b.count !== undefined && b.count !== null) {
    const n = typeof b.count === 'string' ? Number(b.count) : b.count;
    if (typeof n !== 'number' || !Number.isFinite(n)) return ralatJson('count must be a number between 1 and 20', 400);
    count = Math.min(20, Math.max(1, Math.floor(n)));
  }

  // jenis soalan
  let types: ArenaQType[] = [];
  if (b.types !== undefined && b.types !== null) {
    if (!Array.isArray(b.types)) return ralatJson('types must be an array', 400);
    for (const t of b.types as unknown[]) {
      if (!isQType(t)) return ralatJson(`Invalid question type: ${String(t)}`, 400);
      if (!types.includes(t)) types.push(t);
    }
  }
  if (types.length === 0) types = ['multiple', 'subjective', 'ox'];

  // bahasa & tahap kesukaran
  let language: ArenaAiLanguage = 'ms';
  if (b.language !== undefined && b.language !== null) {
    if (b.language !== 'ms' && b.language !== 'en') return ralatJson("language must be 'ms' or 'en'", 400);
    language = b.language === 'en' ? 'en' : 'ms';
  }
  let difficulty: ArenaAiDifficulty | undefined;
  if (b.difficulty !== undefined && b.difficulty !== null && b.difficulty !== '') {
    const d = DIFFICULTIES.find((x) => x === b.difficulty);
    if (!d) return ralatJson("difficulty must be 'mudah', 'sederhana' or 'sukar'", 400);
    difficulty = d;
  }

  try {
    const out = await generateArenaQuestions({
      topic,
      sourceText: sourceText || undefined,
      count,
      types,
      language,
      difficulty,
    });
    return NextResponse.json({ questions: out.questions, model: out.model, rejected: out.rejected });
  } catch (e) {
    if (e instanceof Error && e.message === 'AI_NOT_CONFIGURED') {
      return ralatJson('AI generation not configured: set ANTHROPIC_API_KEY', 503);
    }
    console.error('[arena ai-generate] gagal:', e instanceof Error ? e.message : e);
    return ralatJson('AI generation failed', 502);
  }
}
