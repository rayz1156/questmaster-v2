/**
 * Kuizen Arena: penjana soalan AI (Claude Messages API melalui fetch biasa, tanpa SDK).
 * Hanya dipanggil di pelayan. TIDAK menyimpan ke pangkalan data.
 * Model lalai claude-sonnet-5-5; boleh ditukar dengan env ARENA_AI_MODEL.
 */
import { ARENA_QTYPES } from '@/lib/arena/types';
import type {
  ArenaQType,
  ArenaQuestionInput,
  MatchData,
  MultipleData,
  OrderData,
} from '@/lib/arena/types';
import { validateQuestion } from '@/lib/arena/validate';

export type ArenaAiLanguage = 'ms' | 'en';
export type ArenaAiDifficulty = 'mudah' | 'sederhana' | 'sukar';

export interface ArenaAiOptions {
  topic: string;
  sourceText?: string;
  count: number;
  types: ArenaQType[];
  language: ArenaAiLanguage;
  difficulty?: ArenaAiDifficulty;
}

export interface ArenaAiResult {
  questions: ArenaQuestionInput[];
  model: string;
  rejected: number;
}

const API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-5-5';
const TIMEOUT_MS = 60_000;
const MAX_SOURCE_CHARS = 12_000;
const MAX_TOPIC_CHARS = 300;
const DEFAULT_TYPES: ArenaQType[] = ['multiple', 'subjective', 'ox'];

// Bentuk respons minimum yang kita baca (fetch mentah, tiada jenis SDK)
interface ClaudeBlock {
  type: string;
  text?: string;
}
interface ClaudeResponse {
  model?: string;
  content?: ClaudeBlock[];
  stop_reason?: string | null;
  error?: { type?: string; message?: string };
}

// Spesifikasi bentuk `data` setiap jenis (ikut src/lib/arena/types.ts)
const TYPE_SPECS: Record<ArenaQType, string> = {
  multiple:
    '"multiple": data = {"choiceList":[{"key":"a","text":"...","isAnswer":true},{"key":"b","text":"...","isAnswer":false},{"key":"c","text":"...","isAnswer":false},{"key":"d","text":"...","isAnswer":false}]}. Exactly 4 choices, exactly ONE with isAnswer true. Distractors must be plausible but clearly wrong.',
  subjective:
    '"subjective" (short answer): data = {"answerList":[{"key":"1","text":"..."}],"ignoreCase":true,"ignoreSpaces":true}. 1-4 accepted answer variants (spelling variants, synonyms, with/without units). The expected answer must be short (1-4 words or a number).',
  ox: '"ox" (true/false): data = {"answer":"o"} when the statement in prompt is TRUE, {"answer":"x"} when it is FALSE. The prompt must be a single clear statement.',
  essay:
    '"essay": data = {"rubric":"...","maxLength":1000}. rubric = short marking guide for the teacher (key points expected). Graded manually.',
  match:
    '"match": data = {"leftItems":[{"key":"l1","text":"..."}],"rightItems":[{"key":"r1","text":"..."}],"answerPairs":[{"left":"l1","right":"r1"}]}. 3-4 items on EACH side (same count), every left item paired with exactly one right item, every item text <= 50 characters.',
  order:
    '"order" (sequencing): data = {"items":[{"key":"s1","text":"..."}]}. 3-5 items listed in the CORRECT order, each item text <= 50 characters. The prompt must say what the ordering criterion is.',
};

const DIFFICULTY_TEXT: Record<ArenaAiDifficulty, string> = {
  mudah: 'easy: recall of basic facts and definitions',
  sederhana: 'medium: understanding and simple application',
  sukar: 'hard: application, analysis and multi-step reasoning (still fair, never tricky)',
};

function clampCount(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 10;
  return Math.min(20, Math.max(1, v));
}

function cleanTypes(types: ArenaQType[] | undefined): ArenaQType[] {
  const valid = (types ?? []).filter((t): t is ArenaQType =>
    (ARENA_QTYPES as readonly string[]).includes(t),
  );
  const uniq = Array.from(new Set(valid));
  return uniq.length > 0 ? uniq : DEFAULT_TYPES;
}

/** Agih bilangan soalan sama rata merentas jenis (baki kepada jenis awal). */
function distribute(count: number, types: ArenaQType[]): { type: ArenaQType; n: number }[] {
  const used = types.slice(0, Math.min(types.length, count));
  const base = Math.floor(count / used.length);
  const extra = count % used.length;
  return used.map((type, i) => ({ type, n: base + (i < extra ? 1 : 0) }));
}

function systemPrompt(language: ArenaAiLanguage, hasSource: boolean): string {
  const lang =
    language === 'ms'
      ? 'Write every prompt, choice, answer, hint and rubric in standard Bahasa Melayu Malaysia following Dewan Bahasa dan Pustaka (DBP) spelling, grammar and terminology. NEVER use Bahasa Indonesia vocabulary or spelling (e.g. use "kerana" not "karena", "wang" not "uang", "kereta" not "mobil", "telefon" not "telepon", "universiti" not "universitas", "percuma" not "gratis", "bilik" not "kamar", "beg" not "tas", "polis" not "polisi", "sekolah rendah" not "SD").'
      : 'Write everything in clear, simple British English as used in Malaysian schools and universities.';
  return [
    "You are a Malaysian teacher's assistant who writes quiz questions for Kuizen Arena, a game-based classroom quiz.",
    lang,
    'Questions must be factually correct, curriculum-appropriate for Malaysian learners, clear and unambiguous. No trick questions, no double negatives, no "all of the above" or "none of the above". Each question must have one defensible answer.',
    hasSource
      ? 'The SOURCE TEXT supplied by the teacher is the ONLY source of facts. Do not add facts that are not in it. If it cannot support the requested number of questions, write fewer.'
      : 'Use only well-established facts.',
    'Reply with STRICT JSON only: a single object {"questions":[...]}. No markdown, no code fences, no comments, no text before or after the JSON.',
  ].join('\n');
}

function userPrompt(o: {
  topic: string;
  source: string;
  plan: { type: ArenaQType; n: number }[];
  difficulty?: ArenaAiDifficulty;
}): string {
  const total = o.plan.reduce((s, p) => s + p.n, 0);
  const lines: string[] = [
    `Topic: ${o.topic}`,
    `Difficulty: ${DIFFICULTY_TEXT[o.difficulty ?? 'sederhana']}`,
    `Write exactly ${total} questions: ${o.plan.map((p) => `${p.n} x "${p.type}"`).join(', ')}.`,
    '',
    'Each item in "questions" has this shape:',
    '{"type":"<type>","prompt":"<question text, max 300 characters>","data":{...},"hint":null or {"type":"text","value":"<short hint, max 120 characters>"},"points":100,"time_limit_sec":<20-90>}',
    '',
    'The "data" shape for each type:',
    ...o.plan.map((p) => `- ${TYPE_SPECS[p.type]}`),
    '',
    'Rules: prompt <= 300 characters; match/order item text <= 50 characters; keys unique within a question; do not reveal the answer in the prompt or hint.',
  ];
  if (o.source) {
    lines.push('', 'SOURCE TEXT (the only source of facts):', '<source>', o.source, '</source>');
  }
  return lines.join('\n');
}

/** Cari objek JSON pertama dalam teks (buang pagar kod). */
function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = (fence[1] ?? '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* cuba tatasusunan di bawah */
    }
  }
  const aStart = t.indexOf('[');
  const aEnd = t.lastIndexOf(']');
  if (aStart >= 0 && aEnd > aStart) return JSON.parse(t.slice(aStart, aEnd + 1));
  throw new Error('AI response contained no JSON');
}

function randKeys(n: number): string[] {
  const keys = new Set<string>();
  while (keys.size < n) keys.add(Math.random().toString(36).slice(2, 7));
  return Array.from(keys);
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/** Tukar key supaya tidak membocorkan jawapan (cth. kunci order s1,s2,s3 atau padanan l1->r1). */
function rekey(q: ArenaQuestionInput): ArenaQuestionInput {
  if (q.type === 'multiple') {
    const d = q.data as MultipleData;
    const letters = 'abcdefgh';
    const choiceList = shuffle(d.choiceList).map((c, i) => ({ ...c, key: letters[i] ?? `k${i}` }));
    return { ...q, data: { ...d, choiceList } };
  }
  if (q.type === 'order') {
    const d = q.data as OrderData;
    const keys = randKeys(d.items.length);
    return { ...q, data: { ...d, items: d.items.map((it, i) => ({ ...it, key: keys[i] ?? it.key })) } };
  }
  if (q.type === 'match') {
    const d = q.data as MatchData;
    const lk = randKeys(d.leftItems.length);
    const rk = randKeys(d.rightItems.length);
    const lMap = new Map<string, string>(d.leftItems.map((it, i) => [it.key, lk[i] ?? it.key]));
    const rMap = new Map<string, string>(d.rightItems.map((it, i) => [it.key, rk[i] ?? it.key]));
    return {
      ...q,
      data: {
        leftItems: d.leftItems.map((it) => ({ ...it, key: lMap.get(it.key) ?? it.key })),
        rightItems: shuffle(d.rightItems.map((it) => ({ ...it, key: rMap.get(it.key) ?? it.key }))),
        answerPairs: d.answerPairs.map((p) => ({
          left: lMap.get(p.left) ?? p.left,
          right: rMap.get(p.right) ?? p.right,
        })),
      },
    };
  }
  return q;
}

// Ciri API yang hanya disokong model tertentu
const EFFORT_RE = /^claude-(opus-4-[5-8]|opus-5|sonnet-4-6|sonnet-5|haiku-5|fable-5|mythos-5)/;
const FALLBACK_RE = /^claude-(opus-5|sonnet-5-5|fable-5-1)/;

async function callClaude(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  withFallback: boolean,
  signal: AbortSignal,
): Promise<{ status: number; payload: ClaudeResponse | null; raw: string }> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
  };
  // effort rendah: tugasan mudah, kekal di bawah had masa 60 s
  if (EFFORT_RE.test(model)) body.output_config = { effort: 'low' };
  if (withFallback) body.fallbacks = 'default';
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
  };
  if (withFallback) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  const res = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  const raw = await res.text();
  let payload: ClaudeResponse | null = null;
  try {
    payload = JSON.parse(raw) as ClaudeResponse;
  } catch {
    payload = null;
  }
  return { status: res.status, payload, raw };
}

export async function generateArenaQuestions(opts: ArenaAiOptions): Promise<ArenaAiResult> {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) throw new Error('AI_NOT_CONFIGURED');
  const model = (process.env.ARENA_AI_MODEL ?? '').trim() || DEFAULT_MODEL;

  const count = clampCount(opts.count);
  const types = cleanTypes(opts.types);
  const plan = distribute(count, types);
  const language: ArenaAiLanguage = opts.language === 'en' ? 'en' : 'ms';
  const topic = (opts.topic ?? '').trim().slice(0, MAX_TOPIC_CHARS);
  const source = (opts.sourceText ?? '')
    .replace(/<\/?source>/gi, '')
    .trim()
    .slice(0, MAX_SOURCE_CHARS);

  const system = systemPrompt(language, source.length > 0);
  const user = userPrompt({ topic, source, plan, difficulty: opts.difficulty });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let result: { status: number; payload: ClaudeResponse | null; raw: string };
  try {
    const withFallback = FALLBACK_RE.test(model);
    result = await callClaude(apiKey, model, system, user, withFallback, controller.signal);
    // Jika akaun menolak parameter fallbacks, cuba sekali lagi tanpanya
    if (withFallback && result.status === 400 && /fallback/i.test(result.raw)) {
      result = await callClaude(apiKey, model, system, user, false, controller.signal);
    }
  } catch (e) {
    if (controller.signal.aborted) throw new Error('AI request timed out after 60 s');
    throw e;
  } finally {
    clearTimeout(timer);
  }

  const { status, payload, raw } = result;
  if (status < 200 || status >= 300 || !payload) {
    const msg = payload?.error?.message ?? raw.slice(0, 300);
    throw new Error(`Anthropic API error ${status}: ${msg}`);
  }
  if (payload.stop_reason === 'refusal') throw new Error('AI declined the request (refusal)');

  const text = (payload.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text.trim()) throw new Error(`AI returned no text (stop_reason ${payload.stop_reason ?? 'unknown'})`);

  const parsed = extractJson(text);
  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { questions?: unknown }).questions)
      ? ((parsed as { questions: unknown[] }).questions)
      : [];
  if (items.length === 0) throw new Error('AI response had no questions array');

  const wanted = new Set<ArenaQType>(types);
  const questions: ArenaQuestionInput[] = [];
  let rejected = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      rejected++;
      continue;
    }
    const v = validateQuestion({ ...(item as Record<string, unknown>), origin: 'ai' });
    if (!v.ok || !wanted.has(v.value.type)) {
      rejected++;
      continue;
    }
    questions.push(rekey({ ...v.value, origin: 'ai' }));
  }

  return { questions: questions.slice(0, count), model: payload.model ?? model, rejected };
}
