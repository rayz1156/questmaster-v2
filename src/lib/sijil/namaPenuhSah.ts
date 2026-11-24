/**
 * Pengesahan format nama penuh (KZ-E). Fungsi tulen tanpa kebergantungan
 * Node, supaya halaman /nama dan pelayan memakai peraturan yang SAMA
 * (cubaan gagal di pelayan hanya berlaku bagi klien yang diubah suai).
 */
/** Gelaran panggilan atau hormat yang tidak dicetak sebagai nama kad pengenalan. */
// Tuan, Mak, Pak, Cik, Haji dan Hajah TIDAK ditolak: ia boleh menjadi
// sebahagian nama sah dalam kad pengenalan (contoh "Tuan Nor Azlina binti
// Tuan Ismail", nama keluarga "Mak").
const GELARAN_DITOLAK =
  /^(bro|brader|sis|kak|akak|kakak|abg|abang|bang|adik|dik|encik|en|puan|pn|mr|mrs|ms|miss|madam|mdm|cikgu|ustaz|ustazah|uncle|auntie|aunty)\.?(\s|$)/i;

/** Huruf (termasuk beraksen), ruang dan ' - . @ / sahaja. */
// RegExp dengan bendera 'u' dibina melalui konstruktor (sasaran tsconfig ES5).
const AKSARA_SAH = new RegExp("^[\\p{L}\\p{M}' .@/-]+$", 'u');
const ADA_HURUF = new RegExp('\\p{L}', 'u');

export type HasilNama = { ok: true; nama: string } | { ok: false; mesej: string };

/** Sahkan nama penuh yang diisi peserta. Mesej dalam Bahasa Melayu. */
export function sahkanNamaPenuh(input: unknown): HasilNama {
  // Apostrof telefon (’ ‘ ʼ `) ditukar kepada ' sebelum semakan.
  const nama = String(input ?? '')
    .normalize('NFC')
    .replace(/[\u2018\u2019\u02BC\u0060\u00B4]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (nama.length < 5 || nama.length > 120) {
    return { ok: false, mesej: 'Nama mesti antara 5 hingga 120 aksara.' };
  }
  if (/[0-9_]/.test(nama)) {
    return { ok: false, mesej: 'Nama tidak boleh mengandungi nombor atau garis bawah. Tulis nama penuh seperti dalam kad pengenalan.' };
  }
  if (!AKSARA_SAH.test(nama)) {
    return { ok: false, mesej: "Nama hanya boleh mengandungi huruf, ruang dan aksara ' - . @ /. Emoji dan simbol lain tidak dibenarkan." };
  }
  const perkataan = nama.split(' ').filter((w) => ADA_HURUF.test(w));
  if (perkataan.length < 2) {
    return { ok: false, mesej: 'Sila tulis nama penuh sekurang-kurangnya dua perkataan, seperti dalam kad pengenalan.' };
  }
  if (GELARAN_DITOLAK.test(nama)) {
    return { ok: false, mesej: 'Jangan mulakan nama dengan gelaran atau panggilan seperti "Bro", "Kak", "Mr." atau "Puan". Tulis nama penuh seperti dalam kad pengenalan.' };
  }
  return { ok: true, nama };
}

