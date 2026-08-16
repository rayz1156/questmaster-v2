// app/api/oauth/revoke/route.ts
// RFC 7009. Sentiasa pulangkan 200 walaupun token tidak dijumpai.

import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/mcp/db";
import { sha256 } from "@/lib/mcp/crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(req: NextRequest) {
  let p: Record<string, string> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      p = await req.json();
    } else {
      const form = await req.formData();
      const obj: Record<string, string> = {};
      form.forEach((v, k) => { obj[k] = String(v); });
      p = obj;
    }
  } catch {
    return new NextResponse(null, { status: 200, headers: CORS });
  }

  const { token, client_id } = p;
  if (!token || !client_id) return new NextResponse(null, { status: 200, headers: CORS });

  const hash = sha256(token);
  const now = new Date().toISOString();

  // Terikat kepada client_id: satu klien tidak boleh membatalkan token klien lain.
  for (const column of ["access_token_hash", "refresh_token_hash"]) {
    await admin()
      .from("tokens")
      .update({ revoked_at: now })
      .eq(column, hash)
      .eq("client_id", client_id)
      .is("revoked_at", null);
  }

  return new NextResponse(null, { status: 200, headers: CORS });
}
