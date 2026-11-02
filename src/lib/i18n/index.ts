/**
 * Terjemahan dwibahasa Kuizen (KZ-040): English (lalai) dan Bahasa Melayu.
 *
 * Enjin ini sengaja ringkas: dua kamus statik (tiada kebergantungan npm),
 * satu fungsi carian bertitik, interpolasi `{nama}`, dan jamak ringkas
 * melalui akhiran `_one` / `_other`.
 *
 * Kuki `kz_lang` tidak pernah dipercayai: nilainya mesti melalui `sahBahasa`
 * dan hanya 'en' / 'ms' diterima. Nilai kuki tidak pernah dibubuh ke dalam
 * HTML mentah; ia hanya memilih kamus.
 *
 * Interpolasi menggantikan `{pemboleh ubah}` dengan rentetan; ia tidak
 * menjana HTML dan tidak ada satu pun laluan di sini yang memanggil
 * `dangerouslySetInnerHTML`.
 */

import { en } from './kamus/en';
import { ms } from './kamus/ms';

/** Dua bahasa yang disokong. English ialah lalai. */
export type Bahasa = 'en' | 'ms';

/** Bahasa lalai bagi pengguna baharu tanpa kuki. */
export const BAHASA_LALAI: Bahasa = 'en';

/** Nama kuki pilihan bahasa (ditulis oleh PemilihBahasa di pelayar). */
export const NAMA_KUKI = 'kz_lang';

/** Nama storan tempatan yang mencermink kuki, untuk pembacaan segerak. */
export const NAMA_STORAN = 'kz_lang';

/** Kamus mengikut bahasa. */
export const KAMUS: Record<Bahasa, typeof en> = { en, ms };

/**
 * Laluan bertitik ke satu daun kamus, dijana daripada bentuk kamus English
 * (sumber jenis). Contoh: 'nav.classes', 'participant.scoreBreakdown'.
 */
export type KunciKamus = LaluanDaun<typeof en>;

/** Jana union semua laluan daib (rentetan) daripada objek bersarang. */
type LaluanDaun<T, Awalan extends string = ''> = T extends string
  ? Awalan
  : {
      [K in keyof T & string]: LaluanDaun<
        T[K],
        Awalan extends '' ? K : `${Awalan}.${K}`
      >;
    }[keyof T & string];

/** Kunci jamak: pasangan akhiran `_one` / `_other`, dipilih menerusi `terjemahBilangan`. */
export type KunciSatu = KunciKamus;
export type KunciRamai = KunciKamus;

/**
 * Terima apa sahaja nilai kuki dan pulangkan bahasa yang sah. Nilai yang
 * tidak dikenali (termasuk usaha suntikan) jatuh kembali ke `en`; tidak
 * pernah dipulangkan apa-apa selain dua huruf yang dibenarkan.
 */
export function sahBahasa(x: unknown): Bahasa {
  return x === 'ms' ? 'ms' : 'en';
}

/** Interpolasi `{nama}` dengan nilai selamat teks. */
function ganti(tsk: string, pembolehubah?: Record<string, string | number>): string {
  if (!pembolehubah) return tsk;
  return tsk.replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (penuh, kunci: string) =>
    Object.prototype.hasOwnProperty.call(pembolehubah, kunci)
      ? String(pembolehubah[kunci])
      : penuh
  );
}

/** Ambil nilai kamus untuk kunci bertitik, atau null jika tiada. */
function nilaiKamus(kamus: unknown, kunci: string): string | null {
  const bahagian = kunci.split('.');
  let masuk: unknown = kamus;
  for (const b of bahagian) {
    if (typeof masuk !== 'object' || masuk === null) return null;
    masuk = (masuk as Record<string, unknown>)[b];
  }
  return typeof masuk === 'string' ? masuk : null;
}

/** Kunci yang telah diperingatkan supaya setiap kunci hilang diperingat sekali sahaja. */
const kunciDiperingat = new Set<string>();

/**
 * Terjemah satu kunci bertitik dalam bahasa yang diberikan.
 *
 * Kunci yang tidak wujud memulangkan kunci itu sendiri (supaya skrin masih
 * boleh dibaca oleh pembangun) dan memaklumkan `console.warn` sekali sahaja
 * bagi setiap kunci. Keutamaan: kamus bahasa diminta, kemudian kamus English,
 * kemudian kunci mentah.
 */
export function terjemah(
  bahasa: Bahasa,
  kunci: KunciKamus,
  pembolehubah?: Record<string, string | number>
): string {
  const kamus = KAMUS[sahBahasa(bahasa)] ?? KAMUS.en;
  let tsk = nilaiKamus(kamus, kunci);
  if (tsk == null) {
    tsk = nilaiKamus(KAMUS.en, kunci);
    if (tsk == null) {
      if (!kunciDiperingat.has(kunci)) {
        kunciDiperingat.add(kunci);
        console.warn(`[i18n] kunci tiada dalam kamus: ${kunci}`);
      }
      // Kunci mentah dipulangkan supaya jelas di skrin semasa pembangunan.
      return ganti(kunci, pembolehubah);
    }
    if (!kunciDiperingat.has(`@${kunci}`)) {
      kunciDiperingat.add(`@${kunci}`);
      console.warn(`[i18n] kunci tiada dalam kamus ${bahasa}, guna English: ${kunci}`);
    }
  }
  return ganti(tsk, pembolehubah);
}

/**
 * Jamak ringkas: `terjemahBilangan` menerima kedua-dua kunci `_one` dan
 * `_other` secara berpasangan (keduanya bertaip `KunciKamus`) dan memilih
 * mengikut bilangan. Contoh:
 * `terjemahBilangan('ms', 'kelas.studentOne', 'kelas.studentOther', 3, { n: 3 })`.
 */
export function terjemahBilangan(
  bahasa: Bahasa,
  kunciSatu: KunciSatu,
  kunciRamai: KunciRamai,
  n: number,
  pembolehubah?: Record<string, string | number>
): string {
  return terjemah(bahasa, n === 1 ? kunciSatu : kunciRamai, pembolehubah);
}

/** Lokal Intl untuk setiap bahasa: en-GB untuk English, ms-MY untuk BM. */
export const LOKAL: Record<Bahasa, string> = { en: 'en-GB', ms: 'ms-MY' };