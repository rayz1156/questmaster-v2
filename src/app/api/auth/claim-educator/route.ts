import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Tetingkap masa selepas akaun dicipta. Di luar ini permintaan ditolak. */
const WINDOW_MS = 15 * 60 * 1000;

/**
 * POST /api/auth/claim-educator
 *
 * Pendaftaran melalui Google tidak membawa peranan. Google hanya memberi
 * nama dan emel, jadi pencetus pangkalan data mencipta profil peserta
 * sebelum aplikasi sempat tahu bahawa orang itu menekan "Sign up with
 * Google" pada tab pendidik.
 *
 * Laluan ini menutup jurang itu di sisi pelayan. Ia tidak boleh dilakukan
 * dari pelayar: pengguna tidak dibenarkan menulis lajur role atau approved
 * pada profil sendiri, dan itu memang sepatutnya begitu.
 *
 * Tiga syarat sebelum peranan diberi, supaya laluan ini tidak boleh
 * disalahgunakan pada akaun sedia ada:
 *   - akaun belum mempunyai peranan dalam user_metadata
 *   - profil masih 'participant'
 *   - akaun dicipta dalam tempoh WINDOW_MS
 *
 * Hasilnya ialah pendidik yang belum diluluskan, iaitu satu sekatan dan
 * bukan satu kenaikan kuasa. Kelulusan tetap di tangan pentadbir.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;

  const admin = getServiceSupabase();

  const { data: got, error: getErr } = await admin.auth.admin.getUserById(userId);
  if (getErr || !got?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const u = got.user;
  const meta = (u.user_metadata || {}) as Record<string, unknown>;

  if (meta.role) {
    return NextResponse.json({ error: 'Role already set' }, { status: 409 });
  }

  const age = Date.now() - new Date(u.created_at as string).getTime();
  if (!(age >= 0) || age > WINDOW_MS) {
    return NextResponse.json({ error: 'Not a new account' }, { status: 403 });
  }

  const { data: prof } = await admin
    .from('qm_profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!prof) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
  }
  if ((prof as any).role !== 'participant') {
    return NextResponse.json({ error: 'Role already set' }, { status: 409 });
  }

  const { error: mErr } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: { ...meta, role: 'educator' },
  });
  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const { error: pErr } = await admin
    .from('qm_profiles')
    .update({ role: 'educator', approved: false })
    .eq('id', userId);
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  await admin.from('qm_audit_log').insert({
    actor_id: userId,
    action: 'claim_educator_google',
    target_type: 'profile',
    target_id: userId,
    meta: { email: u.email },
  });

  console.log(`[claim-educator] ${userId} menunggu kelulusan`);
  return NextResponse.json({ ok: true, pending: true });
}
