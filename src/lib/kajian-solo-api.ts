/**
 * KZ-UTT Fasa 4: akses data pelan pengukuran, persetujuan dan rekod
 * peserta. Pelayan sahaja (service role). Logik tetingkap ada dalam
 * src/lib/kajian-solo.ts; fail ini hanya memuatkan data untuknya.
 */
import { createHash } from 'node:crypto';
import type { SupaService } from '@/lib/lumba-solo-api';
import { titikTerbuka, type PelanUkur, type RekodPeserta } from '@/lib/kajian-solo';
import type { TitikUkur } from '@/lib/lumba-solo';

export type PelanPenuh = PelanUkur & {
  quiz_id: string;
  class_id: string;
  emails_enabled: boolean;
  consent_text: string | null;
  consent_version: number;
  updated_at: string;
};

export type Persetujuan = {
  quiz_id: string;
  user_id: string;
  decision: 'agree' | 'decline';
  consent_version: number;
  decided_at: string;
  withdrawn_at: string | null;
  unsubscribed_at: string | null;
};

export const LAJUR_PELAN =
  'quiz_id, class_id, module1_start_at, course_end_at, emails_enabled, consent_text, consent_version, day_length_sec, updated_at';
export const LAJUR_PERSETUJUAN =
  'quiz_id, user_id, decision, consent_version, decided_at, withdrawn_at, unsubscribed_at';

export async function muatPelan(svc: SupaService, quizId: string): Promise<PelanPenuh | null> {
  const { data } = await svc.from('qm_solo_measure_plans').select(LAJUR_PELAN).eq('quiz_id', quizId).maybeSingle();
  return (data ?? null) as PelanPenuh | null;
}

export async function muatPersetujuan(svc: SupaService, quizId: string, userId: string): Promise<Persetujuan | null> {
  const { data } = await svc
    .from('qm_research_consents')
    .select(LAJUR_PERSETUJUAN)
    .eq('quiz_id', quizId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data ?? null) as Persetujuan | null;
}

/** Peserta perlu memberi keputusan persetujuan (baharu, atau versi teks berubah). */
export function perluPersetujuan(pelan: PelanPenuh | null, p: Persetujuan | null): boolean {
  if (!pelan || !pelan.consent_text) return false;
  return !p || p.consent_version < pelan.consent_version;
}

/** Data peserta boleh dieksport (bersetuju dan belum tarik diri). */
export function bolehEksport(p: Persetujuan | null): boolean {
  return !!p && p.decision === 'agree' && !p.withdrawn_at;
}

/** Peserta boleh menerima e-mel kajian. */
export function bolehEmel(p: Persetujuan | null): boolean {
  return bolehEksport(p) && !p!.unsubscribed_at;
}

/** Kod peserta tanpa nama untuk eksport: stabil bagi setiap kuiz, tidak boleh diterbalikkan. */
export function kodPeserta(quizId: string, userId: string): string {
  return 'P' + createHash('sha256').update(`kz-utt:${quizId}:${userId}`, 'utf8').digest('hex').slice(0, 10);
}

/**
 * Rekod T1, T2, T3 (masa selesai larian ujian) dan tarikh sertai kelas bagi
 * senarai pengguna. Pengguna tanpa rekod tetap dipulangkan dengan null.
 */
export async function muatRekodPeserta(
  svc: SupaService,
  quizId: string,
  classId: string | null,
  userIds: string[],
): Promise<Map<string, RekodPeserta>> {
  const peta = new Map<string, RekodPeserta>();
  for (const u of userIds) peta.set(u, { t1Selesai: null, t2Selesai: null, t3Selesai: null, sertai: null });
  if (userIds.length === 0) return peta;

  for (let i = 0; i < userIds.length; i += 200) {
    const potong = userIds.slice(i, i + 200);
    const { data: larian, error } = await svc
      .from('qm_solo_runs')
      .select('user_id, measure_point, finished_at')
      .eq('quiz_id', quizId)
      .eq('test_mode', true)
      .eq('status', 'finished')
      .in('user_id', potong);
    if (error) throw new Error(`Run lookup failed: ${error.message}`);
    for (const l of (larian ?? []) as { user_id: string; measure_point: TitikUkur; finished_at: string | null }[]) {
      const r = peta.get(l.user_id);
      const t = l.finished_at ? Date.parse(l.finished_at) : NaN;
      if (!r || !Number.isFinite(t)) continue;
      if (l.measure_point === 'T1') r.t1Selesai = t;
      else if (l.measure_point === 'T2') r.t2Selesai = t;
      else if (l.measure_point === 'T3') r.t3Selesai = t;
    }
    if (classId) {
      const { data: ahli, error: ahliErr } = await svc
        .from('qm_class_members')
        .select('user_id, joined_at')
        .eq('class_id', classId)
        .in('user_id', potong);
      if (ahliErr) throw new Error(`Membership lookup failed: ${ahliErr.message}`);
      for (const a of (ahli ?? []) as { user_id: string; joined_at: string | null }[]) {
        const r = peta.get(a.user_id);
        const t = a.joined_at ? Date.parse(a.joined_at) : NaN;
        if (r && Number.isFinite(t)) r.sertai = t;
      }
    }
  }
  return peta;
}

/**
 * Titik larian untuk peserta ini. Jika pautan e-mel meminta T2 atau T3 dan
 * tetingkap peserta itu sedang terbuka mengikut pelan, titik itu dipakai;
 * jika tidak, titik yang dibuka pendidik pada kuiz (Fasa 1).
 */
export async function titikUntukPeserta(
  svc: SupaService,
  kuiz: { id: string; class_id: string | null; measure_point: TitikUkur | null },
  userId: string,
  diminta: unknown,
  pelan: PelanPenuh | null,
): Promise<TitikUkur | null> {
  if ((diminta === 'T2' || diminta === 'T3') && pelan) {
    const rekod = (await muatRekodPeserta(svc, kuiz.id, pelan.class_id, [userId])).get(userId)!;
    if (titikTerbuka(pelan, rekod, diminta, Date.now())) return diminta;
  }
  return kuiz.measure_point;
}
