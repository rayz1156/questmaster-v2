// lib/mcp/db.ts
// Tiga jenis klien Supabase:
//   admin()      -> service_role pada skema mcp.*  (token, kod, audit)
//   adminPublic()-> service_role pada skema public (carian peranan SAHAJA)
//   asUser(tok)  -> bertindak sebagai pengguna, RLS dikuatkuasakan
//
// Peraturan emas: jangan sentuh jadual domain Kuizen dengan service_role,
// kecuali satu pengecualian yang didokumenkan dalam session.ts (resolveRole),
// yang mesti berjalan tanpa bergantung pada RLS.
//
// PENTING: skema `mcp` mesti didedahkan kepada PostgREST, jika tidak setiap
// panggilan admin() gagal dengan PGRST106. Lihat README bahagian 4.3.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const NO_SESSION = { persistSession: false, autoRefreshToken: false } as const;

// Generik kedua ialah nama skema. Tanpa anotasi ini, tsc gagal kerana
// createClient dengan db.schema mengembalikan SupabaseClient<any, "mcp">.
let _admin: SupabaseClient<any, "mcp"> | null = null;
let _adminPublic: SupabaseClient | null = null;

/** Klien service_role untuk skema mcp.* sahaja. */
export function admin(): SupabaseClient<any, "mcp"> {
  if (!_admin) {
    _admin = createClient<any, "mcp">(URL, SERVICE, {
      auth: NO_SESSION,
      db: { schema: "mcp" },
    });
  }
  return _admin;
}

/** Klien service_role pada skema public. Hanya untuk resolveRole. */
export function adminPublic(): SupabaseClient {
  if (!_adminPublic) {
    _adminPublic = createClient(URL, SERVICE, { auth: NO_SESSION });
  }
  return _adminPublic;
}

/**
 * Cipta sesi Supabase BEBAS untuk satu pemberian OAuth.
 *
 * Kenapa tidak ambil sahaja refresh token pelayar? Kerana GoTrue memutarkan
 * refresh token. Jika kita berkongsi token pelayar, panggilan MCP pertama
 * akan mematikan sesi web pengguna, dan connector kedua akan mematikan yang
 * pertama. Setiap pemberian mesti memiliki keturunan token sendiri.
 *
 * Kaedah: hasilkan magic link melalui service_role, kemudian tebus segera
 * tanpa menghantar sebarang emel.
 */
export async function mintIndependentSession(
  email: string
): Promise<{ refreshToken: string; userId: string }> {
  const svc = createClient(URL, SERVICE, { auth: NO_SESSION });

  const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkErr || !link?.properties?.hashed_token) {
    throw new Error(`Gagal menjana pautan sesi: ${linkErr?.message ?? "tiada token"}`);
  }

  const anonClient = createClient(URL, ANON, { auth: NO_SESSION });
  const { data: verified, error: verifyErr } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: link.properties.hashed_token,
  });

  if (verifyErr || !verified.session || !verified.user) {
    throw new Error(`Gagal menebus pautan sesi: ${verifyErr?.message ?? "tiada sesi"}`);
  }

  return { refreshToken: verified.session.refresh_token, userId: verified.user.id };
}

/**
 * Tukar refresh token kepada access token baharu dan pulangkan klien terikat
 * RLS. Pulangkan juga refresh token terkini kerana GoTrue memutarkannya, dan
 * email supaya pemanggil tidak perlu round trip getUser() tambahan.
 */
export async function asUser(supabaseRefreshToken: string): Promise<{
  client: SupabaseClient;
  userId: string;
  email: string | null;
  accessToken: string;
  expiresAt: number;
  newRefreshToken: string;
}> {
  const bootstrap = createClient(URL, ANON, { auth: NO_SESSION });

  const { data, error } = await bootstrap.auth.refreshSession({
    refresh_token: supabaseRefreshToken,
  });

  if (error || !data.session || !data.user) {
    throw new Error(`Sesi Supabase gagal disegarkan: ${error?.message ?? "tiada sesi"}`);
  }

  return {
    client: clientWithToken(data.session.access_token),
    userId: data.user.id,
    email: data.user.email ?? null,
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    newRefreshToken: data.session.refresh_token,
  };
}

/** Klien terikat RLS daripada access token sedia ada (tiada round trip). */
export function clientWithToken(accessToken: string): SupabaseClient {
  return createClient(URL, ANON, {
    auth: NO_SESSION,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
