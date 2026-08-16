// lib/mcp/session.ts
// Menukar header Bearer daripada klien MCP kepada sesi Kuizen yang lengkap:
// pengguna, peranan, dan klien Supabase yang terikat RLS.

import { SupabaseClient } from "@supabase/supabase-js";
import { admin, adminPublic, asUser, clientWithToken } from "./db";
import { sha256, encrypt, decrypt } from "./crypto";
import { TABLES } from "./schema";

export type Role = "admin" | "educator" | "participant";

export interface McpSession {
  userId: string;
  email: string | null;
  role: Role;
  scope: string;
  clientId: string;
  db: SupabaseClient; // terikat kepada pengguna, RLS aktif
  /**
   * Access token Supabase pengguna semasa.
   *
   * Tool MCP memerlukan ini untuk memanggil route API Kuizen sebagai
   * pengguna itu sendiri, dan bukan menyalin semula logik perniagaan
   * route ke dalam tool.
   */
  accessToken: string;
}

export class AuthError extends Error {}

const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");
const EXPECTED_RESOURCE = `${BASE}/api/mcp`;

/**
 * Tentukan peranan pengguna daripada qm_profiles, iaitu sumber kebenaran
 * yang sama digunakan oleh app itu sendiri.
 *
 * Ini satu-satunya tempat service_role menyentuh jadual domain, kerana
 * penentuan peranan tidak boleh bergantung pada RLS yang ia sendiri
 * sepatutnya menguatkuasakan.
 *
 * `superadmin` dan `admin` dalam app kedua-duanya dipetakan kepada tahap
 * "admin" MCP. Pengguna yang digantung ditolak terus.
 */
async function resolveRole(userId: string): Promise<Role> {
  const { data, error } = await adminPublic()
    .from(TABLES.profiles)
    .select("role, suspended, approved")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Gagal secara senyap di sini bermakna setiap educator diturunkan pangkat
    // menjadi peserta tanpa amaran. Biasanya ini nama jadual yang salah
    // dalam lib/mcp/schema.ts.
    console.error(
      `[mcp] resolveRole gagal membaca ${TABLES.profiles}: ${error.message}. ` +
        `Sahkan TABLES dalam lib/mcp/schema.ts.`
    );
    throw new AuthError("Peranan tidak dapat ditentukan");
  }

  if (!data) throw new AuthError("Tiada profil Kuizen untuk akaun ini");
  if (data.suspended) throw new AuthError("Akaun ini digantung");

  switch (data.role) {
    case "superadmin":
    case "admin":
      return "admin";
    case "educator":
      return "educator";
    default:
      return "participant";
  }
}

/**
 * Sahkan token Bearer MCP dan bina sesi.
 * Melontar AuthError untuk sebarang kegagalan; pemanggil memetakan ini
 * kepada 401 dengan header WWW-Authenticate.
 */
export async function getSession(authHeader: string | null): Promise<McpSession> {
  const token = (authHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AuthError("Token akses tiada");

  const { data: row } = await admin()
    .from("tokens")
    .select("*")
    .eq("access_token_hash", sha256(token))
    .maybeSingle();

  if (!row) throw new AuthError("Token tidak sah");
  if (row.revoked_at) throw new AuthError("Token telah dibatalkan");
  if (new Date(row.expires_at).getTime() < Date.now()) throw new AuthError("Token sudah luput");

  // Pengikatan audience (RFC 8707). Token yang dikeluarkan untuk sumber lain
  // tidak boleh diterima di sini.
  if (row.resource && row.resource !== EXPECTED_RESOURCE) {
    throw new AuthError("Token tidak terikat kepada pelayan ini");
  }

  let db: SupabaseClient;
  let userId: string;
  let email: string | null;
  let accessToken: string;

  // Jalan pantas: access token Supabase yang di-cache masih sah.
  // Ini mengelakkan pemutaran refresh token pada setiap permintaan MCP,
  // yang akan berlumba antara panggilan serentak.
  const cachedValid =
    row.sb_access_token &&
    row.sb_access_expires_at &&
    new Date(row.sb_access_expires_at).getTime() > Date.now() + 60_000;

  if (cachedValid) {
    accessToken = decrypt(row.sb_access_token);
    db = clientWithToken(accessToken);
    const { data: u } = await db.auth.getUser();
    if (!u?.user) throw new AuthError("Sesi asas tidak sah");
    userId = u.user.id;
    email = u.user.email ?? null;
  } else {
    let refreshed;
    try {
      refreshed = await asUser(decrypt(row.sb_refresh_token));
    } catch {
      // Refresh token Supabase mati: pengguna perlu menyambung semula.
      await admin()
        .from("tokens")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", row.id);
      throw new AuthError("Sesi asas telah tamat, sila sambung semula");
    }

    db = refreshed.client;
    userId = refreshed.userId;
    email = refreshed.email;
    accessToken = refreshed.accessToken;

    await admin()
      .from("tokens")
      .update({
        sb_refresh_token: encrypt(refreshed.newRefreshToken),
        sb_access_token: encrypt(refreshed.accessToken),
        sb_access_expires_at: new Date(refreshed.expiresAt * 1000).toISOString(),
        last_used_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }

  // Identiti yang diselesaikan mesti sepadan dengan pemilik token yang
  // direkodkan. Tanpa semakan ini, sesiapa yang berjaya menyuntik refresh
  // token orang lain akan menjalankan pertanyaan sebagai mangsa sementara
  // audit menunjukkan nama mereka sendiri.
  if (userId !== row.user_id) {
    await admin()
      .from("tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", row.id);
    throw new AuthError("Ketidakpadanan identiti token");
  }

  return {
    userId,
    email,
    role: await resolveRole(userId),
    scope: row.scope,
    clientId: row.client_id,
    db,
    accessToken,
  };
}

/** Adakah skop ini membenarkan operasi tulis? Padanan token penuh, bukan substring. */
export function canWrite(session: McpSession): boolean {
  return session.scope.split(/\s+/).includes("kuizen:write");
}
