/**
 * Send to Encharge untuk banyak kelas (KZ-D), dengan rekod per peserta.
 *
 * - Tag sama seperti butang UI: "kuizen" dan "kuizen-<slug kelas>" (classTags).
 * - POST /people Encharge ialah upsert mengikut e-mel: kenalan sedia ada
 *   dikemas kini, tiada pendua dicipta.
 * - Peserta yang sudah 'sent' untuk (pemilik, kelas, e-mel) dilangkau kecuali
 *   force_resync. Rekod disimpan dalam qm_encharge_sync_log (service role).
 * - Had kadar dan cubaan semula dalam penyesuai encharge.ts (serentak 4,
 *   429/5xx dicuba semula 1s/2s/4s).
 *
 * Pelayan sahaja. Panggil HANYA selepas kebenaran pemanggil terhadap
 * setiap kelas disahkan.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { classTags, splitName, type EmailProviderContact, type EmailProvider } from '@/lib/email-providers';

export type StatusKelas = 'active' | 'ended' | 'archived';

export function statusKelasEncharge(k: { ended_at: string | null; is_archived: boolean | null }): StatusKelas {
  if (k.is_archived) return 'archived';
  return k.ended_at ? 'ended' : 'active';
}

export function emelSeragam(e: string): string {
  return e.trim().toLowerCase();
}

export type PesertaKelas = { participant_id: string; email: string | null; nama: string };

/** Peserta kelas (bukan pendidik) dengan e-mel daripada auth.users. */
export async function pesertaKelas(svc: SupabaseClient, classId: string): Promise<PesertaKelas[]> {
  const [{ data: ahli }, { data: pendidik }] = await Promise.all([
    svc.from('qm_class_members').select('user_id').eq('class_id', classId),
    svc.from('qm_class_educators').select('educator_id').eq('class_id', classId),
  ]);
  const setPendidik = new Set((pendidik ?? []).map((e: { educator_id: string }) => e.educator_id));
  const ids = (ahli ?? []).map((m: { user_id: string }) => m.user_id).filter((u: string) => !setPendidik.has(u));
  if (ids.length === 0) return [];
  const { data: profil } = await svc.from('qm_profiles').select('id, display_name').in('id', ids);
  const nama = new Map((profil ?? []).map((p: { id: string; display_name: string | null }) => [p.id, p.display_name ?? '']));
  const emel = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 8) {
    const kump = ids.slice(i, i + 8);
    const hasil = await Promise.all(kump.map((id: string) => svc.auth.admin.getUserById(id).catch(() => null)));
    hasil.forEach((r, j) => {
      const e = r && !r.error ? r.data?.user?.email : null;
      if (e) emel.set(kump[j], emelSeragam(e));
    });
  }
  return ids.map((id: string) => ({ participant_id: id, email: emel.get(id) ?? null, nama: nama.get(id) ?? '' }));
}

/** E-mel yang sudah 'sent' untuk pemilik dan kelas ini. */
export async function emelSudahDihantar(svc: SupabaseClient, ownerId: string, classId: string): Promise<Set<string>> {
  const { data } = await svc
    .from('qm_encharge_sync_log')
    .select('email')
    .eq('owner_id', ownerId)
    .eq('class_id', classId)
    .eq('status', 'sent');
  return new Set((data ?? []).map((r: { email: string }) => r.email));
}

export type RancanganKelas = {
  class_id: string;
  class_name: string;
  status: StatusKelas;
  tags: string[];
  total_participants: number;
  to_send: number;
  skipped_already_sent: number;
  without_email: number;
  hantar: PesertaKelas[];
};

/** Rancang penghantaran satu kelas (dry run). */
export async function rancangKelas(
  svc: SupabaseClient,
  ownerId: string,
  k: { id: string; name: string; ended_at: string | null; is_archived: boolean | null },
  forceResync: boolean,
): Promise<RancanganKelas> {
  const peserta = await pesertaKelas(svc, k.id);
  const sudah = forceResync ? new Set<string>() : await emelSudahDihantar(svc, ownerId, k.id);
  const adaEmel = peserta.filter((p) => !!p.email);
  const dilangkau = adaEmel.filter((p) => sudah.has(p.email as string));
  const hantar = adaEmel.filter((p) => !sudah.has(p.email as string));
  return {
    class_id: k.id,
    class_name: k.name,
    status: statusKelasEncharge(k),
    tags: classTags(k.name),
    total_participants: peserta.length,
    to_send: hantar.length,
    skipped_already_sent: dilangkau.length,
    without_email: peserta.length - adaEmel.length,
    hantar,
  };
}

/**
 * Hantar satu kelas dan tulis log per peserta (upsert pada pemilik, kelas,
 * e-mel). Pulangkan kiraan dan senarai kegagalan (tanpa kunci).
 */
export async function hantarKelas(
  svc: SupabaseClient,
  penyedia: EmailProvider,
  kunci: string,
  ownerId: string,
  r: RancanganKelas,
  consentBy: string,
  source: 'mcp' | 'ui',
): Promise<{ sent: number; failed: number; failures: { email: string; status: number }[] }> {
  if (r.hantar.length === 0) return { sent: 0, failed: 0, failures: [] };
  const kenalan: EmailProviderContact[] = r.hantar.map((p) => {
    const { firstName, lastName } = splitName(p.nama);
    return { email: p.email as string, firstName, lastName, tags: r.tags };
  });
  const hasil = await penyedia.upsertContacts(kunci, kenalan);
  const keputusan = hasil.results ?? [];
  const sekarang = new Date().toISOString();
  const baris = r.hantar.map((p, i) => {
    const k = keputusan[i];
    const ok = !!k?.ok;
    return {
      owner_id: ownerId,
      class_id: r.class_id,
      participant_id: p.participant_id,
      email: p.email as string,
      tags: r.tags,
      status: ok ? 'sent' : 'failed',
      encharge_response: { http_status: k?.status ?? 0 },
      consent_confirmed_by: consentBy,
      source,
      synced_at: sekarang,
    };
  });
  // Baris 'sent' sedia ada tidak diturunkan kepada 'failed' oleh cubaan
  // force_resync yang gagal: hanya kegagalan baharu atau kejayaan ditulis.
  const sudah = await emelSudahDihantar(svc, ownerId, r.class_id);
  const tulis = baris.filter((b) => b.status === 'sent' || !sudah.has(b.email));
  for (let i = 0; i < tulis.length; i += 500) {
    await svc.from('qm_encharge_sync_log').upsert(tulis.slice(i, i + 500), { onConflict: 'owner_id,class_id,email' });
  }
  const failures = baris.filter((b) => b.status === 'failed').map((b) => ({
    email: b.email.replace(/^(.).*(@.*)$/, '$1***$2'),
    status: Number((b.encharge_response as { http_status: number }).http_status),
  }));
  return { sent: hasil.sent, failed: hasil.failed, failures };
}
