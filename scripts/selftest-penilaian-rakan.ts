/**
 * Ujian sendiri untuk logik penilaian rakan sebaya tanpa pangkalan data.
 *
 * Jalankan:  npx tsx scripts/selftest-penilaian-rakan.ts
 *
 * Formula rasmi ialah public.qm_peer_compute dalam
 * supabase/migrations/0034_penilaian_rakan.sql; fail ini menguji cermin
 * TypeScript dalam src/lib/peer-review.ts supaya kedua dua pelaksanaan
 * kekal seiring. Nilai mengikat datang daripada "Ujian penerimaan"
 * docs/SPEC-penilaian-rakan.md: kes 0.6122, ahli tidak menghantar, Pbar
 * sifar, dan kumpulan dua orang.
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak
 * logik. Pembahagi r yang salah (n-1) dan P yang dibundar terlalu awal
 * adalah kegagalan senyap; kesilapan hanya kelihatan selepas sekelas
 * pelajar sudah dinilai.
 */
import { bundar4, kiraKeputusanKumpulan, type BarisPenilaian } from '../src/lib/peer-review';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log('PASS ' + name);
  } else {
    fail++;
    console.log('FAIL ' + name + ' :: ' + JSON.stringify(extra));
  }
}

// Pembantu: bina penilaian dengan jumlah tertentu (k1..k5, setiap 0..2).
function skor(rater: string, ratee: string, jumlah: number): BarisPenilaian {
  // Komposisi lalai: mulai semua 2, tolak 1 daripada kriteria terakhir
  // sehingga jumlah tercapai. Contoh jumlah 9 -> (2,2,2,2,1).
  const k = [2, 2, 2, 2, 2];
  let sisa = 10 - jumlah;
  let i = 4;
  while (sisa > 0 && i >= 0) {
    const tolak = Math.min(2, sisa);
    k[i] -= tolak;
    sisa -= tolak;
    i--;
  }
  return { rater_id: rater, ratee_id: ratee, k1: k[0], k2: k[1], k3: k[2], k4: k[3], k5: k[4] };
}

/* ===== Ujian 1: Contoh A, F Devi mesti 0.6122 tepat ===== */

const U1 = ['aisyah', 'baharu', 'chong', 'devi'];
const p1: BarisPenilaian[] = [
  { rater_id: 'devi', ratee_id: 'aisyah', k1: 2, k2: 2, k3: 2, k4: 2, k5: 2 }, // 10
  { rater_id: 'devi', ratee_id: 'baharu', k1: 2, k2: 2, k3: 2, k4: 2, k5: 2 }, // 10
  { rater_id: 'devi', ratee_id: 'chong', k1: 2, k2: 2, k3: 2, k4: 2, k5: 2 }, // 10
  skor('baharu', 'aisyah', 9),
  skor('baharu', 'chong', 9),
  skor('baharu', 'devi', 5),
  skor('chong', 'aisyah', 9),
  skor('chong', 'baharu', 8),
  skor('chong', 'devi', 5),
  skor('aisyah', 'baharu', 9),
  skor('aisyah', 'chong', 9),
  skor('aisyah', 'devi', 5),
];
const u1 = kiraKeputusanKumpulan(U1, p1);
const devi = u1.find((b) => b.user_id === 'devi')!;
const aisyah = u1.find((b) => b.user_id === 'aisyah')!;
const baharu = u1.find((b) => b.user_id === 'baharu')!;
const chong = u1.find((b) => b.user_id === 'chong')!;

check('U1: r ialah count sebenar (3), bukan n-1', devi.r_count === 3, devi.r_count);
check('U1: P Devi 5.0000', bundar4(devi.p) === 5.0, devi.p);
check('U1: Pbar 8.1667', bundar4(devi.pbar) === 8.1667, devi.pbar);
check('U1: F Devi 0.6122 tepat', bundar4(devi.f) === 0.6122, devi.f);
check('U1: Fmod Devi 0.7000', bundar4(devi.f_mod) === 0.7, devi.f_mod);
check('U1: bendera Devi MERAH', devi.flag === 'MERAH', devi.flag);
check('U1: SEMAK Devi BENAR', devi.needs_review === true, devi.needs_review);
check('U1: P Aisyah 9.3333', bundar4(aisyah.p) === 9.3333, aisyah.p);
check('U1: F Aisyah 1.1429', bundar4(aisyah.f) === 1.1429, aisyah.f);
check('U1: Fmod Aisyah 1.0000 (dipotong)', bundar4(aisyah.f_mod) === 1.0, aisyah.f_mod);
check('U1: Aisyah HIJAU tiada SEMAK', aisyah.flag === 'HIJAU' && !aisyah.needs_review, aisyah);
check('U1: P Baharu 9.0000, F 1.1020', bundar4(baharu.p) === 9.0 && bundar4(baharu.f) === 1.102, baharu);
check('U1: Chong sama Aisyah', bundar4(chong.p) === 9.3333 && bundar4(chong.f) === 1.1429, chong);
check('U1: tiada kumpulan berisiko (satu MERAH)', u1.every((b) => !b.team_at_risk), u1.map((b) => b.team_at_risk));

/* ===== Ujian 2: Contoh B, semua memberi 9, instrumen tidak menghukum ===== */

const u2 = kiraKeputusanKumpulan(['a', 'b', 'c'], [
  skor('a', 'b', 9), skor('a', 'c', 9),
  skor('b', 'a', 9), skor('b', 'c', 9),
  skor('c', 'a', 9), skor('c', 'b', 9),
]);
check(
  'U2: semua P 9.0, F 1.0, HIJAU, tiada SEMAK',
  u2.every((b) => bundar4(b.p) === 9.0 && bundar4(b.f) === 1.0 && bundar4(b.f_mod) === 1.0
    && b.flag === 'HIJAU' && !b.needs_review),
  u2,
);

/* ===== Ujian 3: Contoh C, sempadan F 0.8000 (Intan MERAH melalui P <= 6.0) ===== */

const U3 = ['farid', 'gina', 'hakim', 'intan'];
const p3: BarisPenilaian[] = [];
for (const rater of U3) {
  for (const ratee of U3) {
    if (rater === ratee) continue;
    p3.push(skor(rater, ratee, { farid: 9, gina: 8, hakim: 7, intan: 6 }[ratee]!));
  }
}
const u3 = kiraKeputusanKumpulan(U3, p3);
const intan = u3.find((b) => b.user_id === 'intan')!;
const hakim = u3.find((b) => b.user_id === 'hakim')!;
const farid = u3.find((b) => b.user_id === 'farid')!;
const gina = u3.find((b) => b.user_id === 'gina')!;
check('U3: Pbar 7.5000', bundar4(intan.pbar) === 7.5, intan.pbar);
check('U3: Intan P 6.0, F 0.8000 tepat', bundar4(intan.p) === 6.0 && bundar4(intan.f) === 0.8, intan);
check('U3: Intan MERAH melalui P <= 6.0 sahaja', intan.flag === 'MERAH', intan.flag);
check('U3: Intan tiada SEMAK (F tidak di bawah 0.70)', intan.needs_review === false, intan.needs_review);
check('U3: Hakim KUNING F 0.9333', hakim.flag === 'KUNING' && bundar4(hakim.f) === 0.9333, hakim);
check('U3: Farid HIJAU Fmod dipotong 1.0', farid.flag === 'HIJAU' && bundar4(farid.f_mod) === 1.0, farid);
check('U3: Gina HIJAU F 1.0667', gina.flag === 'HIJAU' && bundar4(gina.f) === 1.0667, gina);
check('U3: tiada SEMAK dalam Contoh C', u3.every((b) => !b.needs_review), u3.map((b) => b.needs_review));

/* ===== Ujian 4: ahli tidak sah (r 1), Pbar daripada tiga ahli lain ===== */

const U4 = ['wani', 'xin', 'yusuf', 'zamri'];
const p4: BarisPenilaian[] = [
  skor('wani', 'xin', 9), skor('wani', 'yusuf', 9), skor('wani', 'zamri', 5),
  skor('xin', 'wani', 9), skor('xin', 'yusuf', 9),
  skor('yusuf', 'wani', 9), skor('yusuf', 'xin', 9),
];
const u4 = kiraKeputusanKumpulan(U4, p4);
const zamri = u4.find((b) => b.user_id === 'zamri')!;
const wani = u4.find((b) => b.user_id === 'wani')!;
check('U4: Zamri valid=false', zamri.valid === false, zamri);
check('U4: Zamri P NULL', zamri.p === null, zamri.p);
check('U4: Zamri F NULL', zamri.f === null, zamri.f);
check('U4: Zamri Fmod 1.0000', bundar4(zamri.f_mod) === 1.0, zamri.f_mod);
check('U4: Zamri bendera NULL', zamri.flag === null, zamri.flag);
check('U4: Zamri SEMAK BENAR', zamri.needs_review === true, zamri.needs_review);
check('U4: Pbar daripada tiga ahli sahaja (9.0), bukan dibahagi empat', bundar4(wani.pbar) === 9.0, wani.pbar);
check('U4: Wani P 9.0 HIJAU', bundar4(wani.p) === 9.0 && wani.flag === 'HIJAU', wani);

/* ===== Ujian 5: pembahagi r bukan n-1 (ahli tidak menghantar) ===== */

const U5 = ['puteri', 'qistina', 'raihan', 'suresh'];
const p5: BarisPenilaian[] = [
  skor('qistina', 'raihan', 9), skor('qistina', 'suresh', 9), skor('qistina', 'puteri', 9),
  skor('raihan', 'qistina', 9), skor('raihan', 'suresh', 9), skor('raihan', 'puteri', 9),
  skor('suresh', 'qistina', 9), skor('suresh', 'raihan', 9), skor('suresh', 'puteri', 9),
];
const u5 = kiraKeputusanKumpulan(U5, p5);
const qistina = u5.find((b) => b.user_id === 'qistina')!;
const puteri = u5.find((b) => b.user_id === 'puteri')!;
check('U5: Qistina menerima 2 penilaian', qistina.r_count === 2, qistina.r_count);
check('U5: P Qistina 9.0 (pembahagi 2, bukan 3)', bundar4(qistina.p) === 9.0, qistina.p);
check('U5: Qistina HIJAU (bukan MERAH akibat pembahagi salah)', qistina.flag === 'HIJAU', qistina.flag);
check('U5: Puteri (tidak menghantar) tetap dinilai r 3, P 9.0', puteri.r_count === 3 && bundar4(puteri.p) === 9.0, puteri);

/* ===== Ujian 6: kumpulan berisiko ===== */

const U6 = ['p', 'q', 'r', 's'];
const p6: BarisPenilaian[] = [];
for (const rater of U6) {
  for (const ratee of U6) {
    if (rater === ratee) continue;
    p6.push(skor(rater, ratee, { p: 5, q: 6, r: 9, s: 9 }[ratee]!));
  }
}
const u6 = kiraKeputusanKumpulan(U6, p6);
const merahCount = u6.filter((b) => b.flag === 'MERAH').length;
check('U6: dua MERAH dalam kumpulan (P 5 dan P 6)', merahCount === 2, u6.map((b) => [b.user_id, b.flag]));
check('U6: team_at_risk BENAR bagi SEMUA ahli termasuk HIJAU', u6.every((b) => b.team_at_risk === true), u6.map((b) => [b.user_id, b.team_at_risk]));

/* ===== Ujian 7: Pbar sifar (semua memberi 0 kepada semua) ===== */

const U7 = ['a', 'b', 'c'];
const p7: BarisPenilaian[] = [];
for (const rater of U7) {
  for (const ratee of U7) {
    if (rater === ratee) continue;
    p7.push({ rater_id: rater, ratee_id: ratee, k1: 0, k2: 0, k3: 0, k4: 0, k5: 0 });
  }
}
const u7 = kiraKeputusanKumpulan(U7, p7);
check(
  'U7: Pbar sifar, Fmod 1.0, SEMAK BENAR, bendera NULL bagi semua',
  u7.every((b) => b.pbar === 0 && bundar4(b.f_mod) === 1.0 && b.needs_review === true && b.flag === null),
  u7,
);

/* ===== Ujian 8: kumpulan dua orang (setiap orang r 1) ===== */

const u8 = kiraKeputusanKumpulan(['a', 'b'], [skor('a', 'b', 9), skor('b', 'a', 9)]);
check(
  'U8: kedua dua ahli tidak sah (r 1), Fmod 1.0, SEMAK, bendera NULL',
  u8.every((b) => b.valid === false && bundar4(b.f_mod) === 1.0 && b.needs_review === true && b.flag === null && b.p === null),
  u8,
);

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);