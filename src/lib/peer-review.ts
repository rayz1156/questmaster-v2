/**
 * Cermin TypeScript bagi formula penilaian rakan sebaya.
 *
 * PENGIRAAN RASMI ialah public.qm_peer_compute dalam
 * supabase/migrations/0034_penilaian_rakan.sql (SECURITY DEFINER, dijalankan
 * di pangkalan data). Fail ini ialah cermin satu demi satu untuk:
 *   - scripts/selftest-penilaian-rakan.ts (ujian logik tanpa pangkalan data)
 *   - paparan nilai pada halaman pendidik/pelajar jika diperlukan kelak
 *
 * Kalau formula berubah, ubah KEDUA dua tempat dan jalankan kedua dua
 * ujian (skrip ini dan supabase/tests/KZ-001.sql pada pelayan).
 *
 * Peraturan yang mengikat (docs/SPEC-penilaian-rakan.md):
 *   - r(i) ialah bilangan penilaian yang benar benar diterima (count),
 *     BUKAN n - 1.
 *   - Pbar ialah PURATA (mean) P bagi ahli yang sah sahaja; "min" dalam
 *     teks Melayu bermaksud mean, bukan minimum.
 *   - JANGAN bundarkan P sebelum membahagi dengan Pbar; F Devi mesti
 *     0.6122 tepat (ujian penerimaan 1).
 *   - needs_review (SEMAK) dan flag (bendera warna) dua medan berasingan.
 */

export type BarisPenilaian = {
  rater_id: string;
  ratee_id: string;
  k1: number;
  k2: number;
  k3: number;
  k4: number;
  k5: number;
};

export type BarisKeputusan = {
  user_id: string;
  t_total: number;
  r_count: number;
  valid: boolean;
  p: number | null;
  pbar: number | null;
  f: number | null;
  f_mod: number;
  flag: 'MERAH' | 'KUNING' | 'HIJAU' | null;
  needs_review: boolean;
  team_at_risk: boolean;
};

/** Bundar kepada 4 tempat perpuluhan, untuk paparan dan perbandingan ujian sahaja. */
export function bundar4(n: number | null): number | null {
  if (n === null) return null;
  return Math.round(n * 10000) / 10000;
}

/**
 * Kira keputusan bagi SATU kumpulan dalam satu pusingan.
 * ahli: senarai user_id ahli kumpulan (termasuk yang tidak menghantar).
 * penilaian: baris penilaian kumpulan itu sahaja.
 */
export function kiraKeputusanKumpulan(
  ahli: string[],
  penilaian: BarisPenilaian[],
): BarisKeputusan[] {
  // LALUAN 1: T dan r bagi setiap ahli. r = count baris sebenar.
  const t = new Map<string, number>();
  const r = new Map<string, number>();
  for (const uid of ahli) {
    t.set(uid, 0);
    r.set(uid, 0);
  }
  for (const baris of penilaian) {
    if (!t.has(baris.ratee_id)) continue; // yang dinilai bukan ahli kumpulan ini
    const jumlah = baris.k1 + baris.k2 + baris.k3 + baris.k4 + baris.k5;
    t.set(baris.ratee_id, (t.get(baris.ratee_id) ?? 0) + jumlah);
    r.set(baris.ratee_id, (r.get(baris.ratee_id) ?? 0) + 1);
  }

  // P bagi ahli yang sah (r >= 2), ketepatan penuh, tanpa pembundaran.
  const p = new Map<string, number>();
  for (const uid of ahli) {
    const ri = r.get(uid) ?? 0;
    if (ri >= 2) p.set(uid, (t.get(uid) ?? 0) / ri);
  }

  // Pbar = purata P bagi ahli yang sah sahaja (pengangka dan pembahagi).
  const sah: number[] = Array.from(p.values());
  const pbar = sah.length > 0 ? sah.reduce((a, b) => a + b, 0) / sah.length : null;

  // LALUAN 2: F, Fmod, bendera, SEMAK.
  const baris2: BarisKeputusan[] = ahli.map((uid) => {
    const ri = r.get(uid) ?? 0;
    const ti = t.get(uid) ?? 0;
    const valid = p.has(uid);
    const pi = valid ? (p.get(uid) as number) : null;
    let f: number | null = null;
    let fMod = 1;
    let flag: BarisKeputusan['flag'] = null;
    let needsReview = false;

    if (!valid) {
      // Ahli tidak sah: P dan F tidak wujud, tiada bendera.
      needsReview = true;
    } else if (pbar === null || pbar === 0) {
      // Pbar sifar (semua memberi 0) atau tiada ahli sah: F tidak boleh dibahagi.
      needsReview = true;
    } else {
      f = (pi as number) / pbar;
      if (f > 1.0) {
        fMod = 1;
      } else if (f < 0.70) {
        fMod = 0.70;
        needsReview = true;
      } else {
        fMod = f;
      }
      // Bendera warna: MERAH disemak dahulu, bersarang, supaya KUNING
      // tidak menimpanya. SEMAK tidak disentuh di sini.
      if ((pi as number) <= 6.0 || f < 0.80) flag = 'MERAH';
      else if ((pi as number) <= 7.5 || f < 0.90) flag = 'KUNING';
      else flag = 'HIJAU';
    }

    return {
      user_id: uid,
      t_total: ti,
      r_count: ri,
      valid,
      p: pi,
      pbar,
      f,
      f_mod: fMod,
      flag,
      needs_review: needsReview,
      team_at_risk: false, // diisi selepas gelung
    };
  });

  // KUMPULAN BERISIKO: dua atau lebih ahli MERAH dalam kumpulan yang sama
  // menanda SEMUA ahli, termasuk yang HIJAU.
  const merah = baris2.filter((b) => b.flag === 'MERAH').length;
  const risk = merah >= 2;
  for (const b of baris2) b.team_at_risk = risk;

  return baris2;
}