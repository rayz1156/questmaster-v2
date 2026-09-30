/**
 * Jenis TypeScript bagi JSON `qm_insights_kelas` (migrasi 0051, tiket
 * V2-014a) serta label bendera pelajar. Fungsi tulen tanpa akses pangkalan
 * data supaya boleh diuji dengan `npx tsx scripts/selftest-insights-csv.ts`.
 *
 * Nombor peratus dan purata dari SQL sudah dibundarkan 1 titik perpuluhan;
 * nilai NULL bermakna tiada data (contoh accuracy_pct tanpa sebarang
 * jawapan), bukan sifar.
 */

/** Satu titik trend: markah pelajar dalam satu sesi Live Quiz ended. */
export interface TrendTitik {
  session_id: string;
  played_at: string;
  score: number;
  /** score / jumlah mata maksimum soalan sesi * 100; NULL bila kuiz kosong. */
  pct: number | null;
  /** Medan tambahan untuk tajuk lajur eksport CSV trend. */
  quiz_title: string;
  /** Medan tambahan untuk tajuk lajur eksport CSV trend. */
  session_ended_at: string | null;
}

/** Bendera tetap yang boleh dipulangkan qm_insights_kelas. */
export type Bendera =
  | 'bottom_20'
  | 'declining'
  | 'inactive_7d'
  | 'never_live'
  | 'pending_old'
  | 'improving';

/** Label Inggeris bagi setiap bendera (keputusan istilah antara muka). */
export const LABEL_BENDERA: Record<Bendera, string> = {
  bottom_20: 'Bottom 20%',
  declining: 'Scores falling',
  inactive_7d: 'Inactive 7+ days',
  never_live: 'Never joined a Live Quiz',
  pending_old: 'Submission waiting 3+ days',
  improving: 'Improving',
};

/** Satu baris pelajar dalam students[]. */
export interface PelajarInsights {
  user_id: string;
  name: string | null;
  task_score: number;
  live_score: number;
  adjustment_score: number;
  total_score: number;
  /** Kedudukan; seri berkongsi nombor yang sama. */
  rank: number;
  live_sessions: number;
  answered: number;
  correct: number;
  accuracy_pct: number | null;
  /** Purata ms_taken jawapan; NULL bila tiada jawapan. */
  avg_ms: number | null;
  approved: number;
  pending: number;
  rejected: number;
  last_active: string | null;
  team_id: string | null;
  team_name: string | null;
  trend: TrendTitik[];
  flags: string[];
}

/** Ringkasan atas (pulse) insights kelas. */
export interface PulseInsights {
  members: number;
  avg_total: number | null;
  median_total: number | null;
  live_participation_pct: number | null;
  accuracy_pct: number | null;
  pending_reviews: number;
  live_sessions: number;
}

/** Satu bin agihan markah. */
export interface BinAgihan {
  from: number;
  to: number;
  count: number;
}

export interface AgihanInsights {
  total: BinAgihan[];
  task: BinAgihan[];
  live: BinAgihan[];
}

/** Pilihan salah paling kerap bagi satu soalan susar. */
export interface PilihanSalah {
  key: string;
  label: string | null;
  count: number;
}

/** Soalan Live Quiz susar (dijawab >= 3 kali). */
export interface SoalanSusar {
  question_id: string;
  quiz_title: string;
  prompt: string;
  answered: number;
  correct_pct: number | null;
  avg_ms: number | null;
  top_wrong_choice: PilihanSalah | null;
  /** Label pilihan betul untuk rujukan educator; kunci tidak pernah bocor. */
  correct_label: string | null;
}

/** Cabaran aktiviti susar (>= 2 submission). */
export interface CabaranSusar {
  challenge_id: string;
  title: string;
  hunt_title: string;
  submitted: number;
  approved: number;
  rejected: number;
  rejected_pct: number | null;
  pending: number;
}

/** Satu pasukan kelas. */
export interface PasukanInsights {
  team_id: string;
  name: string;
  members: number;
  total_score: number;
  avg_per_member: number | null;
  top_member_share_pct: number | null;
  zero_members: number;
  flag_unbalanced: boolean;
  member_ids: string[];
}

/** Bentuk penuh JSON qm_insights_kelas. */
export interface InsightsKelas {
  class_id: string;
  pulse: PulseInsights;
  students: PelajarInsights[];
  distribution: AgihanInsights;
  hard_questions: SoalanSusar[];
  hard_challenges: CabaranSusar[];
  teams: PasukanInsights[];
  generated_at: string;
}

/**
 * Label bendera pelajar disusun sebagai satu baris, dipisah `; `
 * (sama pemisah seperti lajur Flags dalam eksport CSV). Bendera yang tidak
 * dikenali dipaparkan sebagai mana-mana (tahan depan masa terhadap data).
 */
export function labelBendera(flags: readonly string[]): string {
  return flags.map((f) => LABEL_BENDERA[f as Bendera] ?? f).join('; ');
}

/** Senarai putih bahagian eksport, mengikut susunan paparan. */
export const BAHAGIAN_INSIGHTS = [
  'students',
  'attention',
  'questions',
  'challenges',
  'teams',
  'trend',
] as const;

export type BahagianInsights = (typeof BAHAGIAN_INSIGHTS)[number];
