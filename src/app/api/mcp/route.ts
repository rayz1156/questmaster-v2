// app/api/mcp/route.ts
// Endpoint MCP (Streamable HTTP, mod tanpa keadaan).
// Kaedah: initialize, tools/list, tools/call, ping, notifications/*.

import { NextRequest, NextResponse } from "next/server";
import { getSession, AuthError, McpSession } from "@/lib/mcp/session";
import { toolsForSession, findTool } from "@/lib/mcp/tools";
import { admin } from "@/lib/mcp/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PROTOCOL_VERSION = "2025-06-18";
const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INTERNAL_ERROR = -32603;

function rpcError(id: any, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: "2.0", id: id ?? null, error: { code, message } },
    { status, headers: CORS }
  );
}

function rpcResult(id: any, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, { headers: CORS });
}

/**
 * 401 mesti membawa WWW-Authenticate yang menunjuk ke metadata sumber
 * dilindungi (RFC 9728), termasuk laluan sumber.
 */
function unauthorized(message: string, tokenWasSupplied: boolean) {
  const parts = [
    'Bearer realm="Kuizen"',
    tokenWasSupplied ? 'error="invalid_token"' : null,
    tokenWasSupplied ? `error_description="${message.replace(/"/g, "")}"` : null,
    `resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp"`,
  ].filter(Boolean);

  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message } },
    { status: 401, headers: { ...CORS, "WWW-Authenticate": parts.join(", ") } }
  );
}

/** Perlindungan penyatuan semula DNS. Permintaan bukan pelayar tiada Origin. */
function originAllowed(origin: string | null): boolean {
  if (!origin) return true;
  const allowed = [BASE, ...(process.env.MCP_ALLOWED_ORIGINS ?? "").split(",")]
    .map((s) => s.trim())
    .filter(Boolean);
  if (origin.startsWith("chrome-extension://") || origin === "null") return true;
  return allowed.includes(origin);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

async function audit(
  session: McpSession | null,
  toolName: string,
  args: any,
  ok: boolean,
  error: string | null,
  ms: number
) {
  try {
    await admin().from("tool_calls").insert({
      user_id: session?.userId ?? null,
      client_id: session?.clientId ?? null,
      tool_name: toolName,
      arguments: args ?? null,
      ok,
      error,
      duration_ms: ms,
    });
  } catch {
    // Kegagalan audit tidak boleh menjatuhkan permintaan pengguna.
  }
}

export async function POST(req: NextRequest) {
  if (!originAllowed(req.headers.get("origin"))) {
    return rpcError(null, INVALID_REQUEST, "Origin tidak dibenarkan", 403);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return rpcError(null, PARSE_ERROR, "JSON tidak sah");
  }

  if (Array.isArray(body)) {
    return rpcError(null, INVALID_REQUEST, "Permintaan berkelompok tidak disokong");
  }

  const { id, method, params } = body ?? {};

  if (typeof method === "string" && method.startsWith("notifications/")) {
    return new NextResponse(null, { status: 202, headers: CORS });
  }

  // initialize dan ping tidak memerlukan auth: klien memanggil initialize
  // sebelum ia mempunyai token.
  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "kuizen-mcp", version: "1.0.0" },
      instructions:
        "Kuizen ialah platform pendidikan berasaskan kelas. Setiap kelas mengandungi hunt " +
        "(aktiviti) dan board pembelajaran. Setiap hunt mengandungi challenge (soalan), dan " +
        "peserta menghantar jawapan kepada challenge. Tools yang tersedia bergantung pada " +
        "peranan pengguna. Panggil whoami dahulu jika anda tidak pasti apa yang boleh dilakukan.",
    });
  }

  if (method === "ping") return rpcResult(id, {});

  const authHeader = req.headers.get("authorization");
  let session: McpSession;
  try {
    session = await getSession(authHeader);
  } catch (e) {
    if (e instanceof AuthError) return unauthorized(e.message, Boolean(authHeader));
    console.error("[mcp] ralat sesi:", e);
    return rpcError(id, INTERNAL_ERROR, "Pengesahan gagal");
  }

  if (method === "tools/list") {
    return rpcResult(id, {
      tools: toolsForSession(session).map((t) => ({
        name: t.name,
        title: t.title,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    const started = Date.now();

    const tool = findTool(toolName);

    // Sembunyikan kewujudan tool yang pengguna tiada akses.
    if (!tool || !toolsForSession(session).some((t) => t.name === toolName)) {
      await audit(session, String(toolName), args, false, "tidak dibenarkan", Date.now() - started);
      return rpcResult(id, {
        content: [
          {
            type: "text",
            text: `Tool '${toolName}' tidak tersedia untuk peranan anda (${session.role}).`,
          },
        ],
        isError: true,
      });
    }

    try {
      const data = await tool.handler(args, session);
      await audit(session, toolName, args, true, null, Date.now() - started);
      return rpcResult(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        isError: false,
      });
    } catch (e: any) {
      const message = e?.message ?? "Ralat tidak dijangka";
      await audit(session, toolName, args, false, message, Date.now() - started);
      console.error(`[mcp] tool ${toolName} gagal:`, message);
      return rpcResult(id, {
        content: [{ type: "text", text: `Ralat: ${message}` }],
        isError: true,
      });
    }
  }

  return rpcError(id, METHOD_NOT_FOUND, `Kaedah '${method}' tidak disokong`);
}
