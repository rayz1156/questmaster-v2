// lib/mcp/report-tools.ts
//
// Bantuan tulen dan pembungkus panggilan route bagi alat MCP laporan markah
// (tiket V2-017). Semua alat di sini baca sahaja dan memanggil route API
// Kuizen sendiri melalui callApi sebagai pengguna; jangan salin logik route
// ke dalam tool (lihat header lib/mcp/api.ts).
//
// Fail ini sengaja TIDAK mengimport session.ts atau db.ts supaya
// scripts/selftest-mcp-laporan.ts boleh mengujinya dengan fetch digantung
// tanpa pangkalan data.

import { callApi, callApiText } from "./api";
import type { InsightsKelas, PelajarInsights } from "@/lib/insightsKelas";

/** UUID heksadesimal sahaja, selari semakan awal setiap laluan API. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Status sesi Live Quiz yang sah (skema qm_live_sessions). */
export const STATUS_SESI = ["lobby", "asking", "revealed", "ended"] as const;

/** Had senarai sesi: lalai 20, maksimum 100 (laluan /api/live/sessions). */
export const SESI_LIMIT_LALAI = 20;
export const SESI_LIMIT_MAKS = 100;

/** Had senarai pelajar markah kelas: lalai 200, maksimum 500. */
export const MARKAH_LIMIT_LALAI = 200;
export const MARKAH_LIMIT_MAKS = 500;

/** Susunan markah kelas yang sah (laluan /api/classes/[id]/scores). */
export const SUSUN_MARKAH = ["total", "task", "live", "name"] as const;

/** Had aksara CSV eksport Insights sebelum dipangkas (kira-kira 200 KB). */
export const CSV_MAKS_AKSARA = 200 * 1024;

/**
 * Bahagian yang boleh diminta pada alat get_class_insights. "attention"
 * ialah bendera perhatian pelajar (students.flags), "progress" ialah trend
 * markah sesi Live Quiz pelajar (students.trend).
 */
export const BAHAGIAN_ALAT_INSIGHTS = [
  "pulse",
  "attention",
  "distribution",
  "hard_questions",
  "hard_challenges",
  "progress",
  "teams",
] as const;
export type BahagianAlat = (typeof BAHAGIAN_ALAT_INSIGHTS)[number];

/**
 * Bahagian eksport CSV yang diterima laluan /api/classes/[id]/insights/export
 * (selari BAHAGIAN_INSIGHTS dalam src/lib/insightsKelas.ts).
 */
export const BAHAGIAN_EKSPORT = [
  "students",
  "attention",
  "questions",
  "challenges",
  "teams",
  "trend",
  "all",
] as const;

/** Sahkan satu argumen ialah UUID; tolak sebelum menyentuh rangkaian. */
export function sahkanUuid(nilai: unknown, nama: string): string {
  if (typeof nilai !== "string" || !UUID.test(nilai)) {
    throw new Error(`${nama} mesti UUID yang sah`);
  }
  return nilai;
}

/** Nilkan limit: bukan integer atau di bawah 1 jatuh ke lalai, di atas maks dipotong. */
export function hadLimit(n: unknown, lalai: number, maks: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : lalai;
  if (v < 1) return lalai;
  return Math.min(v, maks);
}

/* ============================================================
 * Pembungkus panggilan route laporan
 * ============================================================ */

/** list_live_sessions: senarai sesi kuiz yang pemanggil boleh urus. */
export async function senaraiSesiLangsung(
  accessToken: string,
  args: { class_id?: unknown; quiz_id?: unknown; status?: unknown; limit?: unknown }
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (args.class_id !== undefined && args.class_id !== null) {
    params.set("class_id", sahkanUuid(args.class_id, "class_id"));
  }
  if (args.quiz_id !== undefined && args.quiz_id !== null) {
    params.set("quiz_id", sahkanUuid(args.quiz_id, "quiz_id"));
  }
  if (args.status !== undefined && args.status !== null && args.status !== "") {
    if (typeof args.status !== "string" || !(STATUS_SESI as readonly string[]).includes(args.status)) {
      throw new Error(`status mesti salah satu daripada ${STATUS_SESI.join(", ")}`);
    }
    params.set("status", args.status);
  }
  params.set("limit", String(hadLimit(args.limit, SESI_LIMIT_LALAI, SESI_LIMIT_MAKS)));
  return callApi(accessToken, `/api/live/sessions?${params.toString()}`);
}

/** get_live_session_results: keputusan penuh satu sesi, semua pemain. */
export async function keputusanSesiLangsung(
  accessToken: string,
  sessionId: unknown
): Promise<Record<string, unknown>> {
  const id = sahkanUuid(sessionId, "session_id");
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    `/api/live/sessions/${id}/results`
  );
  return (res.data ?? res) as Record<string, unknown>;
}

/** get_class_scores: markah terkumpul pelajar dan pasukan satu kelas. */
export async function markahKelas(
  accessToken: string,
  args: { class_id: unknown; sort?: unknown; limit?: unknown }
): Promise<Record<string, unknown>> {
  const classId = sahkanUuid(args.class_id, "class_id");
  const params = new URLSearchParams();
  if (args.sort !== undefined && args.sort !== null && args.sort !== "") {
    if (typeof args.sort !== "string" || !(SUSUN_MARKAH as readonly string[]).includes(args.sort)) {
      throw new Error(`sort mesti salah satu daripada ${SUSUN_MARKAH.join(", ")}`);
    }
    params.set("sort", args.sort);
  }
  params.set("limit", String(hadLimit(args.limit, MARKAH_LIMIT_LALAI, MARKAH_LIMIT_MAKS)));
  const res = await callApi<Record<string, unknown>>(
    accessToken,
    `/api/classes/${classId}/scores?${params.toString()}`
  );
  return res;
}

/** get_student_scores: markah terperinci seorang peserta (laluan V2-013). */
export async function markahPelajar(
  accessToken: string,
  classId: unknown,
  userId: unknown
): Promise<Record<string, unknown>> {
  const idKelas = sahkanUuid(classId, "class_id");
  const idPengguna = sahkanUuid(userId, "user_id");
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    `/api/classes/${idKelas}/members/${idPengguna}/scores`
  );
  return (res.data ?? res) as Record<string, unknown>;
}

/** get_hunt_results: keputusan satu aktiviti (hunt) bagi kelas. */
export async function keputusanHunt(
  accessToken: string,
  classId: unknown,
  huntId: unknown
): Promise<Record<string, unknown>> {
  const idKelas = sahkanUuid(classId, "class_id");
  const idHunt = sahkanUuid(huntId, "hunt_id");
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    `/api/classes/${idKelas}/hunts/${idHunt}/results`
  );
  return (res.data ?? res) as Record<string, unknown>;
}

/**
 * Sahkan argumen `sections` alat insights: subset daripada
 * BAHAGIAN_ALAT_INSIGHTS; tiada argumen bermakna semua bahagian. Entri tidak
 * sah ditolak dengan senarai penuh supaya model boleh membetulkan sendiri.
 */
export function sahkanBahagianInsights(sections: unknown): BahagianAlat[] {
  if (sections === undefined || sections === null) {
    return [...BAHAGIAN_ALAT_INSIGHTS];
  }
  const senarai = Array.isArray(sections) ? sections : [sections];
  const sah: BahagianAlat[] = [];
  for (const b of senarai) {
    if (typeof b !== "string" || !(BAHAGIAN_ALAT_INSIGHTS as readonly string[]).includes(b)) {
      throw new Error(
        `sections tidak sah: ${JSON.stringify(b)}. Guna subset daripada ${BAHAGIAN_ALAT_INSIGHTS.join(", ")} atau tinggalkan kosong untuk semua`
      );
    }
    if (!sah.includes(b as BahagianAlat)) sah.push(b as BahagianAlat);
  }
  if (sah.length === 0) {
    throw new Error(`sections kosong. Guna subset daripada ${BAHAGIAN_ALAT_INSIGHTS.join(", ")}`);
  }
  return sah;
}

/** Baris perhatian pelajar: bendera tanpa medan berat. */
export interface BarisPerhatian {
  user_id: string;
  name: string | null;
  rank: number;
  flags: string[];
  last_active: string | null;
}

/** Titik trend ringkas bagi bahagian progress. */
export interface TitikTrendRingkas {
  played_at: string;
  score: number;
  pct: number | null;
}

/** Baris progress pelajar: trend markah sesi tanpa medan berat. */
export interface BarisProgress {
  user_id: string;
  name: string | null;
  trend: TitikTrendRingkas[];
}

/**
 * Tapis dan pangkas bahagian Insights di sisi alat. Had: attention maksimum
 * 200 pelajar, progress maksimum 50 pelajar (mengikut tiket), soalan dan
 * cabaran susar maksimum 50 setiap satu. `truncated: true` bila mana-mana
 * senarai dipotong.
 */
export const ATTENTION_MAKS = 200;
export const PROGRESS_MAKS = 50;
export const SUSAR_MAKS = 50;

export function tapisBahagianInsights(
  data: InsightsKelas,
  bahagian: readonly BahagianAlat[]
): { sections: Record<string, unknown>; truncated: boolean } {
  const hasil: Record<string, unknown> = {};
  let truncated = false;

  if (bahagian.includes("pulse")) {
    hasil.pulse = data.pulse;
  }
  if (bahagian.includes("attention")) {
    const semua: PelajarInsights[] = data.students ?? [];
    if (semua.length > ATTENTION_MAKS) truncated = true;
    hasil.attention = semua.slice(0, ATTENTION_MAKS).map((s) => ({
      user_id: s.user_id,
      name: s.name,
      rank: s.rank,
      flags: s.flags ?? [],
      last_active: s.last_active,
    })) as BarisPerhatian[];
  }
  if (bahagian.includes("distribution")) {
    hasil.distribution = data.distribution;
  }
  if (bahagian.includes("hard_questions")) {
    const senarai = data.hard_questions ?? [];
    if (senarai.length > SUSAR_MAKS) truncated = true;
    hasil.hard_questions = senarai.slice(0, SUSAR_MAKS);
  }
  if (bahagian.includes("hard_challenges")) {
    const senarai = data.hard_challenges ?? [];
    if (senarai.length > SUSAR_MAKS) truncated = true;
    hasil.hard_challenges = senarai.slice(0, SUSAR_MAKS);
  }
  if (bahagian.includes("progress")) {
    const semua: PelajarInsights[] = data.students ?? [];
    if (semua.length > PROGRESS_MAKS) truncated = true;
    hasil.progress = semua.slice(0, PROGRESS_MAKS).map((s) => ({
      user_id: s.user_id,
      name: s.name,
      trend: (s.trend ?? []).map((t) => ({
        played_at: t.played_at,
        score: t.score,
        pct: t.pct,
      })),
    })) as BarisProgress[];
  }
  if (bahagian.includes("teams")) {
    // member_ids dibuang: bilangan ahli sudah memadai untuk laporan dan
    // senarai UUID hanya menambah saiz hasil.
    hasil.teams = (data.teams ?? []).map((t) => ({
      team_id: t.team_id,
      name: t.name,
      members: t.members,
      total_score: t.total_score,
      avg_per_member: t.avg_per_member,
      top_member_share_pct: t.top_member_share_pct,
      zero_members: t.zero_members,
      flag_unbalanced: t.flag_unbalanced,
    }));
  }

  return { sections: hasil, truncated };
}

/** get_class_insights: Insights kelas (V2-014) dengan tapisan bahagian alat. */
export async function insightsKelasAlat(
  accessToken: string,
  args: { class_id: unknown; sections?: unknown }
): Promise<Record<string, unknown>> {
  const classId = sahkanUuid(args.class_id, "class_id");
  const bahagian = sahkanBahagianInsights(args.sections);
  const res = await callApi<{ data?: InsightsKelas } & Record<string, unknown>>(
    accessToken,
    `/api/classes/${classId}/insights`
  );
  const data = (res.data ?? res) as InsightsKelas;
  const tapis = tapisBahagianInsights(data, bahagian);
  return {
    class_id: classId,
    generated_at: data.generated_at,
    sections: tapis.sections,
    truncated: tapis.truncated,
  };
}

/**
 * export_class_insights_csv: eksport CSV Insights melalui laluan sedia ada.
 * Pulangkan { filename, csv, truncated }; CSV dipangkas pada had 200 KB.
 * Rekod audit insights_export laluan kekal berlaku di pelayan.
 */
export async function eksportInsightsCsv(
  accessToken: string,
  args: { class_id: unknown; sections: unknown }
): Promise<{ filename: string; csv: string; truncated: boolean }> {
  const classId = sahkanUuid(args.class_id, "class_id");
  if (!Array.isArray(args.sections) || args.sections.length === 0) {
    throw new Error(
      `sections diperlukan: senarai tidak kosong daripada ${BAHAGIAN_EKSPORT.join(", ")}`
    );
  }
  const sah: string[] = [];
  for (const b of args.sections) {
    if (typeof b !== "string" || !(BAHAGIAN_EKSPORT as readonly string[]).includes(b)) {
      throw new Error(
        `sections tidak sah: ${JSON.stringify(b)}. Guna ${BAHAGIAN_EKSPORT.join(", ")}`
      );
    }
    if (!sah.includes(b)) sah.push(b);
  }
  const res = await callApiText(
    accessToken,
    `/api/classes/${classId}/insights/export?sections=${encodeURIComponent(sah.join(","))}`
  );
  const truncated = res.text.length > CSV_MAKS_AKSARA;
  return {
    filename: res.filename ?? "kuizen-insights.csv",
    csv: truncated ? res.text.slice(0, CSV_MAKS_AKSARA) : res.text,
    truncated,
  };
}

/** get_class_engagement: ringkasan penglibatan (laluan analytics sedia ada). */
export async function engagementKelas(
  accessToken: string,
  classId: unknown
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (classId !== undefined && classId !== null && classId !== "") {
    params.set("class_id", sahkanUuid(classId, "class_id"));
  }
  const laluan = params.toString() ? `/api/analytics/engagement?${params.toString()}` : "/api/analytics/engagement";
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    laluan
  );
  return (res.data ?? res) as Record<string, unknown>;
}
