/**
 * Pembantu kad harga di landing page (tiket V2-006).
 *
 * Semua angka yang muncul pada kad harga dibina di sini daripada HAD_PELAN
 * dan HARGA_PELAN. Komponen BahagianHarga hanya menterjemah kunci kepada
 * teks; tiada angka ditulis terus dalam komponen atau landing-copy.ts.
 * scripts/selftest-harga.ts menguji bahawa baris ini sepadan dengan HAD_PELAN.
 */
import { HAD_PELAN, type Pelan } from './pelan';

/** Format ringgit: 0 -> RM0, 228 -> RM228, 1500 -> RM1,500. */
export function formatRM(n: number): string {
  return 'RM' + n.toLocaleString('en-US');
}

/** Format storan: 100 -> 100 MB, 1024 -> 1 GB, 10240 -> 10 GB. */
export function formatStoran(mb: number): string {
  if (mb >= 1024 && mb % 1024 === 0) return `${mb / 1024} GB`;
  return `${mb} MB`;
}

export type BarisKunci =
  | 'kelas'
  | 'pesertaSeKelas'
  | 'pemainSeSesi'
  | 'aktiviti'
  | 'papan'
  | 'pasukan'
  | 'storan'
  | 'saizFail'
  | 'sijil'
  | 'penilaianRakan'
  | 'googleForm'
  | 'laporan'
  | 'aksesMcp'
  | 'adminInvois';

export type BarisKad = {
  kunci: BarisKunci;
  /** Angka terformat daripada HAD_PELAN, atau null untuk baris teks/semak. */
  angka: string | null;
  /** Baris semak ciri: true = termasuk, false = tidak termasuk, null = bukan baris semak. */
  termasuk: boolean | null;
};

/**
 * Baris kad harga untuk satu pelan. Susunan tetap: had kuantiti dahulu,
 * kemudian ciri semak. null pada HAD_PELAN dipaparkan sebagai "Tanpa had"
 * oleh komponen.
 */
export function barisKad(pelan: Pelan): BarisKad[] {
  const h = HAD_PELAN[pelan];
  const ciri = h.penilaianRakan; // Pro dan Institusi: ya; Percuma: tidak
  return [
    { kunci: 'kelas', angka: String(h.kelas), termasuk: null },
    { kunci: 'pesertaSeKelas', angka: h.ahliSeKelas === null ? null : String(h.ahliSeKelas), termasuk: null },
    { kunci: 'pemainSeSesi', angka: String(h.pemainSesi), termasuk: null },
    { kunci: 'aktiviti', angka: h.aktiviti === null ? null : String(h.aktiviti), termasuk: null },
    { kunci: 'papan', angka: h.papan === null ? null : String(h.papan), termasuk: null },
    { kunci: 'pasukan', angka: null, termasuk: true },
    { kunci: 'storan', angka: formatStoran(h.storageMb), termasuk: null },
    { kunci: 'saizFail', angka: `${h.fileMb} MB`, termasuk: null },
    { kunci: 'sijil', angka: null, termasuk: null },
    { kunci: 'penilaianRakan', angka: null, termasuk: ciri },
    { kunci: 'googleForm', angka: null, termasuk: ciri },
    { kunci: 'laporan', angka: null, termasuk: ciri },
    { kunci: 'aksesMcp', angka: null, termasuk: ciri },
    { kunci: 'adminInvois', angka: null, termasuk: pelan === 'institution' },
  ];
}
