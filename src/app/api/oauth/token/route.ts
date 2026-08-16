// app/api/oauth/token/route.ts
// Pertukaran token: authorization_code dan refresh_token.

import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/mcp/db";
import { randomToken, sha256, verifyPkce, safeEqual } from "@/lib/mcp/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACCESS_TTL = 60 * 60;
const REFRESH_TTL = 60 * 60 * 24 * 30;
const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

function fail(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status, headers: CORS });
}

async function readParams(req: NextRequest): Promise<Record<string, string> | null> {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      return (await req.json()) as Record<string, string>;
    }
    const form = await req.formData();
    const obj: Record<string, string> = {};
    form.forEach((v, k) => { obj[k] = String(v); });
    return obj;
  } catch {
    return null;
  }
}

async function authenticateClient(clientId: string, providedSecret?: string) {
  const { data: client } = await admin()
    .from("oauth_clients")
    .select("client_id, client_secret_hash, redirect_uris, token_endpoint_auth_method")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!client) return { ok: false as const };

  if (client.client_secret_hash) {
    if (!providedSecret || !safeEqual(sha256(providedSecret), client.client_secret_hash)) {
      return { ok: false as const };
    }
  }
  return { ok: true as const, client };
}

async function issueTokens(opts: {
  familyId?: string;
  clientId: string;
  userId: string;
  scope: string;
  resource: string | null;
  sbRefreshTokenEncrypted: string;
}) {
  const accessToken = randomToken(32);
  const refreshToken = randomToken(32);
  const now = Date.now();

  const row: Record<string, unknown> = {
    access_token_hash: sha256(accessToken),
    refresh_token_hash: sha256(refreshToken),
    client_id: opts.clientId,
    user_id: opts.userId,
    scope: opts.scope,
    resource: opts.resource,
    sb_refresh_token: opts.sbRefreshTokenEncrypted,
    expires_at: new Date(now + ACCESS_TTL * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL * 1000).toISOString(),
  };
  if (opts.familyId) row.family_id = opts.familyId;

  const { error } = await admin().from("tokens").insert(row);
  if (error) throw new Error(error.message);

  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TTL,
    refresh_token: refreshToken,
    scope: opts.scope,
  };
}

export async function POST(req: NextRequest) {
  const p = await readParams(req);
  if (!p) return fail("invalid_request", "Badan permintaan tidak boleh dihuraikan");

  const grantType = p.grant_type;
  const clientId = p.client_id;

  if (!clientId) return fail("invalid_client", "client_id diperlukan");

  const auth = await authenticateClient(clientId, p.client_secret);
  if (!auth.ok) return fail("invalid_client", "Pengesahan klien gagal", 401);

  if (grantType === "authorization_code") {
    const { code, redirect_uri, code_verifier } = p;

    if (!code || !redirect_uri || !code_verifier) {
      return fail("invalid_request", "code, redirect_uri dan code_verifier diperlukan");
    }

    const codeHash = sha256(code);

    // Tuntut kod secara ATOM: dua pertukaran serentak hanya boleh
    // menghasilkan satu pemenang.
    const { data: claimedRows, error: claimErr } = await admin()
      .from("auth_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("code_hash", codeHash)
      .is("consumed_at", null)
      .select("*");

    if (claimErr) {
      console.error("[mcp/token] gagal menuntut kod:", claimErr.message);
      return fail("server_error", "Pertukaran kod gagal", 500);
    }

    if (!claimedRows || claimedRows.length === 0) {
      // Kod sudah digunakan dianggap dicuri: batalkan semua yang terhasil.
      const { data: existing } = await admin()
        .from("auth_codes")
        .select("user_id, client_id")
        .eq("code_hash", codeHash)
        .maybeSingle();

      if (existing) {
        await admin()
          .from("tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("user_id", existing.user_id)
          .eq("client_id", existing.client_id)
          .is("revoked_at", null);
      }
      return fail("invalid_grant", "Kod tidak sah atau sudah digunakan");
    }

    const row = claimedRows[0];

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return fail("invalid_grant", "Kod sudah luput");
    }
    if (row.client_id !== clientId) return fail("invalid_grant", "Kod milik klien lain");
    if (row.redirect_uri !== redirect_uri) return fail("invalid_grant", "redirect_uri tidak sepadan");

    if (row.resource && p.resource && p.resource !== row.resource) {
      return fail("invalid_target", "resource tidak sepadan dengan permintaan kebenaran");
    }

    if (!verifyPkce(code_verifier, row.code_challenge, row.code_challenge_method)) {
      return fail("invalid_grant", "Pengesahan PKCE gagal");
    }

    try {
      const tokens = await issueTokens({
        clientId,
        userId: row.user_id,
        scope: row.scope,
        resource: row.resource ?? `${BASE}/api/mcp`,
        sbRefreshTokenEncrypted: row.sb_refresh_token,
      });
      return NextResponse.json(tokens, { headers: CORS });
    } catch (e: any) {
      console.error("[mcp/token] gagal mengeluarkan token:", e.message);
      return fail("server_error", "Gagal mengeluarkan token", 500);
    }
  }

  if (grantType === "refresh_token") {
    const { refresh_token } = p;
    if (!refresh_token) return fail("invalid_request", "refresh_token diperlukan");

    const hash = sha256(refresh_token);

    const { data: rotated, error: rotateErr } = await admin()
      .from("tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("refresh_token_hash", hash)
      .is("revoked_at", null)
      .select("*");

    if (rotateErr) {
      console.error("[mcp/token] gagal memutar:", rotateErr.message);
      return fail("server_error", "Gagal memutar token", 500);
    }

    if (!rotated || rotated.length === 0) {
      // Penggunaan semula menandakan kebocoran: batalkan keseluruhan keluarga.
      const { data: stale } = await admin()
        .from("tokens")
        .select("family_id")
        .eq("refresh_token_hash", hash)
        .maybeSingle();

      if (stale?.family_id) {
        await admin()
          .from("tokens")
          .update({ revoked_at: new Date().toISOString() })
          .eq("family_id", stale.family_id)
          .is("revoked_at", null);
      }
      return fail("invalid_grant", "Refresh token tidak sah atau sudah digunakan");
    }

    const row = rotated[0];

    if (row.client_id !== clientId) return fail("invalid_grant", "Token milik klien lain");
    if (row.refresh_expires_at && new Date(row.refresh_expires_at).getTime() < Date.now()) {
      return fail("invalid_grant", "Refresh token sudah luput");
    }

    try {
      const tokens = await issueTokens({
        familyId: row.family_id,
        clientId,
        userId: row.user_id,
        scope: row.scope,
        resource: row.resource,
        sbRefreshTokenEncrypted: row.sb_refresh_token,
      });
      return NextResponse.json(tokens, { headers: CORS });
    } catch (e: any) {
      console.error("[mcp/token] gagal mengeluarkan token putaran:", e.message);
      return fail("server_error", "Gagal memutar token", 500);
    }
  }

  return fail("unsupported_grant_type", `Grant '${grantType}' tidak disokong`);
}
