// app/api/oauth/register/route.ts
// Dynamic Client Registration (RFC 7591).
// Claude dan ChatGPT mendaftar sendiri di sini.

import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/mcp/db";
import { randomToken, sha256 } from "@/lib/mcp/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Hanya benarkan redirect URI HTTPS, atau localhost untuk pembangunan. */
function validRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Badan bukan JSON" },
      { status: 400, headers: CORS }
    );
  }

  const redirectUris: string[] = body.redirect_uris ?? [];

  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris diperlukan" },
      { status: 400, headers: CORS }
    );
  }

  if (!redirectUris.every(validRedirect)) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "Setiap redirect_uri mesti https, atau http pada localhost",
      },
      { status: 400, headers: CORS }
    );
  }

  const authMethod: string = body.token_endpoint_auth_method ?? "none";
  const clientId = `kuizen_${randomToken(16)}`;

  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (authMethod !== "none") {
    clientSecret = randomToken(32);
    clientSecretHash = sha256(clientSecret);
  }

  const record = {
    client_id: clientId,
    client_secret_hash: clientSecretHash,
    client_name: String(body.client_name ?? "Unknown MCP Client").slice(0, 200),
    redirect_uris: redirectUris,
    grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
    response_types: body.response_types ?? ["code"],
    token_endpoint_auth_method: authMethod,
    scope: body.scope ?? "kuizen:read kuizen:write",
  };

  const { error } = await admin().from("oauth_clients").insert(record);

  if (error) {
    console.error("[mcp/register] gagal menyimpan klien:", error.message);
    return NextResponse.json(
      { error: "server_error", error_description: "Pendaftaran klien gagal" },
      { status: 500, headers: CORS }
    );
  }

  return NextResponse.json(
    {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: record.client_name,
      redirect_uris: record.redirect_uris,
      grant_types: record.grant_types,
      response_types: record.response_types,
      token_endpoint_auth_method: authMethod,
      scope: record.scope,
    },
    { status: 201, headers: CORS }
  );
}
