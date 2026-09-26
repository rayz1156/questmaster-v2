// lib/mcp/live-quiz-tools.ts
//
// Bantuan tulen untuk alat MCP Kuiz Langsung. Semua logik tulis memanggil
// route /api/live/** melalui callApi (lihat header lib/mcp/api.ts: jangan
// salin logik route ke dalam tool). Fail ini sengaja TIDAK mengimport
// session.ts atau db.ts supaya scripts/selftest-mcp-live-quiz.ts boleh
// mengujinya dengan mock tanpa pangkalan data.

import { callApi } from "./api";
import { validateOptions, parseQuizCsv, parseAiken } from "@/lib/live-quiz";

/** Had soalan per panggilan, selari had import CSV (QUIZ_CSV_MAX_QUESTIONS). */
export const LIVE_MAX_QUESTIONS_PER_CALL = 100;

/** Sempadan medan soalan, selari pengesahan import CSV dalam lib/live-quiz. */
export const LIVE_POINTS_MIN = 1;
export const LIVE_POINTS_MAX = 10000;
export const LIVE_TIME_MIN = 5;
export const LIVE_TIME_MAX = 300;

export interface LiveOption {
  key: string;
  text: string;
}

export interface LiveQuestionInput {
  prompt?: unknown;
  options?: unknown;
  option_texts?: unknown;
  correct_key?: unknown;
  points?: unknown;
  time_limit_sec?: unknown;
  use_countdown?: unknown;
  double_points?: unknown;
}

export interface NormalizedLiveQuestion {
  prompt: string;
  options: LiveOption[];
  correct_key: string;
  points: number;
  time_limit_sec: number;
  use_countdown: boolean;
  double_points: boolean;
}

/** Indeks huruf pilihan: 0 -> A, 1 -> B, dan seterusnya. */
function optionKey(i: number): string {
  return String.fromCharCode(65 + i);
}

/**
 * Sahkan dan normalkan satu input soalan daripada klien MCP. Betul-betul
 * menolak (bukan membetulkan secara senyap) supaya model nampak sebabnya,
 * tetapi memetakan dua bentuk input: `options` [{key,text}] atau
 * `option_texts` ["..", ".."] dengan kunci A..F dijana sendiri.
 */
export function normalizeLiveQuestion(
  q: LiveQuestionInput,
  index: number
): { ok: true; value: NormalizedLiveQuestion } | { ok: false; error: string } {
  const label = `soalan ${index + 1}`;

  const prompt = typeof q.prompt === "string" ? q.prompt.trim() : "";
  if (!prompt) return { ok: false, error: `${label}: teks soalan diperlukan (prompt)` };

  // Bentuk input: option_texts (senarai teks) diutamakan; jika tiada, guna options.
  let options: unknown = q.options;
  if (Array.isArray(q.option_texts)) {
    const texts = q.option_texts.map((t) => (typeof t === "string" ? t.trim() : ""));
    options = texts.map((text, i) => ({ key: optionKey(i), text }));
  }

  const checked = validateOptions(options);
  if (!checked.ok) {
    return { ok: false, error: `${label}: ${checked.error}` };
  }
  const opts = options as LiveOption[];
  const keys = checked.keys as string[];

  const rawKey = typeof q.correct_key === "string" ? q.correct_key.trim().toUpperCase() : "";
  if (!rawKey || !keys.includes(rawKey)) {
    return {
      ok: false,
      error: `${label}: correct_key mesti salah satu daripada kunci pilihan (${keys.join(", ")})`,
    };
  }

  const num = (v: unknown, min: number, max: number): number | null => {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const f = Math.floor(n);
    return f >= min && f <= max ? f : null;
  };

  let points = 1000;
  if (q.points !== undefined && q.points !== null) {
    const p = num(q.points, LIVE_POINTS_MIN, LIVE_POINTS_MAX);
    if (p === null) {
      return { ok: false, error: `${label}: points mesti integer ${LIVE_POINTS_MIN} hingga ${LIVE_POINTS_MAX}` };
    }
    points = p;
  }

  let timeLimitSec = 20;
  if (q.time_limit_sec !== undefined && q.time_limit_sec !== null) {
    const t = num(q.time_limit_sec, LIVE_TIME_MIN, LIVE_TIME_MAX);
    if (t === null) {
      return { ok: false, error: `${label}: time_limit_sec mesti integer ${LIVE_TIME_MIN} hingga ${LIVE_TIME_MAX}` };
    }
    timeLimitSec = t;
  }

  return {
    ok: true,
    value: {
      prompt,
      options: opts,
      correct_key: rawKey,
      points,
      time_limit_sec: timeLimitSec,
      use_countdown: q.use_countdown === undefined ? true : q.use_countdown !== false,
      double_points: q.double_points === true,
    },
  };
}

/** Sahkan senarai soalan daripada add_live_questions. Semua atau tiada. */
export function normalizeLiveQuestionList(
  list: unknown
): { ok: true; value: NormalizedLiveQuestion[] } | { ok: false; error: string } {
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, error: "questions mesti senarai tidak kosong" };
  }
  if (list.length > LIVE_MAX_QUESTIONS_PER_CALL) {
    return {
      ok: false,
      error: `questions melebihi had ${LIVE_MAX_QUESTIONS_PER_CALL} soalan setiap panggilan`,
    };
  }
  const out: NormalizedLiveQuestion[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = normalizeLiveQuestion(list[i] as LiveQuestionInput, i);
    if (!r.ok) return { ok: false, error: r.error };
    out.push(r.value);
  }
  return { ok: true, value: out };
}

export type LiveImportFormat = "csv" | "aiken";
export type LiveImportMode = "preview" | "commit";

/** Kandungan import maksimum, selari route import-csv (QUIZ_CSV_MAX_BYTES). */
export const LIVE_IMPORT_MAX_BYTES = 500_000;

/** Sahkan argumen import_live_questions sebelum apa-apa dihuraikan. */
export function parseImportArgs(
  args: any
): { ok: true; format: LiveImportFormat; mode: LiveImportMode; content: string }
| { ok: false; error: string } {
  const format = args?.format === "aiken" ? "aiken" : args?.format === "csv" ? "csv" : null;
  if (!format) return { ok: false, error: "format mesti csv atau aiken" };
  const mode = args?.mode === "commit" ? "commit" : "preview";
  if (args?.mode !== undefined && args.mode !== "preview" && args.mode !== "commit") {
    return { ok: false, error: "mode mesti preview atau commit" };
  }
  if (typeof args?.content !== "string" || !args.content.trim()) {
    return { ok: false, error: "content (teks CSV atau Aiken) diperlukan" };
  }
  if (args.content.length > LIVE_IMPORT_MAX_BYTES) {
    return { ok: false, error: "content terlalu besar, had kira-kira 500 KB" };
  }
  return { ok: true, format, mode, content: args.content };
}

export type LiveControlAction = "start" | "next" | "reveal" | "end" | "reset";

/**
 * Tindakan kawalan sesi yang sah. `end` dan `reset` memusnahkan keadaan sesi
 * (reset memadam SEMUA jawapan), jadi kedua-duanya memerlukan confirm: true.
 * Tiket menuntut confirm untuk end; reset diberi perlindungan sama kerana
 * ia tidak boleh dibuat asal.
 */
export const LIVE_CONTROL_ACTIONS: LiveControlAction[] = ["start", "next", "reveal", "end", "reset"];

/** Sahkan tindakan kawalan dan bendera confirm. */
export function checkControlArgs(
  args: any
): { ok: true; action: LiveControlAction } | { ok: false; error: string } {
  const action = args?.action as LiveControlAction;
  if (!LIVE_CONTROL_ACTIONS.includes(action)) {
    return { ok: false, error: `action mesti salah satu daripada ${LIVE_CONTROL_ACTIONS.join(", ")}` };
  }
  if ((action === "end" || action === "reset") && args?.confirm !== true) {
    return { ok: false, error: `action ${action} memerlukan confirm: true` };
  }
  return { ok: true, action };
}

/** Pautan sertai dan pautan QR bagi kod sesi, di atas URL awam pelayan. */
export function liveSessionLinks(code: string): { join_url: string; qr_url: string } {
  const base = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");
  return {
    join_url: `${base}/live/${code}`,
    qr_url: `${base}/api/live/qr?code=${code}`,
  };
}

/* ============================================================
 * Pembungkus panggilan route (dipanggil oleh handler dalam tools.ts)
 * ============================================================ */

/** Cipta kuiz langsung, kemudian PATCH streak_bonus jika diberi (route cipta tidak terimanya). */
export async function createLiveQuiz(
  accessToken: string,
  args: { class_id?: string; title?: string; description?: string; streak_bonus?: boolean }
): Promise<Record<string, unknown>> {
  if (typeof args.title !== "string" || !args.title.trim()) {
    throw new Error("title diperlukan");
  }
  if (args.class_id !== undefined && args.class_id !== null && typeof args.class_id !== "string") {
    throw new Error("class_id mesti string atau ditinggalkan untuk kuiz peribadi");
  }
  const created = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    "/api/live/quizzes",
    {
      method: "POST",
      body: {
        classId: args.class_id ?? null,
        title: args.title,
        description: typeof args.description === "string" ? args.description : undefined,
      },
    }
  );
  const quiz = (created.data ?? created) as Record<string, unknown>;
  if (typeof args.streak_bonus === "boolean" && quiz.id) {
    const patched = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
      accessToken,
      `/api/live/quizzes/${quiz.id}`,
      { method: "PATCH", body: { streak_bonus: args.streak_bonus } }
    );
    return (patched.data ?? patched) as Record<string, unknown>;
  }
  return quiz;
}

/** Tambah banyak soalan: sahkan SEMUA dahulu, kemudian POST satu per satu. */
export async function addLiveQuestions(
  accessToken: string,
  quizId: string,
  questions: unknown
): Promise<{ added: number; question_ids: string[] }> {
  const norm = normalizeLiveQuestionList(questions);
  if (!norm.ok) throw new Error(norm.error);
  const ids: string[] = [];
  for (const q of norm.value) {
    const res = await callApi<{ data?: { id?: string } }>(accessToken, `/api/live/quizzes/${quizId}/questions`, {
      method: "POST",
      body: q,
    });
    const id = res?.data?.id ?? (res as { id?: string })?.id;
    if (id) ids.push(id);
  }
  return { added: ids.length, question_ids: ids };
}

/** Kemas kini soalan. Hanya medan yang diberi dihantar ke route PATCH. */
export async function updateLiveQuestion(
  accessToken: string,
  questionId: string,
  args: LiveQuestionInput & Record<string, unknown>
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = {};

  if (typeof args.prompt === "string") {
    if (!args.prompt.trim()) throw new Error("prompt tidak boleh kosong");
    body.prompt = args.prompt.trim();
  }
  if (args.options !== undefined) {
    const checked = validateOptions(args.options);
    if (!checked.ok) throw new Error(checked.error as string);
    body.options = args.options;
  }
  if (args.correct_key !== undefined) {
    if (typeof args.correct_key !== "string") throw new Error("correct_key mesti string");
    body.correct_key = args.correct_key.trim().toUpperCase();
  }
  if (args.points !== undefined) {
    const n = Math.floor(Number(args.points));
    if (!Number.isFinite(n) || n < LIVE_POINTS_MIN || n > LIVE_POINTS_MAX) {
      throw new Error(`points mesti integer ${LIVE_POINTS_MIN} hingga ${LIVE_POINTS_MAX}`);
    }
    body.points = n;
  }
  if (args.time_limit_sec !== undefined) {
    const n = Math.floor(Number(args.time_limit_sec));
    if (!Number.isFinite(n) || n < LIVE_TIME_MIN || n > LIVE_TIME_MAX) {
      throw new Error(`time_limit_sec mesti integer ${LIVE_TIME_MIN} hingga ${LIVE_TIME_MAX}`);
    }
    body.time_limit_sec = n;
  }
  if (args.use_countdown !== undefined) {
    if (typeof args.use_countdown !== "boolean") throw new Error("use_countdown mesti true atau false");
    body.use_countdown = args.use_countdown;
  }
  if (args.double_points !== undefined) {
    if (typeof args.double_points !== "boolean") throw new Error("double_points mesti true atau false");
    body.double_points = args.double_points;
  }

  if (Object.keys(body).length === 0) throw new Error("Tiada medan untuk dikemas kini");
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    `/api/live/questions/${questionId}`,
    { method: "PATCH", body }
  );
  return (res.data ?? res) as Record<string, unknown>;
}

/** Padam soalan. Perlukan confirm: true, selaras tiket. */
export async function deleteLiveQuestion(
  accessToken: string,
  questionId: string,
  confirm: unknown
): Promise<{ deleted: true; question_id: string }> {
  if (confirm !== true) throw new Error("Pemadaman memerlukan confirm: true");
  await callApi(accessToken, `/api/live/questions/${questionId}`, { method: "DELETE" });
  return { deleted: true, question_id: questionId };
}

/** Mula sesi baharu dan pulangkan kod, pautan sertai dan pautan QR. */
export async function startLiveSession(
  accessToken: string,
  quizId: string
): Promise<Record<string, unknown>> {
  const res = await callApi<{ data?: { sessionId?: string; code?: string } }>(
    accessToken,
    `/api/live/quizzes/${quizId}/sessions`,
    { method: "POST" }
  );
  const data = res?.data ?? (res as unknown as { sessionId?: string; code?: string });
  const links = liveSessionLinks(String(data?.code ?? ""));
  return {
    session_id: data?.sessionId ?? null,
    code: data?.code ?? null,
    status: "lobby",
    join_url: links.join_url,
    qr_url: links.qr_url,
  };
}

/** Kawal sesi: mula, soalan seterusnya, tunjuk jawapan, tamat atau set semula. */
export async function controlLiveSession(
  accessToken: string,
  sessionId: string,
  args: any
): Promise<Record<string, unknown>> {
  const checked = checkControlArgs(args);
  if (!checked.ok) throw new Error(checked.error);
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    `/api/live/sessions/${sessionId}/control`,
    { method: "POST", body: { action: checked.action } }
  );
  const data = (res.data ?? res) as Record<string, unknown>;
  const code = typeof data.code === "string" ? data.code : null;
  return { ...data, session_id: data.id ?? sessionId, ...(code ? liveSessionLinks(code) : {}) };
}

/**
 * Import soalan daripada teks CSV atau Aiken.
 * mode preview: huraikan secara tempatan sahaja, TIADA tulisan ke pangkalan
 * data. mode commit: serahkan teks asal kepada route import (semua-atau-tiada
 * untuk CSV, Aiken melangkau blok rosak). Penghuraian kekal dalam
 * lib/live-quiz, satu sumber sahaja.
 */
export async function importLiveQuestions(
  accessToken: string,
  quizId: string,
  args: any
): Promise<Record<string, unknown>> {
  const parsed = parseImportArgs(args);
  if (!parsed.ok) throw new Error(parsed.error);

  if (parsed.mode === "preview") {
    if (parsed.format === "csv") {
      const { questions, errors } = parseQuizCsv(parsed.content);
      return {
        mode: "preview",
        format: "csv",
        question_count: questions.length,
        errors,
        questions: questions.map((q, i) => ({ index: i + 1, ...q })),
        note: "CSV bersifat semua-atau-tiada: commit hanya berlaku jika tiada ralat.",
      };
    }
    const { questions, skipped } = parseAiken(parsed.content);
    return {
      mode: "preview",
      format: "aiken",
      question_count: questions.length,
      skipped,
      questions: questions.map((q, i) => ({ index: i + 1, ...q })),
      note: "Blok Aiken yang rosak dilangkau semasa commit, bukan membatalkan import.",
    };
  }

  // commit: panggil route sedia ada supaya logik sisipan kekal satu tempat.
  const path =
    parsed.format === "csv"
      ? `/api/live/quizzes/${quizId}/import-csv`
      : `/api/live/quizzes/${quizId}/import-aiken`;
  const res = await callApi<{ data?: Record<string, unknown> } & Record<string, unknown>>(
    accessToken,
    path,
    { method: "POST", body: { content: parsed.content } }
  );
  return { mode: "commit", format: parsed.format, ...(res.data ?? res) } as Record<string, unknown>;
}
