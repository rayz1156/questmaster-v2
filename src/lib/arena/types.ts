/**
 * Kuizen Arena: kontrak jenis bersama (kuiz permainan berasaskan peta, dibina untuk Kuizen).
 *
 * Fail ini ialah KONTRAK. Pelayan (grade/validate/public/modes), UI pendidik,
 * UI peserta dan enjin peta semuanya mengimport daripada sini.
 * Jangan ubah nama atau bentuk tanpa mengemas kini semua pengguna.
 *
 * Keselamatan: `data` soalan mengandungi kunci jawapan. Ia TIDAK boleh sampai
 * kepada peserta. Laluan peserta hanya memulangkan `PublicQuestion` yang
 * dihasilkan oleh `toPublicQuestion()` (src/lib/arena/public.ts).
 */

export const ARENA_QTYPES = ['multiple', 'subjective', 'ox', 'essay', 'match', 'order'] as const;
export type ArenaQType = (typeof ARENA_QTYPES)[number];

/** sequencing = ikut turutan; freestyle = bebas; round = guru gerakkan soalan
 *  serentak (bonus laju); team = markah dikumpul ikut pasukan; coop = sasaran
 *  markah kelas bersama. */
export const ARENA_MODES = ['sequencing', 'freestyle', 'round', 'team', 'coop'] as const;
export type ArenaMode = (typeof ARENA_MODES)[number];

/** list = kad soalan biasa; map = peta 2D (avatar berjalan ke objek soalan). */
export type ArenaView = 'list' | 'map';

export type ArenaSessionStatus = 'lobby' | 'playing' | 'ended';
export type AnswerRevealMode = 'never' | 'incorrect_only' | 'always';
export type QuestionOrigin = 'ai' | 'manual' | 'duplicate' | 'similar';

// ---------------------------------------------------------------- data soalan

export interface ChoiceItem { key: string; text: string; imageUrl?: string; isAnswer: boolean }
/** Lebih daripada satu isAnswer=true -> soalan pelbagai pilihan jawapan (pilih semua). */
export interface MultipleData { choiceList: ChoiceItem[] }
/** Jawapan pendek; mana-mana teks dalam answerList dikira betul. */
export interface SubjectiveData { answerList: { key: string; text: string }[]; ignoreSpaces?: boolean; ignoreCase?: boolean }
/** Betul (o) / Salah (x). */
export interface OxData { answer: 'o' | 'x' }
/** Esei: digred manual oleh pendidik. rubric pilihan, dipaparkan kepada pendidik sahaja. */
export interface EssayData { rubric?: string; maxLength?: number }
export interface MatchItem { key: string; text: string }
/** 2-5 item setiap sisi; answerPairs memetakan key kiri -> key kanan. */
export interface MatchData { leftItems: MatchItem[]; rightItems: MatchItem[]; answerPairs: { left: string; right: string }[] }
/** 2-5 item; turutan BETUL ialah turutan tatasusunan ini. */
export interface OrderData { items: { key: string; text: string }[] }

export type ArenaQuestionData = MultipleData | SubjectiveData | OxData | EssayData | MatchData | OrderData;

export interface ArenaHint { type: 'text' | 'image' | 'youtube'; value: string }

/** Baris qm_arena_questions (sisi pelayan / pendidik sahaja). */
export interface ArenaQuestion {
  id: string;
  set_id: string;
  order_idx: number;
  type: ArenaQType;
  prompt: string; // <= 300 aksara
  data: ArenaQuestionData;
  hint: ArenaHint | null;
  points: number; // lalai 100
  time_limit_sec: number; // lalai 30
  origin: QuestionOrigin;
}

/** Input untuk mencipta/mengemas kini soalan (tanpa id/set_id). */
export interface ArenaQuestionInput {
  type: ArenaQType;
  prompt: string;
  data: ArenaQuestionData;
  hint?: ArenaHint | null;
  points?: number;
  time_limit_sec?: number;
  origin?: QuestionOrigin;
  order_idx?: number;
}

/** Soalan yang selamat untuk peserta: TIADA kunci jawapan. */
export interface PublicQuestion {
  id: string;
  order_idx: number;
  type: ArenaQType;
  prompt: string;
  hint: ArenaHint | null;
  points: number;
  time_limit_sec: number;
  /** multiple: pilihan tanpa isAnswer */
  options?: { key: string; text: string; imageUrl?: string }[];
  /** multiple: true jika lebih daripada satu jawapan betul */
  multiSelect?: boolean;
  /** match: sisi kiri (turutan asal) dan kanan (dikocok) */
  left?: MatchItem[];
  right?: MatchItem[];
  /** order: item dikocok */
  items?: { key: string; text: string }[];
  /** essay: had panjang jawapan (lalai 1000) */
  maxLength?: number;
}

// ---------------------------------------------------------------- jawapan

export type ArenaAnswer =
  | { type: 'multiple'; keys: string[] }
  | { type: 'subjective'; text: string }
  | { type: 'ox'; value: 'o' | 'x' }
  | { type: 'essay'; text: string }
  | { type: 'match'; pairs: { left: string; right: string }[] }
  | { type: 'order'; keys: string[] };

export interface GradeResult {
  /** null = esei menunggu gred pendidik */
  isCorrect: boolean | null;
  score: number;
  pending: boolean;
}

/** Jawapan betul untuk dipaparkan selepas menjawab (ikut answerRevealMode). */
export type ArenaReveal =
  | { type: 'multiple'; keys: string[] }
  | { type: 'subjective'; texts: string[] }
  | { type: 'ox'; value: 'o' | 'x' }
  | { type: 'essay' }
  | { type: 'match'; pairs: { left: string; right: string }[] }
  | { type: 'order'; keys: string[] };

// ---------------------------------------------------------------- set & sesi

export interface ArenaSetSettings {
  allowPass: boolean; // boleh langkau soalan (sequencing)
  answerRevealMode: AnswerRevealMode; // mod round sentiasa 'always'
  shuffleQuestions: boolean;
  showRanking: boolean; // peserta nampak ranking
  coopTargetPct: number; // mod coop: sasaran % markah maksimum kelas, lalai 70
}

export const DEFAULT_SET_SETTINGS: ArenaSetSettings = {
  allowPass: true,
  answerRevealMode: 'incorrect_only',
  shuffleQuestions: false,
  showRanking: true,
  coopTargetPct: 70,
};

export interface ArenaSet {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  settings: ArenaSetSettings;
  created_at: string;
  updated_at: string;
}

export interface ArenaSession {
  id: string;
  set_id: string;
  host_id: string;
  code: string; // 6 aksara, abjad tanpa 0/O/1/I
  mode: ArenaMode;
  view: ArenaView;
  status: ArenaSessionStatus;
  frozen: boolean;
  current_index: number; // mod round: indeks soalan semasa (-1 = belum)
  round_started_at: string | null;
  ends_at: string | null; // had masa keseluruhan (null = tiada)
  map_id: string; // id peta dalam src/lib/arena/maps.ts
  team_count: number; // mod team: 2-4
  reset_seq: number; // Start Together: naik 1 setiap kali, klien set semula posisi
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

/** Status kehadiran (pengajaran penting: jangan buang pemain yang terputus). */
export type PresenceStatus = 'online' | 'away' | 'offline';
/** online: last_seen < 20 s; away: < 120 s; offline: lebih lama. Pemain KEKAL dalam senarai. */
export const PRESENCE_ONLINE_MS = 20_000;
export const PRESENCE_AWAY_MS = 120_000;

export interface ArenaPlayerPublic {
  id: string;
  nickname: string;
  avatar: number; // 0-7
  team: number | null; // 0..team_count-1
  x: number;
  y: number;
  score: number;
  answered: number;
  presence: PresenceStatus;
}

// ---------------------------------------------------------------- respons play API

/** GET /api/arena/play/[code]/state (header x-player-token) */
export interface PlayStateResponse {
  session: Pick<ArenaSession, 'code' | 'mode' | 'view' | 'status' | 'frozen' | 'current_index' | 'round_started_at' | 'ends_at' | 'map_id' | 'team_count' | 'reset_seq'> & { title: string; questionCount: number };
  me: ArenaPlayerPublic | null;
  /** id soalan yang SAYA sudah jawab -> keputusan ringkas */
  myAnswers: Record<string, { isCorrect: boolean | null; score: number }>;
  /** mod round: soalan semasa (awam) atau null */
  roundQuestion: PublicQuestion | null;
  /** pemain lain (peta + senarai), termasuk saya */
  players: ArenaPlayerPublic[];
  /** ranking (kosong jika showRanking=false) */
  ranking: { nickname: string; score: number; team: number | null }[];
  teams: { team: number; score: number }[]; // mod team
  coop: { total: number; target: number } | null; // mod coop
  settings: Pick<ArenaSetSettings, 'allowPass' | 'answerRevealMode' | 'showRanking'>;
  serverTime: string;
}

/** POST /api/arena/play/[code]/answer -> */
export interface AnswerResponse {
  result: GradeResult;
  reveal: ArenaReveal | null;
  totalScore: number;
}

// ---------------------------------------------------------------- peta 2D

/** Prop komponen src/components/arena/ArenaMap.tsx (enjin Canvas 2D). */
export interface ArenaMapProps {
  mapId: string;
  me: { id: string; nickname: string; avatar: number; x: number; y: number } | null;
  players: ArenaPlayerPublic[];
  /** objek soalan diletak di peta; answered=true dilukis kelabu */
  questions: { id: string; order_idx: number; answered: boolean; locked: boolean }[];
  frozen: boolean;
  /** naik setiap Start Together; peta mesti set semula avatar ke titik mula */
  resetSeq: number;
  /** dipanggil (dihadkan ~4/s) apabila avatar saya bergerak */
  onMove: (x: number, y: number) => void;
  /** avatar menyentuh objek soalan (tidak dipanggil jika locked/answered) */
  onTouchQuestion: (questionId: string) => void;
}
