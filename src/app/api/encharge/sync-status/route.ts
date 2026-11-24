/**
 * GET /api/encharge/sync-status?class_id=<uuid> (KZ-D)
 *
 * Tanpa class_id: semua kelas pemanggil (pemilik atau pendidik bersama
 * diterima). Setiap kelas: bilangan peserta sudah dihantar, tarikh terakhir,
 * dan peserta baharu ber-e-mel yang belum dihantar (untuk pemilik log =
 * pemanggil). Service role hanya selepas kebenaran disahkan.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, getServiceSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';
import { pesertaKelas, statusKelasEncharge } from '@/lib/enchargeSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const user = auth.user!;
  const classId = req.nextUrl.searchParams.get('class_id') ?? '';
  if (classId && !UUID.test(classId)) return ralatJson('Invalid class_id.', 400);

  const svc = getServiceSupabase();
  const [{ data: milik }, { data: bersama }] = await Promise.all([
    svc.from('qm_classes').select('id').eq('owner_id', user.id),
    svc.from('qm_class_educators').select('class_id').eq('educator_id', user.id).not('accepted_at', 'is', null),
  ]);
  const berhak = new Set<string>([
    ...(milik ?? []).map((k: { id: string }) => k.id),
    ...(bersama ?? []).map((k: { class_id: string }) => k.class_id),
  ]);
  if (classId && !berhak.has(classId)) return ralatJson('Forbidden', 403);
  const ids = classId ? [classId] : Array.from(berhak);
  if (ids.length === 0) return NextResponse.json({ classes: [] });

  const { data: kelas } = await svc.from('qm_classes').select('id, name, ended_at, is_archived').in('id', ids);
  const { data: log } = await svc
    .from('qm_encharge_sync_log')
    .select('class_id, email, status, synced_at, source')
    .eq('owner_id', user.id)
    .in('class_id', ids);

  const hasil = [];
  for (const k of (kelas ?? []) as { id: string; name: string; ended_at: string | null; is_archived: boolean | null }[]) {
    const baris = (log ?? []).filter((l) => l.class_id === k.id);
    const dihantar = new Set(baris.filter((l) => l.status === 'sent').map((l) => l.email));
    const terakhir = baris.reduce<string | null>((t, l) => (!t || l.synced_at > t ? l.synced_at : t), null);
    const entri: Record<string, unknown> = {
      class_id: k.id,
      class_name: k.name,
      status: statusKelasEncharge(k),
      sent_count: dihantar.size,
      failed_count: baris.filter((l) => l.status === 'failed').length,
      backfilled_count: baris.filter((l) => l.source === 'backfill').length,
      last_synced_at: terakhir,
    };
    // Peserta baharu belum dihantar: dikira untuk satu kelas, atau semua jika <= 30 kelas.
    if (classId || ids.length <= 30) {
      const peserta = await pesertaKelas(svc, k.id);
      const baharu = peserta.filter((p) => p.email && !dihantar.has(p.email));
      entri.new_not_sent = baharu.length;
      entri.without_email = peserta.filter((p) => !p.email).length;
      if (classId) entri.new_participants = baharu.map((p) => ({ participant_id: p.participant_id, name: p.nama }));
    }
    hasil.push(entri);
  }
  hasil.sort((a, b) => String(a.class_name).localeCompare(String(b.class_name)));
  return NextResponse.json({ classes: hasil });
}
