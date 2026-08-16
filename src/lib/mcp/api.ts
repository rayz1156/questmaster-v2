// lib/mcp/api.ts
//
// Memanggil route API Kuizen sendiri bagi pihak pengguna MCP.
//
// KENAPA INI WUJUD
// Tool MCP awal menulis terus ke Supabase. Itu memintas logik perniagaan yang
// sudah ada dalam route aplikasi, dan menghasilkan pepijat sebenar: setiap kad
// yang dicipta melalui MCP mendapat position 0, sedangkan route
// /api/learning-boards/[classId]/cards mengira MAX(position)+1 dan menganjak
// kad sedia ada dengan betul.
//
// Peraturan: untuk sebarang tulisan yang aplikasi sudah ada routenya, panggil
// route itu. Jangan salin logiknya ke dalam tool.
//
// Auth mengikut corak sedia ada projek: header Bearer dengan access token
// Supabase pengguna, bukan cookie.

const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function readError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const j = JSON.parse(text);
    return j.error ?? j.message ?? text ?? res.statusText;
  } catch {
    return text || res.statusText;
  }
}

/** Panggilan JSON ke route API Kuizen sebagai pengguna semasa. */
export async function callApi<T = any>(
  accessToken: string,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) throw new ApiError(res.status, await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Muat naik fail ke route upload-file, yang mengharapkan FormData dengan
 * medan bernama `file`. Kami membina Blob daripada base64 supaya klien MCP
 * boleh menghantar bait melalui JSON-RPC.
 */
export async function uploadFile(
  accessToken: string,
  classId: string,
  fileName: string,
  contentBase64: string,
  mimeType?: string
): Promise<any> {
  const bytes = Buffer.from(contentBase64, "base64");
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: mimeType || "application/octet-stream" }),
    fileName
  );

  const res = await fetch(`${BASE}/api/learning-boards/${classId}/upload-file`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
    cache: "no-store",
  });

  if (!res.ok) throw new ApiError(res.status, await readError(res));
  return await res.json();
}
