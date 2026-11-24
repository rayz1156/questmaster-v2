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

/**
 * E-mel yang sudah 'sent' untuk pemilik dan kelas ini. Dibaca berhalaman
 * (1000 baris setiap halaman) kerana PostgREST mengehadkan baris balasan.
 */
// sejak (pilihan): hanya baris synced_at >= sejak, untuk force_resync yang
// disambung merentas panggilan.
export async function emelSudahDihantar(svc: SupabaseClient, ownerId: string, classId: string, sejak?: string): Promise<Set<string>> {
  const hasil = new Set<string>();
  for (let dari = 0; ; dari += 1000) {
    const { data, error } = await svc
      .from('qm_encharge_sync_log')
      .select('email')
      .eq('owner_id', ownerId)
      .eq('class_id', classId)
      .eq('status', 'sent')
      .gte('synced_at', sejak ?? '1970-01-01T00:00:00Z')
      .order('email', { ascending: true })
      .range(dari, dari + 999);
    if (error) throw new Error(`Could not read the Encharge sync log: ${error.message}`);
    for (const r of data ?? []) hasil.add((r as { email: string }).email);
    if (!data || data.length < 1000) return hasil;
  }
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
  resyncSince?: string,
): Promise<RancanganKelas> {
  const peserta = await pesertaKelas(svc, k.id);
  // force_resync: hanya yang sudah dihantar SEMULA dalam pusingan resync ini
  // (synced_at >= resyncSince) dilangkau, supaya panggilan sambungan maju.
  const sudah = forceResync
    ? resyncSince ? await emelSudahDihantar(svc, ownerId, k.id, resyncSince) : new Set<string>()
    : await emelSudahDihantar(svc, ownerId, k.id);
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

/** Saiz potongan kenalan: log ditulis dan bajet masa disemak antara potongan. */
const SAIZ_POTONGAN = 40;

export type HasilHantarKelas = {
  sent: number;
  failed: number;
  failures: { email: string; status: number }[];
  /** Kelas belum selesai kerana bajet masa atau had kenalan; panggil semula. */
  partial: boolean;
  /** Bilangan kenalan yang belum diproses dalam kelas ini. */
  remaining: number;
  log_write_failed: boolean;
};

/**
 * Hantar satu kelas dalam potongan SAIZ_POTONGAN kenalan dan tulis log per
 * peserta selepas setiap potongan (upsert pada pemilik, kelas, e-mel), jadi
 * kerja yang terhenti boleh disambung tanpa menghantar semula. Berhenti bila
 * tamatPada dilepasi atau hadKenalan dicapai.
 */
export async function hantarKelas(
  svc: SupabaseClient,
  penyedia: EmailProvider,
  kunci: string,
  ownerId: string,
  r: RancanganKelas,
  consentBy: string,
  source: 'mcp' | 'ui',
  had: { tamatPada: number; hadKenalan: number } = { tamatPada: Number.POSITIVE_INFINITY, hadKenalan: Number.POSITIVE_INFINITY },
): Promise<HasilHantarKelas> {
  const keluar: HasilHantarKelas = { sent: 0, failed: 0, failures: [], partial: false, remaining: 0, log_write_failed: false };
  let diproses = 0;
  while (diproses < r.hantar.length) {
    if (Date.now() > had.tamatPada || diproses >= had.hadKenalan) {
      keluar.partial = true;
      break;
    }
    const potongan = r.hantar.slice(diproses, Math.min(diproses + SAIZ_POTONGAN, diproses + Math.max(1, had.hadKenalan - diproses)));
    const kenalan: EmailProviderContact[] = potongan.map((p) => {
      const { firstName, lastName } = splitName(p.nama);
      return { email: p.email as string, firstName, lastName, tags: r.tags };
    });
    const hasil = await penyedia.upsertContacts(kunci, kenalan);
    diproses += potongan.length;
    keluar.sent += hasil.sent;
    keluar.failed += hasil.failed;
    const keputusan = hasil.results;
    if (!keputusan || keputusan.length !== potongan.length) {
      // Tanpa hasil per kenalan, log tidak ditulis supaya kejayaan tidak
      // direkodkan sebagai kegagalan (atau sebaliknya).
      keluar.log_write_failed = true;
      continue;
    }
    const sekarang = new Date().toISOString();
    const baris = potongan.map((p, i) => ({
      owner_id: ownerId,
      class_id: r.class_id,
      participant_id: p.participant_id,
      email: p.email as string,
      tags: r.tags,
      status: keputusan[i].ok ? 'sent' : 'failed',
      encharge_response: { http_status: keputusan[i].status },
      consent_confirmed_by: consentBy,
      source,
      synced_at: sekarang,
    }));
    // Kegagalan tidak menurunkan baris 'sent' sedia ada (force_resync).
    const gagal = baris.filter((b) => b.status === 'failed');
    let tulis = baris;
    if (gagal.length > 0) {
      const { data: sudah } = await svc
        .from('qm_encharge_sync_log')
        .select('email')
        .eq('owner_id', ownerId)
        .eq('class_id', r.class_id)
        .eq('status', 'sent')
        .in('email', gagal.map((b) => b.email));
      const setSudah = new Set((sudah ?? []).map((x: { email: string }) => x.email));
      tulis = baris.filter((b) => b.status === 'sent' || !setSudah.has(b.email));
    }
    const { error } = await svc.from('qm_encharge_sync_log').upsert(tulis, { onConflict: 'owner_id,class_id,email' });
    if (error) {
      console.error('[encharge] tulis log gagal:', error.message);
      keluar.log_write_failed = true;
    }
    for (const b of gagal) {
      keluar.failures.push({ email: b.email.replace(/^(.).*(@.*)$/, '$1***$2'), status: Number(b.encharge_response.http_status) });
    }
  }
  keluar.remaining = r.hantar.length - diproses;
  return keluar;
}
