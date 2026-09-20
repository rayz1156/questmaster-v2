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
  id: string; class_id: string; owner_id: string;
  title: string; description: string | null; created_at: string;
}
export interface LiveQuestionRow {
  id: string; quiz_id: string; order_idx: number; prompt: string;
  options: { key: string; text: string }[]; correct_key: string;
  points: number; time_limit_sec: number;
}
export interface LiveSessionRow {
  id: string; quiz_id: string; host_id: string; code: string; status: string;
  current_index: number; question_started_at: string | null;
  created_at?: string; ended_at?: string | null;
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
    response: NextResponse.json({ error: 'Anda bukan pendidik kelas ini.' }, { status: 403 }),
  };
}

/** Muat kuiz dan sahkan pemanggil pendidik kelas kuiz itu. */
export async function requireQuizHost(
  req: NextRequest | Request | null,
  quizId: string,
): Promise<LiveHostAuth & { quiz: LiveQuizRow | null }> {
  const auth = await requireUser(req);
  if (auth.response) {
    return { user: null as unknown as User, supa: auth.supa, quiz: null, response: auth.response };
  }

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
      response: NextResponse.json({ error: 'Kuiz tidak dijumpai.' }, { status: 404 }),
    };
  }

  const host = await requireLiveHost(req, quiz.class_id);
  if (host.response) return { ...host, quiz: null };
  return { ...host, quiz };
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
    .select('id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec')
    .eq('id', questionId)
    .maybeSingle()) as { data: LiveQuestionRow | null };
  if (!question) {
    return {
      user: null as unknown as User,
      supa: auth.supa,
      question: null,
      response: NextResponse.json({ error: 'Soalan tidak dijumpai.' }, { status: 404 }),
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
    return { ok: false, error: 'Pilihan mesti antara 2 hingga 6 item.' };
  }
  const keys: string[] = [];
  for (const opt of options) {
    if (!opt || typeof opt !== 'object') return { ok: false, error: 'Pilihan tidak sah.' };
    const o = opt as { key?: unknown; text?: unknown };
    if (typeof o.key !== 'string' || !o.key.trim() || typeof o.text !== 'string' || !o.text.trim()) {
      return { ok: false, error: 'Setiap pilihan mesti ada key dan text.' };
    }
    keys.push(o.key);
  }
  if (new Set(keys).size !== keys.length) {
    return { ok: false, error: 'Kunci pilihan mesti unik.' };
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
