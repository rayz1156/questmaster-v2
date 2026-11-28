/**
 * KZ-UTT Fasa 4: perancang e-mel susulan T2 dan T3.
 *
 * Berjalan setiap minit dalam proses Node (dimulakan oleh
 * instrumentation-node.ts). Bagi setiap pelan yang suis e-melnya hidup,
 * perancang mengambil ahli kelas yang bersetuju dan belum berhenti
 * langganan, mengira e-mel yang sudah tiba dengan susulanPerlu(), lalu
 * memasukkannya melalui qm_research_enqueue_followup. Kekangan unik
 * (kuiz, pengguna, titik, urutan) menjadikan larian berulang tidak berbahaya.
 *
 * Perancang tidak menghantar apa-apa: ia hanya mengisi baris gilir KZ-C.
 * Pekerja e-mel (src/lib/sijil/pekerjaEmel.ts) menyemak semula persetujuan,
 * keahlian dan status jawapan sejurus sebelum menghantar.
 */
import { getServiceSupabase } from '@/lib/supabase-route';
import { susulanPerlu } from '@/lib/kajian-solo';
import { LAJUR_PELAN, muatRekodPeserta, bolehEmel, petaPersetujuan, type PelanPenuh } from '@/lib/kajian-solo-api';
import { mulaPekerja } from '@/lib/sijil/pekerjaEmel';

export const SELANG_PERANCANG_MS = 60_000;

/** Satu pusingan perancang. Memulangkan bilangan e-mel yang dimasukkan. */
export async function jalankanPerancang(sekarang = Date.now()): Promise<number> {
  const svc = getServiceSupabase();
  const { data: pelanSemua, error } = await svc
    .from('qm_solo_measure_plans')
    .select(LAJUR_PELAN)
    .eq('emails_enabled', true);
  if (error) throw new Error(`Plan lookup failed: ${error.message}`);

  let dimasukkan = 0;
  for (const pelan of (pelanSemua ?? []) as PelanPenuh[]) {
    // Semua ahli kelas, kecuali yang menolak, tarik diri atau berhenti langganan.
    const { data: ahli, error: aErr } = await svc.from('qm_class_members').select('user_id').eq('class_id', pelan.class_id);
    if (aErr) throw new Error(`Membership lookup failed: ${aErr.message}`);
    const pers = await petaPersetujuan(svc, pelan.quiz_id);
    const layak = ((ahli ?? []) as { user_id: string }[])
      .map((a) => a.user_id)
      .filter((u) => bolehEmel(pers.get(u) ?? null));
    if (layak.length === 0) continue;

    const rekod = await muatRekodPeserta(svc, pelan.quiz_id, pelan.class_id, layak);
    for (const userId of layak) {
      const r = rekod.get(userId)!;
      // Bukan lagi ahli kelas: tiada tarikh sertai bermakna tiada e-mel.
      if (r.sertai === null) continue;
      for (const item of susulanPerlu(pelan, r, sekarang)) {
        const { data: id, error: qErr } = await svc.rpc('qm_research_enqueue_followup', {
          p_quiz: pelan.quiz_id,
          p_user: userId,
          p_class: pelan.class_id,
          p_point: item.point,
          p_seq: item.seq,
          p_ref_source: item.refSource,
          p_ref_at: new Date(item.refAt).toISOString(),
          p_due_at: new Date(item.dueAt).toISOString(),
          p_closes_at: new Date(item.closesAt).toISOString(),
        });
        if (qErr) {
          console.error(`[kajian] gagal memasukkan susulan ${item.point}/${item.seq}: ${qErr.message}`);
          continue;
        }
        if (id) dimasukkan += 1;
      }
    }
  }
  if (dimasukkan > 0) mulaPekerja();
  return dimasukkan;
}

type KeadaanPerancang = { pemasa: ReturnType<typeof setInterval> | null; berjalan: boolean };
const g = globalThis as unknown as { __kzPerancangKajian?: KeadaanPerancang };

/** Mulakan perancang berkala sekali bagi setiap proses. */
export function mulaPerancang(): void {
  if (!g.__kzPerancangKajian) g.__kzPerancangKajian = { pemasa: null, berjalan: false };
  const k = g.__kzPerancangKajian;
  if (k.pemasa) return;
  const pusingan = () => {
    if (k.berjalan) return;
    k.berjalan = true;
    jalankanPerancang()
      .then((n) => {
        if (n > 0) console.log(`[kajian] ${n} e-mel susulan dimasukkan ke baris gilir`);
      })
      .catch((e) => console.error('[kajian] perancang gagal:', e instanceof Error ? e.message : e))
      .finally(() => {
        k.berjalan = false;
      });
  };
  k.pemasa = setInterval(pusingan, SELANG_PERANCANG_MS);
  pusingan();
}
