/**
 * Pembantu kongsi untuk laluan hos Kuiz Langsung (src/app/api/live/).
 *
 * Keselamatan: semua tulisan hos mesti melalui semakan pendidik di sini.
 * Kunci jawapan (correct_key) TIDAK PERNAH dilog. Laluan peserta berada di
 * src/app/api/live/play/ dan tidak menggunakan fail ini.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { requireUser } from '@/lib/supabase-route';

type SupaClient = Awaited<ReturnType<typeof requireUser>>['supa'];

export interface LiveHostAuth {
  user: User;
  supa: SupaClient;
  /** Jika tidak null, pulangkan terus sebagai balasan. */
  response: NextResponse | null;
}

const ADMIN_ROLES = ['admin', 'superadmin'];

export interface LiveQuizRow {
  id: string; class_id: string | null; owner_id: string;
  title: string; description: string | null; created_at: string;
}
export interface LiveQuestionRow {
  id: string; quiz_id: string; order_idx: number; prompt: string;
  options: { key: string; text: string }[]; correct_key: string;
  points: number; time_limit_sec: number; use_countdown?: boolean;
}

/* ============================================================
 * Pemarkahan
 * ============================================================
 * Setanding Kahoot. Kahoot memberi
 *     mata = bulat( (1 - (masa / had) / 2) * mata_penuh )
 * jadi betul serta-merta dapat penuh dan betul pada saat terakhir dapat
 * separuh. Kahoot juga memberi mata penuh untuk jawapan betul di bawah 0.5
 * saat, supaya kelewatan rangkaian tidak menghukum pemain.
 *
 * Kuizen menambah satu perkara yang Kahoot tiada dalam permainan langsung:
 * pendidik boleh mematikan kira detik. Bila dimatikan, tiada had masa, tetapi
 * mata masih menurun mengikut masa melalui lengkung susut lembut
 *     mata = mata_penuh * (0.5 + 0.5 * rentak / (rentak + masa))
 * yang menghampiri 50% tanpa pernah rata sepenuhnya. Jadi dua pemain yang
 * menjawab betul pada saat ke-30 dan saat ke-90 tetap tidak sama markah.
 */

/** Jawapan betul di bawah tempoh ini sentiasa dapat mata penuh (paras Kahoot). */
export const SCORE_INSTANT_MS = 500;
/** Kelonggaran rangkaian selepas kira detik tamat sebelum mata jadi sifar. */
export const SCORE_LATE_GRACE_MS = 1500;
/** Nisbah terendah bagi jawapan betul yang paling lambat. */
export const SCORE_FLOOR_RATIO = 0.5;

export interface ScoreInput {
  isCorrect: boolean;
  /** Masa dari soalan dibuka, dikira di pelayan. */
  msTaken: number;
  /** Mata penuh soalan. */
  points: number;
  /** Had masa bila kira detik hidup; rentak rujukan bila dimatikan. */
  timeLimitSec: number;
  useCountdown: boolean;
}

/** Kira mata satu jawapan. `late` bermakna kira detik sudah tamat. */
export function scoreAnswer(input: ScoreInput): { pointsAwarded: number; late: boolean } {
  if (!input.isCorrect) return { pointsAwarded: 0, late: false };

  const base = Math.max(1, Math.floor(input.points));
  const t = Math.max(0, input.msTaken);
  const windowMs = Math.max(1, Math.floor(input.timeLimitSec)) * 1000;

  if (input.useCountdown && t > windowMs + SCORE_LATE_GRACE_MS) {
    return { pointsAwarded: 0, late: true };
  }
  if (t <= SCORE_INSTANT_MS) return { pointsAwarded: base, late: false };

  const ratio = input.useCountdown
    ? Math.max(0, 1 - t / windowMs)
    : windowMs / (windowMs + t);

  const share = SCORE_FLOOR_RATIO + (1 - SCORE_FLOOR_RATIO) * ratio;
  return { pointsAwarded: Math.round(base * share), late: false };
}
export interface LiveSessionRow {
  id: string; quiz_id: string; host_id: string; code: string; status: string;
  current_index: number; question_started_at: string | null;
  max_players?: number; created_at?: string; ended_at?: string | null;
}
interface ClassRef { id: string; owner_id: string }
interface ProfileRef { role: string; suspended: boolean | null }

/**
 * Sahkan pengguna ialah pendidik kelas (pemilik atau ahli) atau admin.
 * Corak sama dengan requireClassOwner/requireClassMember dalam
 * src/lib/supabase-route.ts, tambah semakan peranan admin.
 */
export async function requireLiveHost(
  req: NextRequest | Request | null,
  classId: string,
): Promise<LiveHostAuth> {
  const auth = await requireUser(req);
  if (auth.response || !auth.user) return { user: null as unknown as User, supa: auth.supa, response: auth.response || null };
  const userId = auth.user.id;

  const { data: klass } = (await auth.supa
    .from('qm_classes')
    .select('id, owner_id')
    .eq('id', classId)
    .maybeSingle()) as { data: ClassRef | null };

  if (klass && klass.owner_id === userId) {
    return { user: auth.user, supa: auth.supa, response: null };
  }

  if (klass) {
    // PENTING: pendidik kelas berada dalam qm_class_educators dengan lajur
    // educator_id. qm_class_members ialah jadual PESERTA. Menyemak
    // qm_class_members di sini akan memberi setiap pelajar hak mengawal
    // kuiz langsung. Jemputan yang belum diterima juga tidak memberi hak.
    const { data: educator } = await auth.supa
      .from('qm_class_educators')
      .select('educator_id, accepted_at')
      .eq('class_id', classId)
      .eq('educator_id', userId)
      .not('accepted_at', 'is', null)
      .maybeSingle();
    if (educator) return { user: auth.user, supa: auth.supa, response: null };
  }

  const { data: profile } = await auth.supa
    .from('qm_profiles')
    .select('role, suspended')
    .eq('id', userId)
    .maybeSingle();
  const me = profile as ProfileRef | null;
  if (me && !me.suspended && ADMIN_ROLES.includes(me.role)) {
    return { user: auth.user, supa: auth.supa, response: null };
  }

  return {
    user: null as unknown as User,
    supa: auth.supa,
    response: NextResponse.json({ error: 'You are not an educator of this class.' }, { status: 403 }),
  };
}

/**
 * Semak peranan admin dalam qm_profiles. Dibetulkan sebelum ini: JANGAN
 * sekali-kali semak qm_class_members; itu jadual PESERTA dan menyemaknya
 * memberi setiap pelajar hak mengawal sesi kuiz.
 */
export async function isLiveAdmin(supa: SupaClient, userId: string): Promise<boolean> {
  const { data: profile } = await supa
    .from('qm_profiles')
    .select('role, suspended')
    .eq('id', userId)
    .maybeSingle();
  const me = profile as ProfileRef | null;
  return !!(me && !me.suspended && ADMIN_ROLES.includes(me.role));
}

/** Muat kuiz dan sahkan pemanggil ialah hos kuiz itu (Fasa 2, class_id nullable):
 *  1. pemilik kuiz sentiasa dibenarkan (jalan utama untuk kuiz peribadi);
 *  2. jika class_id tidak null, pendidik kelas itu (qm_class_educators,
 *     educator_id + accepted_at tidak null) dibenarkan;
 *  3. jika tidak, admin;
 *  4. jika tidak, tolak 403. */
export async function requireQuizHost(
  req: NextRequest | Request | null,
  quizId: string,
): Promise<LiveHostAuth & { quiz: LiveQuizRow | null }> {
  const auth = await requireUser(req);
  if (auth.response || !auth.user) {
    return { user: null as unknown as User, supa: auth.supa, quiz: null, response: auth.response || null };
  }
  const userId = auth.user.id;

  const { data: quiz } = (await auth.supa
    .from('qm_live_quizzes')
    .select('id, class_id, owner_id, title, description, created_at')
    .eq('id', quizId)
    .maybeSingle()) as { data: LiveQuizRow | null };
  if (!quiz) {
    return {
      user: null as unknown as User,
      supa: auth.supa,
      quiz: null,
      response: NextResponse.json({ error: 'Quiz not found.' }, { status: 404 }),
    };
  }

  // 1. Pemilik kuiz — dibenarkan tanpa syarat (kuiz peribadi dan berkongsi).
  if (quiz.owner_id === userId) {
    return { user: auth.user, supa: auth.supa, quiz, response: null };
  }

  // 2. Pendidik kelas, hanya apabila kuiz berkongsi dengan sesuatu kelas.
  if (quiz.class_id) {
    const { data: educator } = await auth.supa
      .from('qm_class_educators')
      .select('educator_id, accepted_at')
      .eq('class_id', quiz.class_id)
      .eq('educator_id', userId)
      .not('accepted_at', 'is', null)
      .maybeSingle();
    if (educator) return { user: auth.user, supa: auth.supa, quiz, response: null };
  }

  // 3. Admin.
  if (await isLiveAdmin(auth.supa, userId)) {
    return { user: auth.user, supa: auth.supa, quiz, response: null };
  }

  // 4. Tolak.
  return {
    user: null as unknown as User,
    supa: auth.supa,
    quiz: null,
    response: NextResponse.json({ error: 'You are not an educator of this class.' }, { status: 403 }),
  };
}

/** Muat soalan dan sahkan pemanggil pendidik kelas kuiz induknya. */
export async function requireQuestionHost(
  req: NextRequest | Request | null,
  questionId: string,
): Promise<LiveHostAuth & { question: LiveQuestionRow | null }> {
  const auth = await requireUser(req);
  if (auth.response) {
    return { user: null as unknown as User, supa: auth.supa, question: null, response: auth.response };
  }

  const { data: question } = (await auth.supa
    .from('qm_live_questions')
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown')
    .eq('id', questionId)
    .maybeSingle()) as { data: LiveQuestionRow | null };
  if (!question) {
    return {
      user: null as unknown as User,
      supa: auth.supa,
      question: null,
      response: NextResponse.json({ error: 'Question not found.' }, { status: 404 }),
    };
  }

  const host = await requireQuizHost(req, question.quiz_id);
  if (host.response) return { ...host, question: null };
  return { ...host, question };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // tiada 0, O, 1, I

/**
 * Jana kod sesi 6 aksara huruf besar tanpa 0, O, 1, I. Cuba semula jika kod
 * bertindih dengan sesi yang belum tamat (status != 'ended').
 */
export async function generateSessionCode(supa: SupaClient): Promise<string | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    const { data } = await supa
      .from('qm_live_sessions')
      .select('id')
      .eq('code', code)
      .neq('status', 'ended')
      .maybeSingle();
    if (!data) return code;
  }
  return null;
}

/** Sahkan struktur pilihan soalan: array [{"key":"A","text":"..."}], 2-6 item. */
export function validateOptions(options: unknown): { ok: boolean; error?: string; keys?: string[] } {
  if (!Array.isArray(options) || options.length < 2 || options.length > 6) {
    return { ok: false, error: 'A question must have between 2 and 6 options.' };
  }
  const keys: string[] = [];
  for (const opt of options) {
    if (!opt || typeof opt !== 'object') return { ok: false, error: 'Invalid option.' };
    const o = opt as { key?: unknown; text?: unknown };
    if (typeof o.key !== 'string' || !o.key.trim() || typeof o.text !== 'string' || !o.text.trim()) {
      return { ok: false, error: 'Every option needs both key and text.' };
    }
    keys.push(o.key);
  }
  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: 'Option keys must be unique.' };
  }
  return { ok: true, keys };
}

export type ParsedAikenQuestion = {
  prompt: string;
  options: { key: string; text: string }[];
  correct_key: string;
};

/**
 * Pecah kandungan Aiken ikut baris kosong. Baris pertama ialah soalan (boleh
 * berbilang baris sehingga jumpa baris pilihan pertama). Pilihan bermula
 * dengan huruf diikuti `.` atau `)`. `ANSWER:` menentukan kunci betul.
 * Blok rosak dilangkau (dikira dalam skipped), import tidak gagalkan.
 */
export function parseAiken(content: string): { questions: ParsedAikenQuestion[]; skipped: number } {
  const questions: ParsedAikenQuestion[] = [];
  let skipped = 0;

  const blocks = content
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 3) { skipped++; continue; }

    const optionRe = /^([A-Za-z])[.)]\s+(.+)$/;
    const answerRe = /^ANSWER:\s*([A-Za-z])\s*$/i;

    const optionLines: { key: string; text: string }[] = [];
    const promptLines: string[] = [];
    let correctKey: string | null = null;
    let hasJunkAfterOptions = false;

    for (const line of lines) {
      const ans = answerRe.exec(line);
      if (ans) { correctKey = ans[1].toUpperCase(); continue; }
      const opt = optionRe.exec(line);
      if (opt) {
        optionLines.push({ key: opt[1].toUpperCase(), text: opt[2].trim() });
        continue;
      }
      if (optionLines.length === 0) promptLines.push(line);
      // sebarang baris lain selepas pilihan bermula => blok rosak
      else { hasJunkAfterOptions = true; break; }
    }

    if (hasJunkAfterOptions) { skipped++; continue; }
    const prompt = promptLines.join(' ').trim();
    if (!prompt || optionLines.length < 2 || optionLines.length > 6 || !correctKey) {
      skipped++;
      continue;
    }
    if (!optionLines.some((o) => o.key === correctKey)) { skipped++; continue; }

    questions.push({ prompt, options: optionLines, correct_key: correctKey });
  }

  return { questions, skipped };
}

/* ============================================================
 * Import CSV (templat muat turun -> isi -> muat naik)
 * ============================================================
 * Pendidik memuat turun templat, mengisinya dalam Excel atau Sheets, dan
 * memuat naik semula. Semua baris disahkan dahulu: jika satu baris rosak,
 * TIADA soalan dimasukkan dan senarai ralat dipulangkan. Ini menjadikan
 * muat naik boleh diulang tanpa meninggalkan separuh kuiz dalam pangkalan
 * data.
 */

/** Had muat naik: cukup besar untuk kelas sebenar, kecil untuk nginx (1 MB). */
export const QUIZ_CSV_MAX_QUESTIONS = 100;
export const QUIZ_CSV_MAX_BYTES = 500_000;

export const QUIZ_CSV_HEADER =
  'question,option_a,option_b,option_c,option_d,correct,points,seconds,countdown';

/** Templat yang dimuat turun pendidik. CRLF supaya Excel gembira. */
export const QUIZ_CSV_TEMPLATE = [
  QUIZ_CSV_HEADER,
  '"What is the capital of Malaysia?",Johor Bahru,Kuala Lumpur,Ipoh,Melaka,B,1000,20,yes',
  '"Which planet is closest to the Sun?",Venus,Mars,Mercury,Jupiter,C,1000,20,yes',
  '"2 + 2 x 3 = ?",8,10,12,6,A,1000,15,no',
  '',
].join('\r\n');

export interface QuizCsvError {
  /** Nombor baris seperti dilihat dalam Excel (baris 1 = pengepala). 0 = fail. */
  row: number;
  message: string;
}
export interface ParsedCsvQuestion {
  prompt: string;
  options: { key: string; text: string }[];
  correct_key: string;
  points: number;
  time_limit_sec: number;
  /** false bermakna tiada kira detik; time_limit_sec jadi rentak sahaja. */
  use_countdown: boolean;
}

/**
 * Pecah teks CSV mengikut RFC 4180: petikan berganda, koma dan baris baharu
 * di dalam medan berpetik, "" sebagai petikan literal. Baris kosong DIKEKALKAN
 * supaya nombor baris yang dilaporkan sepadan dengan yang dilihat pendidik
 * dalam Excel.
 */
export function parseCsvRows(text: string, delimiter = ','): string[][] {
  const s = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** Excel dalam sesetengah tetapan wilayah menulis ';' bukan ','. */
export function detectCsvDelimiter(text: string): string {
  const first = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  let best = ',';
  let bestCount = (first.match(/,/g) || []).length;
  for (const d of [';', '\t']) {
    const n = first.split(d).length - 1;
    if (n > bestCount) { best = d; bestCount = n; }
  }
  return best;
}

const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Normalkan nama lajur: huruf kecil, buang ruang dan tanda sempang. */
function normHeader(h: string): string {
  const k = h.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (k === 'prompt' || k === 'soalan' || k === 'questions') return 'question';
  if (k === 'answer' || k === 'key' || k === 'correct_answer' || k === 'correct_key' || k === 'jawapan') return 'correct';
  if (k === 'point' || k === 'mata' || k === 'score') return 'points';
  if (k === 'time' || k === 'time_limit' || k === 'time_limit_sec' || k === 'masa' || k === 'saat') return 'seconds';
  if (k === 'timer' || k === 'countdown_timer' || k === 'use_countdown' || k === 'kira_detik') return 'countdown';
  const single = /^([a-f])$/.exec(k);
  if (single) return 'option_' + single[1];
  const opt = /^(?:option|pilihan|answer)_([a-f])$/.exec(k);
  if (opt) return 'option_' + opt[1];
  return k;
}

function parseWholeNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (!/^-?\d+$/.test(t)) return NaN;
  return parseInt(t, 10);
}

/**
 * Tukar teks CSV kepada senarai soalan. Semua atau tiada: jika `errors`
 * tidak kosong, pemanggil MESTI tidak memasukkan apa-apa.
 */
export function parseQuizCsv(text: string): { questions: ParsedCsvQuestion[]; errors: QuizCsvError[] } {
  const errors: QuizCsvError[] = [];
  const questions: ParsedCsvQuestion[] = [];

  const rows = parseCsvRows(text, detectCsvDelimiter(text));
  const firstIdx = rows.findIndex((r) => r.some((c) => c.trim() !== ''));
  if (firstIdx === -1) {
    return { questions, errors: [{ row: 0, message: 'The file is empty.' }] };
  }

  const header = rows[firstIdx].map(normHeader);
  const col = (name: string) => header.indexOf(name);
  const iQuestion = col('question');
  const iCorrect = col('correct');
  const iPoints = col('points');
  const iSeconds = col('seconds');
  const iCountdown = col('countdown');
  const optionCols = OPTION_LETTERS.map((l) => col('option_' + l));

  if (iQuestion === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row has no "question" column. Start from the downloaded template.' });
  }
  if (optionCols[0] === -1 || optionCols[1] === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row needs at least "option_a" and "option_b" columns.' });
  }
  if (iCorrect === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row has no "correct" column.' });
  }
  if (errors.length > 0) return { questions: [], errors };

  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? String(r[i] ?? '').trim() : '');

  for (let r = firstIdx + 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!raw.some((c) => c.trim() !== '')) continue; // baris kosong dilangkau
    const rowNo = r + 1;

    const prompt = cell(raw, iQuestion);
    if (!prompt) {
      errors.push({ row: rowNo, message: 'the question text is empty.' });
      continue;
    }

    // Pilihan mesti diisi berturutan bermula A. Lompang di tengah adalah
    // ralat: kunci jawapan menjadi mengelirukan kepada pemain.
    const texts = optionCols.map((i) => cell(raw, i));
    let filled = 0;
    let gap = false;
    let gapReported = false;
    for (let k = 0; k < texts.length; k++) {
      if (texts[k]) {
        if (gap) {
          errors.push({
            row: rowNo,
            message: `option_${OPTION_LETTERS[k]} has text but an earlier option is empty. Fill the options in order, starting at option_a.`,
          });
          gapReported = true;
          break;
        }
        filled++;
      } else {
        gap = true;
      }
    }
    if (gapReported) continue;
    if (filled < 2) {
      errors.push({ row: rowNo, message: 'at least two options must be filled in.' });
      continue;
    }
    const options = texts.slice(0, filled).map((t, k) => ({ key: OPTION_LETTERS[k].toUpperCase(), text: t }));

    const correctRaw = cell(raw, iCorrect);
    if (!correctRaw) {
      errors.push({ row: rowNo, message: 'the "correct" column is empty.' });
      continue;
    }
    const correctKey = correctRaw.trim().toUpperCase().replace(/[.)\s]+$/, '');
    if (!/^[A-F]$/.test(correctKey)) {
      errors.push({
        row: rowNo,
        message: `"correct" must be a single letter from A to F, but it reads "${correctRaw}".`,
      });
      continue;
    }
    if (!options.some((o) => o.key === correctKey)) {
      errors.push({
        row: rowNo,
        message: `"correct" is ${correctKey}, but option_${correctKey.toLowerCase()} is empty.`,
      });
      continue;
    }

    let points = 1000;
    const pRaw = iPoints === -1 ? '' : cell(raw, iPoints);
    if (pRaw) {
      const n = parseWholeNumber(pRaw);
      if (n === null || Number.isNaN(n) || n < 1 || n > 10000) {
        errors.push({ row: rowNo, message: `"points" must be a whole number between 1 and 10000, but it reads "${pRaw}".` });
        continue;
      }
      points = n;
    }

    let timeLimitSec = 20;
    const sRaw = iSeconds === -1 ? '' : cell(raw, iSeconds);
    if (sRaw) {
      const n = parseWholeNumber(sRaw);
      if (n === null || Number.isNaN(n) || n < 5 || n > 300) {
        errors.push({ row: rowNo, message: `"seconds" must be a whole number between 5 and 300, but it reads "${sRaw}".` });
        continue;
      }
      timeLimitSec = n;
    }

    // Kira detik hidup secara lalai. Bila dimatikan, lajur seconds menjadi
    // rentak rujukan untuk mata kelajuan, bukan had masa.
    let useCountdown = true;
    const cRaw = iCountdown === -1 ? '' : cell(raw, iCountdown);
    if (cRaw) {
      const v = cRaw.trim().toLowerCase();
      if (['yes', 'y', 'true', '1', 'on', 'ya'].includes(v)) useCountdown = true;
      else if (['no', 'n', 'false', '0', 'off', 'tidak'].includes(v)) useCountdown = false;
      else {
        errors.push({ row: rowNo, message: `"countdown" must be yes or no, but it reads "${cRaw}".` });
        continue;
      }
    }

    questions.push({
      prompt,
      options,
      correct_key: correctKey,
      points,
      time_limit_sec: timeLimitSec,
      use_countdown: useCountdown,
    });
  }

  if (errors.length === 0 && questions.length === 0) {
    errors.push({ row: 0, message: 'The file has a header row but no questions under it.' });
  }
  if (questions.length > QUIZ_CSV_MAX_QUESTIONS) {
    errors.push({
      row: 0,
      message: `The file holds ${questions.length} questions. The limit is ${QUIZ_CSV_MAX_QUESTIONS} per upload. Split it into smaller files.`,
    });
  }
  return { questions: errors.length ? [] : questions, errors };
}
