// lib/mcp/challenge-tools.ts
//
// Bantuan tulen untuk alat MCP kemas kini dan padam challenge. Mengikut
// corak lib/mcp/live-quiz-tools.ts: tiada import session.ts atau db.ts,
// klien terikat RLS dihantar masuk sebagai parameter supaya
// scripts/selftest-mcp-kumpulan.ts boleh mengujinya dengan tiruan.
//
// Tiada route API untuk challenge, jadi tulisan pergi terus melalui klien
// RLS seperti create_challenge sedia ada dalam tools.ts. Semakan pemilik
// hunt dikuatkuasakan oleh RLS (dasar p_chal_owner), dan pembacaan lajur
// `answer` dikekang oleh pemilihan lajur eksplisit di sini.

/** Kolum SELECT untuk semakan kewujudan; tiada `answer`. */
export const CHALLENGE_CHECK_COLUMNS = "id, hunt_id, title";

export interface ChallengeUpdateInput {
  challenge_id?: unknown;
  title?: unknown;
  prompt?: unknown;
  answer?: unknown;
  points?: unknown;
  order_idx?: unknown;
}

/** Had mata dan susunan, selari SKB challenge (points int, order_idx int). */
export const CHALLENGE_POINTS_MIN = 0;
export const CHALLENGE_POINTS_MAX = 1_000_000;
export const CHALLENGE_ORDER_MIN = 0;
export const CHALLENGE_ORDER_MAX = 100_000;

type Ok<T> = { ok: true; value: T };
type Err = { ok: false; error: string };

/** Sahkan satu integer TEPAT (bukan perpuluhan) dalam julat. */
function intInRange(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n >= min && n <= max ? n : null;
}

/**
 * Normalkan badan PATCH update_challenge. Hanya medan yang diberi dikira;
 * tiada medan bermakna ralat supaya panggilan kosong tidak kelihatan
 * berjaya tetapi tidak melakukan apa-apa.
 */
export function buildChallengePatch(args: ChallengeUpdateInput): Err | Ok<Record<string, unknown>> {
  const patch: Record<string, unknown> = {};

  if (args.title !== undefined) {
    if (typeof args.title !== "string" || !args.title.trim()) {
      return { ok: false, error: "title tidak boleh kosong" };
    }
    patch.title = args.title.trim();
  }
  if (args.prompt !== undefined) {
    if (typeof args.prompt !== "string" || !args.prompt.trim()) {
      return { ok: false, error: "prompt tidak boleh kosong" };
    }
    patch.prompt = args.prompt.trim();
  }
  if (args.answer !== undefined) {
    if (typeof args.answer !== "string") {
      return { ok: false, error: "answer mesti string" };
    }
    patch.answer = args.answer.trim();
  }
  if (args.points !== undefined) {
    const p = intInRange(args.points, CHALLENGE_POINTS_MIN, CHALLENGE_POINTS_MAX);
    if (p === null) {
      return {
        ok: false,
        error: `points mesti integer ${CHALLENGE_POINTS_MIN} hingga ${CHALLENGE_POINTS_MAX}`,
      };
    }
    patch.points = p;
  }
  if (args.order_idx !== undefined) {
    const o = intInRange(args.order_idx, CHALLENGE_ORDER_MIN, CHALLENGE_ORDER_MAX);
    if (o === null) {
      return {
        ok: false,
        error: `order_idx mesti integer ${CHALLENGE_ORDER_MIN} hingga ${CHALLENGE_ORDER_MAX}`,
      };
    }
    patch.order_idx = o;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "Tiada medan untuk dikemas kini" };
  }
  return { ok: true, value: patch };
}

/**
 * Antara muka minimum klien terikat RLS yang diperlukan oleh kedua dua
 * fungsi di bawah. SupabaseClient memenuhinya; selftest membekalkan tiruan.
 */
export interface RlsLikeClient {
  from(table: string): any;
}

/**
 * Kemas kini challenge melalui klien terikat RLS. Jawapan hanya boleh
 * ditulis oleh pemilik hunt (RLS menolak orang lain secara senyap, jadi
 * bilangan baris yang dikemas kini disemak dan sifar dianggap tiada akses).
 * Baris dikembalikan dengan CHALLENGE_CHECK_COLUMNS; alat MCP tidak pernah
 * memulangkan `answer` semula selepas tulis, walaupun kepada staf.
 */
export async function updateChallenge(
  db: RlsLikeClient,
  args: ChallengeUpdateInput
): Promise<Record<string, unknown>> {
  const challengeId = typeof args.challenge_id === "string" ? args.challenge_id.trim() : "";
  if (!challengeId) throw new Error("challenge_id diperlukan");

  const patch = buildChallengePatch(args);
  if (!patch.ok) throw new Error(patch.error);

  // Baris mesti kelihatan melalui RLS dahulu; kalau tidak, tiada akses.
  const getRes = await db
    .from("qm_challenges")
    .select(CHALLENGE_CHECK_COLUMNS)
    .eq("id", challengeId)
    .maybeSingle();
  if (getRes?.error) throw new Error(`Dapatkan challenge gagal: ${getRes.error.message}`);
  if (!getRes?.data) {
    throw new Error("Challenge tidak dijumpai atau anda tiada akses kepadanya");
  }

  const updRes = await db
    .from("qm_challenges")
    .update(patch.value)
    .eq("id", challengeId)
    .select(CHALLENGE_CHECK_COLUMNS);
  if (updRes?.error) throw new Error(`Kemas kini challenge gagal: ${updRes.error.message}`);
  const rows = Array.isArray(updRes?.data) ? updRes.data : [];
  if (rows.length !== 1) {
    throw new Error(
      "Kemas kini tidak berlaku (RLS menolak atau challenge sudah tiada). " +
        "Hanya pemilik hunt atau admin boleh mengubah challenge."
    );
  }
  return rows[0];
}

/**
 * Padam challenge. Memerlukan confirm: true, selaras delete_live_question.
 * Semua penghantaran yang dipautkan turut terpadam kerana kunci asing
 * on delete cascade; mesej ralat menyebutnya supaya model sedar.
 */
export async function deleteChallenge(
  db: RlsLikeClient,
  challengeId: string,
  confirm: unknown
): Promise<{ deleted: true; challenge_id: string }> {
  if (!challengeId) throw new Error("challenge_id diperlukan");
  if (confirm !== true) throw new Error("Pemadaman memerlukan confirm: true");

  const getRes = await db
    .from("qm_challenges")
    .select(CHALLENGE_CHECK_COLUMNS)
    .eq("id", challengeId)
    .maybeSingle();
  if (getRes?.error) throw new Error(`Dapatkan challenge gagal: ${getRes.error.message}`);
  if (!getRes?.data) {
    throw new Error("Challenge tidak dijumpai atau anda tiada akses kepadanya");
  }

  const delRes = await db.from("qm_challenges").delete().eq("id", challengeId);
  if (delRes?.error) throw new Error(`Padam challenge gagal: ${delRes.error.message}`);
  // Tanpa .select(), RLS yang menolak tidak kelihatan pada hasil; semakan
  // kewujudan di atas dengan .maybeSingle() sudah mengatasi kes itu.
  return { deleted: true, challenge_id: challengeId };
}
