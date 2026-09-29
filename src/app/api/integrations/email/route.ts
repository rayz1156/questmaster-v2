import { NextRequest, NextResponse } from "next/server";
import { requireUser, getServiceSupabase } from "@/lib/supabase-route";
import { encrypt } from "@/lib/mcp/crypto";
import { PROVIDERS } from "@/lib/email-providers";
import { pelanBerbayar } from "@/lib/pelan";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type ProfilPemanggil = { plan?: string; role?: string } | null;

/** Baca pelan dan peranan pemanggil melalui klien RLS (baris profil sendiri). */
async function profilPemanggil(
  supa: NonNullable<Awaited<ReturnType<typeof requireUser>>["supa"]>,
  uid: string,
): Promise<ProfilPemanggil> {
  const { data } = await supa
    .from("qm_profiles")
    .select("plan, role")
    .eq("id", uid)
    .maybeSingle();
  return (data as ProfilPemanggil) ?? null;
}

/**
 * Pelan berkesan pemanggil melalui RPC qm_effective_plan (0040):
 * admin => pro, tamat tempoh => free, selain itu pelan tersimpan.
 * Gagal RPC memulangkan null; pemanggil mesti menganggapnya tidak berbayar.
 */
async function pelanBerkesan(
  supa: NonNullable<Awaited<ReturnType<typeof requireUser>>["supa"]>,
): Promise<string | null> {
  const { data, error } = await supa.rpc("qm_effective_plan");
  if (error || typeof data !== "string") return null;
  return data;
}

/** Benar jika pelan berkesan berbayar ATAU pemanggil admin/superadmin. */
async function bolehBerbayar(
  supa: NonNullable<Awaited<ReturnType<typeof requireUser>>["supa"]>,
): Promise<boolean> {
  const profil = await profilPemanggil(supa, (await supa.auth.getUser()).data.user?.id ?? "");
  const pentadbir = profil?.role === "admin" || profil?.role === "superadmin";
  if (pentadbir) return true;
  const berkesan = await pelanBerkesan(supa);
  return pelanBerbayar(berkesan);
}

/** GET: status integrasi pemanggil. Tidak pernah memulangkan kunci mahupun secret_enc. */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  // requireUser hanya memulangkan user null bersama response ralat di atas.
  const user = auth.user!;

  const profil = await profilPemanggil(auth.supa, user.id);
  // qm_email_integrations tiada polisi authenticated; hanya service role
  // boleh membacanya, dan hanya selepas pemanggil disahkan di atas.
  const svc = getServiceSupabase();
  const { data: row } = await svc
    .from("qm_email_integrations")
    .select("provider, secret_hint, connected_at, last_sync_at")
    .eq("owner_id", user.id)
    .maybeSingle();

  // Pelan berkesan sebenar (V2-008): admin => 'pro' oleh qm_effective_plan,
  // tamat tempoh => 'free', selain itu plan tersimpan (pro/institution/unlimited).
  // Pelan unlimited dipaparkan sebagai 'pro' di UI kerana PelanAwam tidak
  // memasukkannya; kebenaran sebenar sentiasa disemak oleh pelayan.
  const berkesan = await pelanBerkesan(auth.supa);
  return NextResponse.json({
    plan: berkesan === "unlimited" || berkesan === "institution" ? "pro" : berkesan ?? "free",
    connected: !!row,
    provider: row?.provider ?? null,
    hint: row?.secret_hint ?? null,
    connected_at: row?.connected_at ?? null,
    last_sync_at: row?.last_sync_at ?? null,
  });
}

/** PUT: sambung penyedia. Kunci disahkan dahulu, kemudian disulit sebelum disimpan. */
export async function PUT(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  // requireUser hanya memulangkan user null bersama response ralat di atas.
  const user = auth.user!;

  const body = await req.json().catch(() => null);
  const provider = body?.provider;
  const apiKey = body?.apiKey;

  if (provider !== "encharge" || !PROVIDERS[provider as string]) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }
  if (typeof apiKey !== "string" || apiKey.length < 8 || apiKey.length > 200) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }

  if (!(await bolehBerbayar(auth.supa))) {
    // UI menunjuk kod QM_PRO_ONLY untuk keadaan terkunci.
    return NextResponse.json(
      {
        error: "Email integration is available on the Pro plan.",
        code: "QM_PRO_ONLY",
      },
      { status: 403 },
    );
  }

  // Sahkan kunci dengan penyedia SEBELUM menyimpan apa-apa.
  const penyedia = PROVIDERS[provider as string];
  const semakan = await penyedia.validateKey(apiKey);
  if (!semakan.ok && (semakan.status === 401 || semakan.status === 403)) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 400 });
  }
  if (!semakan.ok) {
    // 5xx, tamat masa atau rangkaian: ralat penyedia, jangan simpan kunci.
    return NextResponse.json(
      { error: "Encharge is unavailable right now. Please try again." },
      { status: 502 },
    );
  }

  let disulit: string;
  try {
    disulit = encrypt(apiKey);
  } catch {
    return NextResponse.json({ error: "Could not save integration." }, { status: 500 });
  }

  const now = new Date().toISOString();
  // Simpan melalui service role: jadual ini dicabut (REVOKE) daripada
  // anon/authenticated supaya klien tidak boleh menulis kunci terus.
  const svc = getServiceSupabase();
  const { error: ralatSimpan } = await svc
    .from("qm_email_integrations")
    .upsert(
      {
        owner_id: user.id,
        provider,
        secret_enc: disulit,
        secret_hint: apiKey.slice(-4),
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "owner_id" },
    );

  if (ralatSimpan) {
    return NextResponse.json({ error: "Could not save integration." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, connected: true, hint: apiKey.slice(-4) });
}

/** DELETE: putuskan sambungan pemanggil. */
export async function DELETE(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  // requireUser hanya memulangkan user null bersama response ralat di atas.
  const user = auth.user!;

  const svc = getServiceSupabase();
  const { error } = await svc
    .from("qm_email_integrations")
    .delete()
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: "Could not disconnect." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
