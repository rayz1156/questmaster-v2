import { NextResponse } from "next/server";
import { CORS, authorizationServerDoc } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return NextResponse.json(authorizationServerDoc(), { headers: CORS });
}
