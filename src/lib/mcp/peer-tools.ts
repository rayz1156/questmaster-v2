// lib/mcp/peer-tools.ts
//
// Bantuan tulen untuk alat MCP penilaian rakan (peer review). Mengikut corak
// lib/mcp/live-quiz-tools.ts dan team-tools.ts: fail ini sengaja TIDAK
// mengimport session.ts atau db.ts supaya scripts/selftest-mcp-penilaian.ts
// boleh mengujinya dengan fetch tiruan tanpa pangkalan data.
//
// Semua operasi pergi melalui callApi ke laluan /api/classes/[id]/peer-rounds
// yang sudah ada (lihat header lib/mcp/api.ts): kebenaran pendidik kelas
// disemak di laluan itu (requireUser + semakPendidikKelas / pusinganPendidik),
// jadi tiada logik kebenaran disalin ke sini dan tiada admin() untuk tulisan.
//
// KERAHSIAAN: laluan results tidak pernah memilih rater_id ke dalam balasan
// (lihat results/route.ts), jadi alat ini menghantar balik apa yang laluan
// pulangkan tanpa memetakan semula apa-apa lajur.

import { callApi } from "./api";

/** Medan pusingan yang sah untuk penciptaan, selari badan POST laluan. */
export interface PeerRoundCreateInput {
  name?: unknown;
  opens_at?: unknown;
  closes_at?: unknown;
  week?: unknown;
}

/** Medan pusingan yang boleh dikemas kini, selari badan PATCH laluan. */
export interface PeerRoundUpdateInput {
  name?: unknown;
  week?: unknown;
  opens_at?: unknown;
  closes_at?: unknown;
}

/** Minggu mesti integer 1 hingga 52, selari pengesahan POST dan PATCH. */
export const PEER_WEEK_MIN = 1;
export const PEER_WEEK_MAX = 52;

/** Semak nombor minggu yang diberi; undefined/null bermakna tiada minggu. */
export function normalizeWeek(week: unknown): number | null | "tidak_sah" {
  if (week === undefined || week === null) return null;
  const n = Number(week);
  if (!Number.isInteger(n) || n < PEER_WEEK_MIN || n > PEER_WEEK_MAX) {
    return "tidak_sah";
  }
  return n;
}

/** Tarikh ISO yang boleh dihuraikan Date.parse; pulangkan null jika tidak sah. */
export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Sahkan argumen create_peer_round SEBELUM apa-apa panggilan rangkaian.
 * Badan POST laluan: {name, opens_at, closes_at, week?}; tarikh tutup
 * mesti selepas tarikh buka (semakan yang sama dibuat oleh route, tetapi
 * ralat awal mengelakkan panggilan yang pasti gagal).
 */
export function buildCreateRoundBody(
  args: PeerRoundCreateInput
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name) return { ok: false, error: "name diperlukan" };

  const opensAt = normalizeIsoDate(args.opens_at);
  if (!opensAt) return { ok: false, error: "opens_at mesti tarikh yang sah" };
  const closesAt = normalizeIsoDate(args.closes_at);
  if (!closesAt) return { ok: false, error: "closes_at mesti tarikh yang sah" };
  if (Date.parse(closesAt) <= Date.parse(opensAt)) {
    return { ok: false, error: "closes_at mesti selepas opens_at" };
  }

  const week = normalizeWeek(args.week);
  if (week === "tidak_sah") {
    return {
      ok: false,
      error: `week mesti integer ${PEER_WEEK_MIN} hingga ${PEER_WEEK_MAX}`,
    };
  }

  const body: Record<string, unknown> = { name, opens_at: opensAt, closes_at: closesAt };
  if (week !== null) body.week = week;
  return { ok: true, body };
}

/**
 * Bina badan PATCH update_peer_round daripada medan yang diberi sahaja.
 * Tarikh sebelah dibenarkan: route membandingkannya dengan nilai sedia ada.
 * Tiada medan bermakna ralat supaya panggilan kosong tidak kelihatan
 * berjaya tetapi tidak melakukan apa-apa.
 */
export function buildUpdateRoundBody(
  args: PeerRoundUpdateInput
): { ok: true; body: Record<string, unknown> } | { ok: false; error: string } {
  const patch: Record<string, unknown> = {};

  if (args.name !== undefined) {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    if (!name) return { ok: false, error: "name tidak boleh kosong" };
    patch.name = name;
  }
  if (args.week !== undefined) {
    const week = normalizeWeek(args.week);
    if (week === "tidak_sah" || week === null) {
      return {
        ok: false,
        error: `week mesti integer ${PEER_WEEK_MIN} hingga ${PEER_WEEK_MAX}`,
      };
    }
    patch.week = week;
  }
  if (args.opens_at !== undefined) {
    const opensAt = normalizeIsoDate(args.opens_at);
    if (!opensAt) return { ok: false, error: "opens_at mesti tarikh yang sah" };
    patch.opens_at = opensAt;
  }
  if (args.closes_at !== undefined) {
    const closesAt = normalizeIsoDate(args.closes_at);
    if (!closesAt) return { ok: false, error: "closes_at mesti tarikh yang sah" };
    patch.closes_at = closesAt;
  }
  if (patch.opens_at && patch.closes_at && Date.parse(String(patch.closes_at)) <= Date.parse(String(patch.opens_at))) {
    return { ok: false, error: "closes_at mesti selepas opens_at" };
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Tiada medan untuk dikemas kini" };
  }
  return { ok: true, body: patch };
}

/* ============================================================
 * Pembungkus panggilan route (dipanggil oleh handler dalam tools.ts)
 * ============================================================ */

/** Senarai pusingan penilaian rakan kelas, melalui GET laluan senarai. */
export async function listPeerRounds(
  accessToken: string,
  classId: string
): Promise<Record<string, unknown>> {
  if (!classId) throw new Error("class_id diperlukan");
  const res = await callApi<{ rounds?: Array<Record<string, unknown>> }>(
    accessToken,
    `/api/classes/${classId}/peer-rounds`
  );
  return { rounds: res.rounds ?? [] };
}

/** Cipta pusingan formatif baharu melalui POST laluan senarai. */
export async function createPeerRound(
  accessToken: string,
  classId: string,
  args: PeerRoundCreateInput
): Promise<Record<string, unknown>> {
  if (!classId) throw new Error("class_id diperlukan");
  const built = buildCreateRoundBody(args);
  if (!built.ok) throw new Error(built.error);
  const res = await callApi<{ round?: Record<string, unknown> }>(
    accessToken,
    `/api/classes/${classId}/peer-rounds`,
    { method: "POST", body: built.body }
  );
  return { round: res.round ?? null };
}

/** Kemas kini nama, minggu atau tarikh pusingan melalui PATCH. */
export async function updatePeerRound(
  accessToken: string,
  classId: string,
  roundId: string,
  args: PeerRoundUpdateInput
): Promise<Record<string, unknown>> {
  if (!classId) throw new Error("class_id diperlukan");
  if (!roundId) throw new Error("round_id diperlukan");
  const built = buildUpdateRoundBody(args);
  if (!built.ok) throw new Error(built.error);
  const res = await callApi<{ round?: Record<string, unknown> }>(
    accessToken,
    `/api/classes/${classId}/peer-rounds/${roundId}`,
    { method: "PATCH", body: built.body }
  );
  return { round: res.round ?? null };
}

/**
 * Jalankan pengiraan keputusan pusingan (RPC qm_peer_compute di dalam
 * route). Balasan route: {written: n}.
 */
export async function computePeerRound(
  accessToken: string,
  classId: string,
  roundId: string
): Promise<Record<string, unknown>> {
  if (!classId) throw new Error("class_id diperlukan");
  if (!roundId) throw new Error("round_id diperlukan");
  const res = await callApi<{ written?: number }>(
    accessToken,
    `/api/classes/${classId}/peer-rounds/${roundId}/compute`,
    { method: "POST" }
  );
  return { written: res.written ?? 0 };
}

/**
 * Papan pemuka keputusan pusingan: keputusan pelajar, justifikasi tanpa
 * nama penilai, dan senarai ahli yang belum menghantar. Identiti penilai
 * tidak pernah keluar daripada laluan, jadi tiada yang perlu ditapis di sini.
 */
export async function getPeerResults(
  accessToken: string,
  classId: string,
  roundId: string
): Promise<Record<string, unknown>> {
  if (!classId) throw new Error("class_id diperlukan");
  if (!roundId) throw new Error("round_id diperlukan");
  const res = await callApi<Record<string, unknown>>(
    accessToken,
    `/api/classes/${classId}/peer-rounds/${roundId}/results`
  );
  return res ?? {};
}

/**
 * Padam pusingan (hanya jika belum ada penilaian; route memulangkan 409
 * jika sudah ada). Memerlukan confirm: true, selari delete_live_question.
 */
export async function deletePeerRound(
  accessToken: string,
  classId: string,
  roundId: string,
  confirm: unknown
): Promise<{ deleted: true; round_id: string }> {
  if (!classId) throw new Error("class_id diperlukan");
  if (!roundId) throw new Error("round_id diperlukan");
  if (confirm !== true) throw new Error("Pemadaman memerlukan confirm: true");
  await callApi(accessToken, `/api/classes/${classId}/peer-rounds/${roundId}`, {
    method: "DELETE",
  });
  return { deleted: true, round_id: roundId };
}
