/**
 * Kuizen Arena: pembantu pelayan untuk laluan peserta (/api/arena/play/[code]/*).
 * Semua akses melalui klien service-role. Lajur `data` soalan (kunci jawapan)
 * hanya digunakan di pelayan untuk menggred; JANGAN pulangkan kepada peserta.
 */
import type { NextRequest } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';
import { normalizeSettings } from '@/lib/arena/validate';
import { toPublicQuestion, presenceOf } from '@/lib/arena/public';
import { questionAccess, teamScores, coopProgress } from '@/lib/arena/modes';
import { liveRowToArena, type LiveBankRow } from '@/lib/kuiz-bank';
import { DEFAULT_SET_SETTINGS } from '@/lib/arena/types';
import type {
  ArenaSession,
  ArenaSet,
  ArenaQuestion,
  ArenaPlayerPublic,
  PlayStateResponse,
} from '@/lib/arena/types';

export type Svc = ReturnType<typeof getServiceSupabase>;

/** Baris qm_arena_players. */
export interface PlayerRow {
  id: string;
  session_id: string;
  nickname: string;
  player_token: string;
  avatar: number;
  team: number | null;
  pos_x: number;
  pos_y: number;
  score: number;
  last_seen_at: string;
  joined_at: string;
}
export type PlayerLite = Pick<PlayerRow, 'id' | 'nickname' | 'avatar' | 'team' | 'pos_x' | 'pos_y' | 'score' | 'last_seen_at'>;

const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;

/** Normalkan kod sesi (huruf besar); null jika format salah. */
export function normalizeCode(code: string | null | undefined): string | null {
  const c = String(code ?? '').trim().toUpperCase();
  return CODE_RE.test(c) ? c : null;
}

/** Token peserta daripada header x-player-token. */
export function playerTokenOf(req: NextRequest): string | null {
  const t = req.headers.get('x-player-token');
  return t && t.trim() ? t.trim() : null;
}

/** Baca badan JSON dengan selamat (objek kosong jika tiada/rosak). */
export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const j: unknown = await req.json();
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Sesi sahaja (ringan, untuk /move). */
export async function loadSessionByCode(svc: Svc, code: string): Promise<ArenaSession | null> {
  const c = normalizeCode(code);
  if (!c) return null;
  // KZ-050: ralat sementara (get laluan/pangkalan data) dicuba sekali lagi
  // dan DILEMPAR jika masih gagal, supaya laluan membalas 5xx. Dahulu ralat
  // dianggap "sesi tiada" (404) dan pemain nampak "kod tidak dijumpai".
  for (let cubaan = 0; cubaan < 2; cubaan++) {
    const { data, error } = await svc.from('qm_arena_sessions').select('*').eq('code', c).maybeSingle();
    if (!error) return data ? (data as unknown as ArenaSession) : null;
    if (cubaan === 1) throw new Error('arena session lookup failed');
  }
  return null;
}

/**
 * Sesi + set (tetapan dinormalkan).
 *
 * KZ-045: sesi boleh memakan soalan daripada bank Kuiz (quiz_id, set_id
 * null). Untuk sesi itu satu set maya dibina daripada qm_live_quizzes:
 * tajuk kuiz menjadi tajuk set dan tetapan ialah DEFAULT_SET_SETTINGS
 * kerana kuiz Live tiada tetapan Arena. Sesi lama (set_id) kekal seperti
 * sebelum ini.
 */
export async function loadPlaySession(
  svc: Svc,
  code: string,
): Promise<{ session: ArenaSession; set: ArenaSet; quizId: string | null } | null> {
  const session = await loadSessionByCode(svc, code);
  if (!session) return null;

  // Sesi bank Kuiz: set maya.
  if (session.quiz_id) {
    const { data: kuiz } = await svc
      .from('qm_live_quizzes')
      .select('id, owner_id, title, description, created_at')
      .eq('id', session.quiz_id)
      .maybeSingle();
    if (!kuiz) return null;
    const k = kuiz as unknown as {
      id: string; owner_id: string; title: string; description: string | null; created_at: string;
    };
    const set: ArenaSet = {
      id: k.id,
      owner_id: k.owner_id,
      title: k.title,
      description: k.description,
      settings: DEFAULT_SET_SETTINGS,
      created_at: k.created_at,
      updated_at: k.created_at,
    };
    return { session, set, quizId: session.quiz_id };
  }

  const { data } = await svc.from('qm_arena_sets').select('*').eq('id', session.set_id).maybeSingle();
  if (!data) return null;
  const raw = data as unknown as ArenaSet & { settings: unknown };
  const set: ArenaSet = { ...raw, settings: normalizeSettings(raw.settings) };
  return { session, set, quizId: null };
}

/** Pemain mengikut token dalam sesi ini; null jika tiada/tidak sah. */
export async function loadPlayerByToken(
  svc: Svc,
  sessionId: string,
  token: string | null | undefined,
): Promise<PlayerRow | null> {
  const t = String(token ?? '').trim();
  if (!t || t.length > 200) return null;
  // KZ-050: ralat sementara dicuba sekali lagi dan dilempar jika masih
  // gagal. Dahulu ralat dianggap "token tidak sah", lalu klien membuang
  // token pemain dan pelajar tercampak ke borang masuk di tengah permainan.
  for (let cubaan = 0; cubaan < 2; cubaan++) {
    const { data, error } = await svc
      .from('qm_arena_players')
      .select('*')
      .eq('session_id', sessionId)
      .eq('player_token', t)
      .maybeSingle();
    if (!error) return data ? (data as unknown as PlayerRow) : null;
    if (cubaan === 1) throw new Error('arena player lookup failed');
  }
  return null;
}

/**
 * Soalan set ikut order_idx kemudian created_at (termasuk data: pelayan sahaja).
 */
export async function orderedQuestions(svc: Svc, setId: string): Promise<ArenaQuestion[]> {
  const { data } = await svc
    .from('qm_arena_questions')
    .select('id,set_id,order_idx,type,prompt,data,hint,points,time_limit_sec,origin')
    .eq('set_id', setId)
    .order('order_idx', { ascending: true })
    .order('created_at', { ascending: true });
  return (data ?? []) as unknown as ArenaQuestion[];
}

/**
 * KZ-045: soalan SESI ikut sumbernya. Sesi kuiz (quizId tidak null) membaca
 * qm_live_questions (SEMUA jenis, dipetakan liveRowToArena, ikut order_idx;
 * jadual itu tiada created_at). Sesi lama membaca qm_arena_questions.
 * Kedua-dua senarai TIDAK pernah sampai kepada peserta tanpa toPublicQuestion.
 */
export async function soalanSesi(
  svc: Svc,
  quizId: string | null,
  setId: string | null,
): Promise<ArenaQuestion[]> {
  if (quizId) {
    const { data } = await svc
      .from('qm_live_questions')
      .select(
        'id, quiz_id, order_idx, prompt, options, correct_key, points, time_limit_sec, use_countdown, double_points, qtype, data, hint',
      )
      .eq('quiz_id', quizId)
      .order('order_idx', { ascending: true });
    const baris = (data ?? []) as unknown as LiveBankRow[];
    return baris.map((r) =>
      liveRowToArena({ ...r, qtype: r.qtype || 'multiple', data: r.data ?? null, hint: r.hint ?? null }),
    );
  }
  return orderedQuestions(svc, setId as string);
}

/**
 * Id soalan yang sudah dijawab oleh pemain (KZ-045: jawapan sesi kuiz
 * menyimpan live_question_id; jawapan sesi lama menyimpan question_id).
 */
export async function answeredIdsOf(svc: Svc, playerId: string): Promise<Set<string>> {
  const { data } = await svc
    .from('qm_arena_answers')
    .select('question_id, live_question_id')
    .eq('player_id', playerId);
  const ids = new Set<string>();
  for (const r of (data ?? []) as unknown as { question_id: string | null; live_question_id: string | null }[]) {
    if (r.question_id) ids.add(r.question_id);
    if (r.live_question_id) ids.add(r.live_question_id);
  }
  return ids;
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Turutan soalan untuk pemain: dikocok tetap (ikut id pemain) jika shuffleQuestions, kecuali mod round. */
export function playerOrder(
  qs: ArenaQuestion[],
  session: ArenaSession,
  set: ArenaSet,
  playerId: string,
): ArenaQuestion[] {
  if (!set.settings.shuffleQuestions || session.mode === 'round') return qs;
  return [...qs].sort((a, b) => hashStr(playerId + a.id) - hashStr(playerId + b.id));
}

/** Akses soalan untuk pemain (available/locked) ikut mod sesi. */
export function accessFor(
  ordered: ArenaQuestion[],
  answered: Set<string>,
  session: ArenaSession,
  set: ArenaSet,
): { available: string[]; locked: string[] } {
  return questionAccess({
    mode: session.mode,
    orderedIds: ordered.map((q) => q.id),
    answeredIds: answered,
    currentIndex: session.current_index,
    allowPass: set.settings.allowPass,
  });
}

export function toPublicPlayer(r: PlayerLite, answered: number, nowMs: number): ArenaPlayerPublic {
  return {
    id: r.id,
    nickname: r.nickname,
    avatar: Number(r.avatar) || 0,
    team: r.team == null ? null : Number(r.team),
    x: Number(r.pos_x) || 0,
    y: Number(r.pos_y) || 0,
    score: Number(r.score) || 0,
    answered,
    presence: presenceOf(r.last_seen_at, nowMs),
  };
}

/** Bina PlayStateResponse (tiada kunci jawapan, tiada token pemain lain). */
export async function buildPlayState(
  svc: Svc,
  session: ArenaSession,
  set: ArenaSet,
  me: PlayerRow | null,
): Promise<PlayStateResponse> {
  const now = Date.now();
  const [qs, playersRes, answersRes, myRes] = await Promise.all([
    soalanSesi(svc, session.quiz_id, session.set_id),
    svc
      .from('qm_arena_players')
      .select('id,nickname,avatar,team,pos_x,pos_y,score,last_seen_at')
      .eq('session_id', session.id)
      .order('joined_at', { ascending: true }),
    svc.from('qm_arena_answers').select('player_id').eq('session_id', session.id).range(0, 9999),
    me
      ? svc
          .from('qm_arena_answers')
          .select('question_id, live_question_id, is_correct, score')
          .eq('player_id', me.id)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const rows = (playersRes.data ?? []) as unknown as PlayerLite[];
  const counts = new Map<string, number>();
  for (const a of (answersRes.data ?? []) as unknown as { player_id: string }[]) {
    counts.set(a.player_id, (counts.get(a.player_id) ?? 0) + 1);
  }
  const myAnswers: PlayStateResponse['myAnswers'] = {};
  for (const a of (myRes.data ?? []) as unknown as {
    question_id: string | null;
    live_question_id: string | null;
    is_correct: boolean | null;
    score: number;
  }[]) {
    // KZ-045: kunci ikut lajur yang diisi; id soalan kuiz dan set sama ada
    // unik dalam skop pemain ini (kekangan unik di pangkalan data).
    const kunci = a.live_question_id ?? a.question_id;
    if (kunci) myAnswers[kunci] = { isCorrect: a.is_correct, score: Number(a.score) || 0 };
  }
  const players = rows.map((r) => toPublicPlayer(r, counts.get(r.id) ?? 0, now));
  const meId = me ? me.id : null;
  const meOut = me
    ? players.find((p) => p.id === meId) ?? toPublicPlayer(me, Object.keys(myAnswers).length, now)
    : null;

  // mod round: soalan semasa (awam) semasa bermain sahaja
  let roundQuestion: PlayStateResponse['roundQuestion'] = null;
  if (session.mode === 'round' && session.status === 'playing') {
    const cur: ArenaQuestion | undefined =
      session.current_index >= 0 ? qs[session.current_index] : undefined;
    if (cur) roundQuestion = toPublicQuestion(cur, (me ? me.id : '') + cur.id);
  }

  const ranking = set.settings.showRanking
    ? [...players]
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map((p) => ({ nickname: p.nickname, score: p.score, team: p.team }))
    : [];

  const teams = session.mode === 'team' ? teamScores(players, session.team_count) : [];
  const coop =
    session.mode === 'coop'
      ? coopProgress(
          players.reduce((s, p) => s + p.score, 0),
          qs.reduce((s, q) => s + (Number(q.points) || 0), 0),
          players.length,
          set.settings.coopTargetPct,
        )
      : null;

  return {
    session: {
      // KZ-046: id sesi diperlukan oleh permainan Pulau Harta Karun
      // (kabus peti emas dikunci ikut sessionId + questionId).
      id: session.id,
      code: session.code,
      mode: session.mode,
      view: session.view,
      status: session.status,
      frozen: session.frozen,
      current_index: session.current_index,
      round_started_at: session.round_started_at,
      ends_at: session.ends_at,
      map_id: session.map_id,
      team_count: session.team_count,
      reset_seq: session.reset_seq,
      title: set.title,
      questionCount: qs.length,
    },
    me: meOut,
    myAnswers,
    roundQuestion,
    players,
    ranking,
    teams,
    coop,
    settings: {
      allowPass: set.settings.allowPass,
      answerRevealMode: set.settings.answerRevealMode,
      showRanking: set.settings.showRanking,
    },
    serverTime: new Date(now).toISOString(),
  };
}
