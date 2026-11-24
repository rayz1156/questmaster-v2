/**
 * GET /api/name-confirmation/status?class_id=<uuid> (KZ-E)
 *
 * Tanpa class_id: semua kelas pemanggil (pemilik atau pendidik diterima).
 * Setiap kelas: dihantar (peserta yang pernah menerima pautan), disahkan,
 * belum disahkan, tamat tempoh, dibatalkan, e-mel masih dalam baris gilir,
 * dan senarai nama lama berbanding nama baharu.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const { supa, user } = auth;
  const { data: prof } = await supa.from('qm_profiles').select('suspended').eq('id', user!.id).maybeSingle();
  if (!prof || prof.suspended) return ralatJson('Forbidden', 403);
  const classId = req.nextUrl.searchParams.get('class_id') ?? '';
  if (classId && !UUID.test(classId)) return ralatJson('Invalid class_id.', 400);

  const svc = getServiceSupabase();
  const [{ data: milik }, { data: bersama }] = await Promise.all([
    svc.from('qm_classes').select('id').eq('owner_id', user!.id),
    svc.from('qm_class_educators').select('class_id').eq('educator_id', user!.id).not('accepted_at', 'is', null),
  ]);
  const berhak = new Set<string>([...(milik ?? []).map((k) => String(k.id)), ...(bersama ?? []).map((k) => String(k.class_id))]);
  if (classId && !berhak.has(classId)) return ralatJson('Forbidden', 403);
  const ids = classId ? [classId] : Array.from(berhak);
  if (ids.length === 0) return NextResponse.json({ classes: [] });

  const token: Record<string, unknown>[] = [];
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await svc
      .from('qm_name_update_tokens')
      .select('class_id, participant_id, status, purpose, expires_at, created_at, used_at, old_name, new_name')
      .in('class_id', ids)
      .order('created_at', { ascending: false })
      .range(dari, dari + 999);
    if (error) return ralatJson(error.message, 500);
    token.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const { data: gilir } = await svc
    .from('qm_certificate_email_queue')
    .select('class_id, participant_id')
    .in('class_id', ids)
    .in('status', ['queued', 'sending', 'retrying'])
    .not('name_link_purpose', 'is', null);
  const { data: kelas } = await svc.from('qm_classes').select('id, name').in('id', ids);

  const keputusan = [];
  for (const k of kelas ?? []) {
    const milikKelas = token.filter((t) => t.class_id === k.id);
    if (!classId && milikKelas.length === 0) continue;
    // Token terkini setiap peserta menentukan status peserta itu.
    const terkini = new Map<string, Record<string, unknown>>();
    for (const t of milikKelas) if (!terkini.has(String(t.participant_id))) terkini.set(String(t.participant_id), t);
    const status = (t: Record<string, unknown>) =>
      t.status === 'pending' && new Date(String(t.expires_at)).getTime() <= Date.now() ? 'expired' : String(t.status);
    const nilai = Array.from(terkini.values());
    const disahkan = milikKelas.filter((t) => t.status === 'used');
    keputusan.push({
      class_id: k.id,
      class_name: k.name,
      sent: terkini.size,
      confirmed: nilai.filter((t) => status(t) === 'used').length,
      pending: nilai.filter((t) => status(t) === 'pending').length,
      expired: nilai.filter((t) => status(t) === 'expired').length,
      revoked: nilai.filter((t) => status(t) === 'revoked').length,
      queued_emails: (gilir ?? []).filter((g) => g.class_id === k.id).length,
      changes: disahkan.map((t) => ({ participant_id: t.participant_id, old_name: t.old_name, new_name: t.new_name, confirmed_at: t.used_at })),
    });
  }
  keputusan.sort((a, b) => String(a.class_name).localeCompare(String(b.class_name)));
  return NextResponse.json({ classes: keputusan });
}
