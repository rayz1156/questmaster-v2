// app/api/oauth/authorize/route.ts
// Endpoint kebenaran OAuth 2.1. Mengesahkan parameter, kemudian menghantar
// pengguna ke halaman consent. Tiada kod dikeluarkan di sini.

import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/mcp/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");

function redirectError(
  redirectUri: string,
  error: string,
  description: string,
  state?: string | null
) {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  u.searchParams.set("iss", BASE);
  if (state) u.searchParams.set("state", state);
  return NextResponse.redirect(u.toString());
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const clientId = p.get("client_id");
  const redirectUri = p.get("redirect_uri");
  const responseType = p.get("response_type");
  const codeChallenge = p.get("code_challenge");
  const codeChallengeMethod = p.get("code_challenge_method") ?? "plain";
  const scope = p.get("scope") ?? "kuizen:read kuizen:write";
  const state = p.get("state");
  const resource = p.get("resource");

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "client_id dan redirect_uri diperlukan" },
      { status: 400 }
    );
  }

  // Padanan tepat redirect_uri menghalang serangan pengalihan terbuka.
  const { data: client } = await admin()
    .from("oauth_clients")
    .select("client_id, redirect_uris, client_name")
    .eq("client_id", clientId)
    .maybeSingle();

  if (!client) {
    return NextResponse.json(
      { error: "invalid_client", error_description: "client_id tidak dikenali" },
      { status: 400 }
    );
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json(
      { error: "invalid_request", error_description: "redirect_uri tidak sepadan dengan pendaftaran" },
      { status: 400 }
    );
  }

  if (responseType !== "code") {
    return redirectError(redirectUri, "unsupported_response_type", "Hanya 'code' disokong", state);
  }

  if (!codeChallenge) {
    return redirectError(redirectUri, "invalid_request", "PKCE code_challenge diwajibkan", state);
  }

  if (codeChallengeMethod !== "S256") {
    return redirectError(redirectUri, "invalid_request", "code_challenge_method mesti S256", state);
  }

  // RFC 8707: jika klien menamakan sumber, ia mesti sumber ini.
  if (resource && resource !== `${BASE}/api/mcp`) {
    return redirectError(redirectUri, "invalid_target", "resource tidak sepadan dengan pelayan ini", state);
  }

  const consent = new URL(`${BASE}/oauth/consent`);
  consent.searchParams.set("client_id", clientId);
  consent.searchParams.set("client_name", client.client_name);
  consent.searchParams.set("redirect_uri", redirectUri);
  consent.searchParams.set("code_challenge", codeChallenge);
  consent.searchParams.set("code_challenge_method", codeChallengeMethod);
  consent.searchParams.set("scope", scope);
  if (state) consent.searchParams.set("state", state);
  if (resource) consent.searchParams.set("resource", resource);

  return NextResponse.redirect(consent.toString());
}
