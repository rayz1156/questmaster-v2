// app/api/oauth/consent/route.ts
// Dipanggil oleh halaman consent selepas pengguna menekan "Benarkan" atau "Tolak".
//
// Auth berasaskan localStorage: klien menghantar access_token Supabase sebagai
// header Bearer dan kami mengesahkannya dengan supa.auth.getUser(accessToken).
// JANGAN guna cookie helper @supabase/ssr di sini.
//
// Pengguna TIDAK menyerahkan refresh token pelayar mereka. Kami menghasilkan
// sesi Supabase bebas untuk pemberian ini.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { admin, mintIndependentSession } from "@/lib/mcp/db";
import { randomToken, sha256, encrypt } from "@/lib/mcp/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CODE_TTL_SECONDS = 60;
const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");
const SUPPORTED_SCOPES = ["kuizen:read", "kuizen:write"];

function normaliseScope(raw: unknown): string {
  const requested = String(raw ?? "")
    .split(/\s+/)
    .filter((s) => SUPPORTED_SCOPES.includes(s));
  return requested.length ? requested.join(" ") : "kuizen:read";
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!accessToken) {
    return NextResponse.json({ error: "Tiada token Bearer" }, { status: 401 });
  }

  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );

  const { data: userData, error: userErr } = await supa.auth.getUser(accessToken);
  if (userErr || !userData?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Badan bukan JSON" }, { status: 400 });

  const {
    action,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scope,
    state,
    resource,
  } = body;

  if (!client_id || !redirect_uri) {
    return NextResponse.json({ error: "Parameter tidak lengkap" }, { status: 400 });
  }

  // Sahkan semula: /oauth/consent boleh dicapai terus, jadi ini juga menutup
  // pengalihan terbuka pada laluan "Tolak".
  const { data: client } = await admin()
    .from("oauth_clients")
    .select("client_id, redirect_uris")
    .eq("client_id", client_id)
    .maybeSingle();

  if (!client || !client.redirect_uris.includes(redirect_uri)) {
    return NextResponse.json({ error: "Klien atau redirect_uri tidak sah" }, { status: 400 });
  }

  if (action === "deny") {
    const denied = new URL(redirect_uri);
    denied.searchParams.set("error", "access_denied");
    denied.searchParams.set("iss", BASE);
    if (state) denied.searchParams.set("state", state);
    return NextResponse.json({ redirect_to: denied.toString() });
  }

  if (!code_challenge) {
    return NextResponse.json({ error: "code_challenge diperlukan" }, { status: 400 });
  }
  if (code_challenge_method !== "S256") {
    return NextResponse.json({ error: "code_challenge_method mesti S256" }, { status: 400 });
  }
  if (resource && resource !== `${BASE}/api/mcp`) {
    return NextResponse.json({ error: "resource tidak sepadan dengan pelayan ini" }, { status: 400 });
  }

  let minted;
  try {
    minted = await mintIndependentSession(userData.user.email);
  } catch (e: any) {
    console.error("[mcp/consent] gagal menjana sesi:", e.message);
    return NextResponse.json({ error: "Gagal mencipta sesi sambungan" }, { status: 500 });
  }

  if (minted.userId !== userData.user.id) {
    console.error("[mcp/consent] ketidakpadanan identiti semasa mint sesi");
    return NextResponse.json({ error: "Ketidakpadanan identiti" }, { status: 500 });
  }

  const code = randomToken(32);

  const { error: insertErr } = await admin().from("auth_codes").insert({
    code_hash: sha256(code),
    client_id,
    user_id: userData.user.id,
    redirect_uri,
    scope: normaliseScope(scope),
    resource: resource ?? null,
    code_challenge,
    code_challenge_method: "S256",
    sb_refresh_token: encrypt(minted.refreshToken),
    expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });

  if (insertErr) {
    console.error("[mcp/consent] gagal menyimpan kod:", insertErr.message);
    return NextResponse.json({ error: "Gagal mengeluarkan kod" }, { status: 500 });
  }

  const redirect = new URL(redirect_uri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("iss", BASE);
  if (state) redirect.searchParams.set("state", state);

  return NextResponse.json({ redirect_to: redirect.toString() });
}
