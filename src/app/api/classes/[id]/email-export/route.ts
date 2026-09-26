import { NextRequest, NextResponse } from "next/server";
import { requireUser, getServiceSupabase } from "@/lib/supabase-route";
import { decrypt } from "@/lib/mcp/crypto";
import { PROVIDERS, classTags, splitName, EmailProviderContact } from "@/lib/email-providers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Had mengikut spesifikasi KZ-005.
const HAD_PESERTA = 1000;
const HAD_KADAR_MS = 60_000;

type Kelas = { id: string; name: string; owner_id: string };

/**
 * Kumpul e-mel sekumpulan id pengguna dari auth.users melalui admin.
 * auth.users tidak terdedah melalui PostgREST, jadi satu-satunya laluan
 * ialah listUsers dengan penomboran. Had 10 halaman x 1000 = 10,000
 * pengguna; cukup untuk mana-mana kelas di bawah had 1000 peserta.
 */
async function kumpulEmel(
  svc: ReturnType<typeof getServiceSupabase>,
  ids: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const set = new Set(ids);
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data) break;
    for (const u of data.users) {
      if (set.has(u.id)) map.set(u.id, u.email ?? "");
    }
    if (map.size >= set.size || data.users.length < 1000) break;
  }
  return map;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  // requireUser hanya memulangkan user null bersama response ralat di atas.
  const user = auth.user!;

  const body = await req.json().catch(() => null);
  const consent = body?.consent === true;
  const dryRun = body?.dryRun === true;

  // --- Kelas dan kebenaran: pemilik ATAU pendidik bersama yang diterima ---
  const { data: klass } = (await auth.supa
    .from("qm_classes")
    .select("id, name, owner_id")
    .eq("id", params.id)
    .maybeSingle()) as { data: Kelas | null };
  if (!klass) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const dibenarkan = klass.owner_id === user.id;
  if (!dibenarkan) {
    // Pendidik bersama: qm_class_educators dengan accepted_at tidak null.
    // JANGAN semak qm_class_members: itu jadual peserta.
    const { data: ce } = await auth.supa
      .from("qm_class_educators")
      .select("educator_id")
      .eq("class_id", params.id)
      .eq("educator_id", user.id)
      .not("accepted_at", "is", null)
      .maybeSingle();
    if (!ce) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // --- Semakan pelan Pro ---
  const { data: profil } = (await auth.supa
    .from("qm_profiles")
    .select("plan, role")
    .eq("id", user.id)
    .maybeSingle()) as { data: { plan?: string; role?: string } | null };
  const pro =
    profil?.plan === "pro" || profil?.role === "admin" || profil?.role === "superadmin";
  if (!pro) {
    return NextResponse.json(
      {
        error: "This feature is not part of the free plan. The free plan covers quizzes only.",
        code: "QM_PRO_ONLY",
      },
      { status: 403 },
    );
  }

  // --- Integrasi pemanggil (service role; jadual tanpa polisi authenticated) ---
  const svc = getServiceSupabase();
  const { data: integ } = await svc
    .from("qm_email_integrations")
    .select("provider, secret_enc")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!integ) {
    return NextResponse.json(
      {
        error: "Connect Encharge in your profile first.",
        code: "QM_NO_INTEGRATION",
      },
      { status: 400 },
    );
  }

  // --- Peserta: ahli kelas yang BUKAN pendidik kelas ---
  const [{ data: ahli }, { data: pendidikRows }] = await Promise.all([
    svc.from("qm_class_members").select("user_id").eq("class_id", params.id),
    svc.from("qm_class_educators").select("educator_id").eq("class_id", params.id),
  ]);
  const setPendidik = new Set((pendidikRows || []).map((e: { educator_id: string }) => e.educator_id));
  const pesertaIds = (ahli || [])
    .map((m: { user_id: string }) => m.user_id)
    .filter((uid: string) => !setPendidik.has(uid));
  const total = pesertaIds.length;

  // --- Nama dari qm_profiles.display_name, e-mel dari auth.users ---
  const [{ data: profils }, emelMap] = await Promise.all([
    pesertaIds.length > 0
      ? svc.from("qm_profiles").select("id, display_name").in("id", pesertaIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string }[] }),
    kumpulEmel(svc, pesertaIds),
  ]);
  const namaMap = new Map(
    (profils || []).map((p: { id: string; display_name: string }) => [p.id, p.display_name || ""]),
  );

  const tags = classTags(klass.name);
  const tanpaEmel = pesertaIds.filter((uid) => !emelMap.get(uid));

  // --- Mod dryRun: kiraan sahaja, tiada panggilan penyedia ---
  if (dryRun) {
    return NextResponse.json({
      total,
      withEmail: total - tanpaEmel.length,
      withoutEmail: tanpaEmel.length,
      tags,
      provider: integ.provider,
    });
  }

  // --- Penghantaran sebenar ---
  if (!consent) {
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });
  }
  if (total > HAD_PESERTA) {
    return NextResponse.json(
      { error: `Too many participants. The limit is ${HAD_PESERTA}.` },
      { status: 400 },
    );
  }

  // Had kadar: satu eksport setiap kelas setiap 60 saat.
  const { data: logTerkini } = await svc
    .from("qm_email_sync_log")
    .select("created_at")
    .eq("class_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (logTerkini) {
    const terakhir = new Date(logTerkini.created_at).getTime();
    if (Date.now() - terakhir < HAD_KADAR_MS) {
      return NextResponse.json(
        { error: "This class was sent less than a minute ago. Please wait a moment." },
        { status: 429 },
      );
    }
  }

  // Kenalan untuk penyedia.
  const contacts: EmailProviderContact[] = pesertaIds
    .filter((uid) => !!emelMap.get(uid))
    .map((uid) => {
      const { firstName, lastName } = splitName(namaMap.get(uid) || "");
      return { email: emelMap.get(uid) as string, firstName, lastName, tags };
    });
  const skipped = tanpaEmel.length;

  // Nyahsulit kunci hanya selepas semua semakan lulus.
  let kunci: string;
  try {
    kunci = decrypt(integ.secret_enc);
  } catch {
    return NextResponse.json({ error: "Stored key is invalid. Reconnect Encharge." }, { status: 500 });
  }

  const penyedia = PROVIDERS[integ.provider];
  if (!penyedia) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 500 });
  }
  const hasil = await penyedia.upsertContacts(kunci, contacts);

  // Log dan setem last_sync_at walaupun sebahagian gagal, supaya had
  // kadar dan paparan "last sync" mencerminkan percubaan sebenar.
  const now = new Date().toISOString();
  await Promise.all([
    svc.from("qm_email_sync_log").insert({
      owner_id: user.id,
      class_id: params.id,
      provider: integ.provider,
      total,
      sent: hasil.sent,
      skipped,
      failed: hasil.failed,
      consent_confirmed: true,
    }),
    svc
      .from("qm_email_integrations")
      .update({ last_sync_at: now, updated_at: now })
      .eq("owner_id", user.id),
  ]);

  // Maksimum 5 ralat; mesej penyedia tidak mengandungi e-mel penuh mahupun kunci.
  return NextResponse.json({
    sent: hasil.sent,
    skipped,
    failed: hasil.failed,
    errors: hasil.errors.slice(0, 5),
  });
}
