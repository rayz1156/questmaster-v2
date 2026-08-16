// lib/mcp/crypto.ts
// Utiliti kriptografi untuk lapisan OAuth MCP.
// Tiada rahsia mentah disimpan dalam DB: token di-hash, refresh token Supabase disulit.

import crypto from "crypto";

/** sha256 -> base64url. Digunakan untuk hash token dan kod kebenaran. */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

/** Rentetan rawak selamat untuk token / kod / client_id. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Perbandingan masa-tetap untuk elak timing attack. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Pengesahan PKCE (RFC 7636). Kami hanya menyokong S256, bukan "plain".
 * OAuth 2.1 mewajibkan PKCE untuk semua public client.
 */
export function verifyPkce(
  verifier: string,
  challenge: string,
  method: string
): boolean {
  if (method !== "S256") return false;
  return safeEqual(sha256(verifier), challenge);
}

// ---------------------------------------------------------------------------
// Penyulitan simetri untuk refresh token Supabase yang disimpan dalam DB.
// MCP_ENCRYPTION_KEY mesti 32 bait dalam bentuk hex (64 aksara).
// Jana dengan: openssl rand -hex 32
// ---------------------------------------------------------------------------

function key(): Buffer {
  const raw = process.env.MCP_ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      "MCP_ENCRYPTION_KEY hilang atau salah panjang. Jana dengan: openssl rand -hex 32"
    );
  }
  return Buffer.from(raw, "hex");
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Ciphertext tidak sah");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
