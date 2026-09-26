import { NextRequest, NextResponse } from "next/server";
import { requireUser, getServiceSupabase } from "@/lib/supabase-route";
import { encrypt } from "@/lib/mcp/crypto";
import { PROVIDERS } from "@/lib/email-providers";

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

/** Pro = pelan pro, ATAU admin/superadmin (dibenarkan walau pelan bukan pro). */
function bolehPro(p: ProfilPemanggil): boolean {
  return p?.plan === "pro" || p?.role === "admin" || p?.role === "superadmin";
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

  return NextResponse.json({
    plan: profil?.plan === "pro" ? "pro" : "free",
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

  const profil = await profilPemanggil(auth.supa, user.id);
  if (!bolehPro(profil)) {
    // UI menunjuk kod QM_PRO_ONLY untuk keadaan terkunci.
    return NextResponse.json(
      {
        error: "This feature is not part of the free plan. The free plan covers quizzes only.",
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
        secret_enc: encrypt(apiKey),
        secret_hint: apiKey.slice(-4),
        connected_at: now,
        updated_at: now,
      },
      { onConflict: "owner_id" },
    );

  if (ralatSimpan) {
    return NextResponse.json({ error: ralatSimpan.message }, { status: 500 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
