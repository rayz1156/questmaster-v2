import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_ROLES = ['admin', 'superadmin'];
const MAX_BATCH = 200;

/**
 * POST /api/admin/users/verify
 * Body: { userIds: string[], alsoApprove?: boolean }
 *
 * Menandakan emel sebagai sah tanpa pengguna mengklik pautan. Ini untuk kes
 * biasa peserta kursus yang emel pengesahannya tidak pernah sampai, tersekat
 * dalam spam, atau alamat kerja yang menapis pautan luar.
 *
 * Ini memintas satu kawalan keselamatan, jadi tiga perkara tidak boleh
 * dikompromi: kerjanya kekal di pelayan dengan service_role dan tidak pernah
 * didedahkan kepada klien, peranan pemanggil disemak semula di sini dan bukan
 * dipercayai daripada UI, dan setiap tindakan direkodkan sebelum respons
 * dipulangkan supaya rekod tidak bergantung pada klien menyelesaikan
 * panggilan kedua.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;

  const admin = getServiceSupabase();

  const { data: me } = await admin
    .from('qm_profiles')
    .select('role, suspended')
    .eq('id', auth.user!.id)
    .maybeSingle();

  const actor = me as any;
  if (!actor || actor.suspended || !ADMIN_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}) as any);
  const ids: string[] = Array.isArray(body.userIds)
    ? Array.from(
        new Set<string>(
          body.userIds.filter((v: any) => typeof v === 'string' && v.trim()).map((v: string) => v.trim())
        )
      ).slice(0, MAX_BATCH)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: 'userIds required' }, { status: 400 });
  }

  const alsoApprove = body.alsoApprove === true;
  const results: Array<{ id: string; ok: boolean; email?: string | null; error?: string }> = [];

  for (const id of ids) {
    try {
      // email_confirm: true menetapkan email_confirmed_at pada akaun auth,
      // hasil yang sama persis seperti pengguna mengklik pautan pengesahan.
      const { data, error } = await admin.auth.admin.updateUserById(id, { email_confirm: true });
      if (error) throw error;

      if (alsoApprove) {
        const { error: pErr } = await admin.from('qm_profiles').update({ approved: true }).eq('id', id);
        if (pErr) throw pErr;
      }

      const email = (data as any)?.user?.email ?? null;

      await admin.from('qm_audit_log').insert({
        actor_id: auth.user!.id,
        action: alsoApprove ? 'verify_email_manual_and_approve' : 'verify_email_manual',
        target_type: 'profile',
        target_id: id,
        meta: { email, by_admin: true },
      });

      results.push({ id, ok: true, email });
    } catch (e: any) {
      results.push({ id, ok: false, error: e?.message || String(e) });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(
    `[admin/verify] actor=${auth.user!.id} berjaya=${ok}/${ids.length} approve=${alsoApprove}`
  );

  return NextResponse.json({ ok, total: ids.length, alsoApprove, results });
}
