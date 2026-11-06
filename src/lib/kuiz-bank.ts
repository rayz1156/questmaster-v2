/**
 * KZ-045: pemetaan antara bank soalan Kuiz (qm_live_questions) dan jenis
 * soalan Arena (6 jenis).
 *
 * Fail ini TULEN: boleh diguna oleh klien dan pelayan. Jangan import apa-apa
 * yang menarik `crypto` atau Supabase (rujuk arena/public.ts yang sengaja
 * tidak diimport di sini).
 *
 * Keselamatan: `data` dan `correct_key` ialah kunci jawapan. Pemanggil
 * laluan peserta mesti TIDAK memulangkan baris ini; gunakan toPublicQuestion
 * (arena/public.ts) atau senarai lajur tanpa kunci.
 */
import type {
  ArenaHint,
  ArenaQuestion,
  ArenaQuestionInput,
  ArenaQType,
  MultipleData,
  OxData,
} from '@/lib/arena/types';

/** Jenis soalan yang boleh dimainkan oleh enjin Live (satu jawapan betul). */
export const QTYPES_LIVE: readonly ArenaQType[] = ['multiple', 'ox'];

/** Baris qm_live_questions seperti dibaca oleh pelayan / pendidik sahaja. */
export interface LiveBankRow {
  id: string;
  quiz_id: string;
  order_idx: number;
  prompt: string;
  options: { key: string; text: string }[];
  /** RAHSIA: kunci jawapan. */
  correct_key: string;
  qtype: string;
  /** RAHSIA: kunci jawapan jenis bukan aneka; null untuk multiple/ox satu jawapan. */
  data: unknown;
  hint: unknown;
  points: number;
  time_limit_sec: number;
  use_countdown?: boolean;
  double_points?: boolean;
}

/** Hasil arenaInputToLiveRow: medan qm_live_questions untuk sisipan. */
export interface LiveRowDariArena {
  qtype: ArenaQType;
  prompt: string;
  options: { key: string; text: string }[];
  correct_key: string;
  data: unknown;
  hint: ArenaHint | null;
  points: number;
  time_limit_sec: number;
}

/** Pilihan Betul/Salah yang sentiasa sama untuk soalan ox. */
export const OX_OPTIONS: { key: string; text: string }[] = [
  { key: 'O', text: 'Betul' },
  { key: 'X', text: 'Salah' },
];

/**
 * Soalan serasi enjin Live: aneka pilihan atau betul-salah dengan TEPAT
 * satu jawapan betul (correct_key <> ''). Soalan lain dilangkau oleh enjin
 * Live (klasik, lumba, raksasa) dan hanya dimainkan oleh enjin Arena.
 */
export function isLiveCompatible(row: Pick<LiveBankRow, 'qtype' | 'correct_key'>): boolean {
  return (
    (QTYPES_LIVE as readonly string[]).includes(row.qtype) &&
    typeof row.correct_key === 'string' &&
    row.correct_key !== ''
  );
}

/** Normalkan lajur hint (jsonb) kepada ArenaHint atau null. */
function hintDari(row: LiveBankRow): ArenaHint | null {
  const h = row.hint;
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const o = h as { type?: unknown; value?: unknown };
  if (o.type === 'text' || o.type === 'image' || o.type === 'youtube') {
    if (typeof o.value === 'string' && o.value) {
      return { type: o.type, value: o.value } satisfies ArenaHint;
    }
  }
  return null;
}

/**
 * Tukar baris bank Kuiz kepada ArenaQuestion (penuh, mengandungi kunci
 * jawapan; hanya untuk pelayan / editor pendidik). `set_id` dipetakan kepada
 * quiz_id (set maya; Arena tidak membacanya untuk sesi kuiz).
 */
export function liveRowToArena(row: LiveBankRow): ArenaQuestion {
  const type = (row.qtype || 'multiple') as ArenaQType;
  let data: unknown;
  if (type === 'multiple') {
    // Satu jawapan: kunci dalam correct_key, choiceList dibina semula.
    // Banyak jawapan: choiceList asal disimpan dalam data.
    const dariData =
      row.data && typeof row.data === 'object' && !Array.isArray(row.data) &&
      Array.isArray((row.data as MultipleData).choiceList)
        ? (row.data as MultipleData).choiceList
        : null;
    data = {
      choiceList: dariData ?? (row.options || []).map((o) => ({
        key: o.key,
        text: o.text,
        isAnswer: o.key === row.correct_key,
      })),
    };
  } else if (type === 'ox') {
    data = { answer: row.correct_key === 'X' ? 'x' : 'o' } satisfies OxData;
  } else {
    data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? row.data : {};
  }
  return {
    id: row.id,
    set_id: row.quiz_id,
    order_idx: row.order_idx,
    type,
    prompt: row.prompt,
    data: data as ArenaQuestion['data'],
    hint: hintDari(row),
    points: Number(row.points) || 0,
    time_limit_sec: Number(row.time_limit_sec) || 30,
    origin: 'manual',
  };
}

/**
 * Tukar input Arena (hasil validateQuestion) kepada medan baris
 * qm_live_questions. Pemetaan keputusan PM (KZ-045):
 *   multiple satu jawapan: options diisi, correct_key kunci betul, data null;
 *   multiple banyak jawapan: options diisi, correct_key '', data {choiceList};
 *   ox: options O/X, correct_key huruf besar, data null;
 *   subjective/essay/match/order: options '[]', correct_key '', data asal.
 */
export function arenaInputToLiveRow(input: ArenaQuestionInput): LiveRowDariArena {
  let options: { key: string; text: string }[];
  let correctKey: string;
  let data: unknown;

  if (input.type === 'multiple') {
    const list = (input.data as MultipleData).choiceList ?? [];
    options = list.map((c) => ({ key: c.key, text: c.text }));
    const betul = list.filter((c) => c.isAnswer).map((c) => c.key);
    if (betul.length === 1) {
      correctKey = betul[0];
      data = null;
    } else {
      // Banyak jawapan: tidak serasi Live; kunci disimpan dalam data.
      correctKey = '';
      data = { choiceList: list } satisfies MultipleData;
    }
  } else if (input.type === 'ox') {
    options = OX_OPTIONS.map((o) => ({ ...o }));
    correctKey = (input.data as OxData).answer === 'x' ? 'X' : 'O';
    data = null;
  } else {
    options = [];
    correctKey = '';
    data = input.data;
  }

  return {
    qtype: input.type,
    prompt: input.prompt,
    options,
    correct_key: correctKey,
    data,
    hint: input.hint ?? null,
    points: input.points ?? 100,
    time_limit_sec: input.time_limit_sec ?? 30,
  };
}
