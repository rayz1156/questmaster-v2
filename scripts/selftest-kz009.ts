/**
 * Ujian logik KZ-009: PDF sijil QR sahaja. Kod sijil dan URL pengesahan
 * TIDAK lagi dicetak sebagai teks pada kedua-dua mod (standard dan
 * full_background); QR yang membawa URL kekal dilukis.
 *
 * Jalankan: npx tsx scripts/selftest-kz009.ts
 *
 * Kaedah yang benar-benar berfungsi (diuji): pdf-lib menulis teks sebagai
 * rentetan HEX dalam aliran kandungan, dan aliran itu boleh dimampatkan
 * dengan Flate, jadi carian bait mentah sahaja TIDAK cukup. Bacaan penuh
 * ialah bait mentah latin1 DITAMBAH semua aliran Flate yang berjaya
 * dinyahmampat; teks dicari sebagai hex besar (kaedah yang sama dengan
 * scripts/selftest-sijil-susunatur.ts). Kawalan positif (nama mestilah
 * dijumpai) membuktikan kaedah ini nampak teks yang memang dilukis,
 * supaya keputusan negatif bukan negatif palsu.
 */
import { janaPdfSijil, type SusunAturSijil } from '../src/lib/sijil/janaPdf';
import { writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { Buffer } from 'node:buffer';

let gagal = 0;

function semak(k: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`LULUS ${k}: ${detail}`);
  } else {
    gagal += 1;
    console.log(`GAGAL ${k}: ${detail}`);
  }
}

/** pdf-lib menulis teks sebagai hex string; tukar teks kepada hex besar. */
function hexTeks(s: string): string {
  return Buffer.from(s, 'latin1').toString('hex').toUpperCase();
}

/** Bacaan penuh PDF: latin1 mentah + semua aliran Flate yang berjaya
 *  dinyahmampat, supaya carian teks tidak tertipu oleh mampatan. */
function bacaanPenuh(bait: Uint8Array): string {
  const t = Buffer.from(bait.buffer, bait.byteOffset, bait.length).toString('latin1');
  let semua = t;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const start = m.index + m[0].length;
    const end = t.indexOf('endstream', start);
    if (end < 0) break;
    try {
      semua += inflateSync(Buffer.from(t.slice(start, end), 'latin1')).toString('latin1');
    } catch {
      // bukan stream mampat; abaikan
    }
  }
  return semua;
}

/** PNG 1x1 lut sinar yang sah, sebagai latar sintetik. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function kiraImej(teks: string): number {
  return (teks.match(/\/Subtype\s*\/Image/g) ?? []).length;
}

// Kod contoh dan URL pengesahan contoh (bunyi seperti sebenar supaya
// carian negatif bermakna; nama sengaja TIADA mengandungi kod contoh).
const KOD = 'KZ9TEST0001';
const URL_SAH = `https://kuizen.fun/sijil/${KOD}`;
const NAMA = 'Aisyah Binti Rahman';

/** Susun atur contoh reka bentuk Boss dengan kedudukan kod dari data
 *  lama (kunci code masih diterima normalisasi tetapi diabaikan). */
const SUSUN_BOSS_LAMA = {
  mode: 'full_background',
  name: { x: 0.505, y: 0.373, maxWidth: 0.6, size: 40, color: '#001F4B', weight: 'bold', align: 'center' },
  qr: { x: 0.815, y: 0.75, size: 0.08 },
  code: { x: 0.855, y: 0.885, size: 8, color: '#001F4B', align: 'center' },
};

async function jana(layout: unknown, tera = true): Promise<string> {
  const bait = await janaPdfSijil({
    nama: NAMA,
    program: 'Program Sains',
    tarikh: '5 Oktober 2026',
    pengeluar: 'Dr Hariz',
    kod: KOD,
    urlSah: URL_SAH,
    latar: new Uint8Array(PNG_1PX),
    tera,
    layout: layout as unknown as SusunAturSijil,
  });
  return bacaanPenuh(bait);
}

async function main() {
  // ------------------------------------------------------------------
  // Mod standard: kod dan URL tiada, nama dan QR ada
  // ------------------------------------------------------------------
  const std = await jana({}); // mod lalai standard
  semak('S1-nama-ada', std.includes(hexTeks(NAMA)),
    'kawalan positif: nama dijumpai (kaedah bacaan nampak teks yang dilukis)');
  semak('S2-tera-ada', std.includes(hexTeks('Dijana dengan Kuizen')),
    'kawalan positif: tera dijumpai (kuizen.fun tanpa /sijil dibenarkan)');
  semak('S3-kod-tiada', !std.includes(hexTeks(KOD)),
    `kod contoh ${KOD} TIADA sebagai teks`);
  semak('S4-label-kod-tiada', !std.includes(hexTeks('Certificate code:')),
    'label "Certificate code:" TIADA');
  semak('S5-url-tiada',
    !std.includes(hexTeks(URL_SAH)) && !std.includes(hexTeks('kuizen.fun/sijil')),
    'URL pengesahan TIADA sebagai teks pada mana-mana kedudukan');
  semak('S6-tajuk-kekal', std.includes(hexTeks('Certificate of Participation')),
    'tajuk dwibahasa mod standard kekal dicetak');

  // QR kekal pada mod standard. Mod standard melukis QR tanpa syarat
  // (susun.qr hanya berkesan pada mod full_background), jadi tanpa latar
  // satu-satunya objek imej dalam PDF ialah QR itu sendiri.
  const stdTanpaLatar = await janaPdfSijil({
    nama: NAMA,
    program: 'Program Sains',
    tarikh: '5 Oktober 2026',
    pengeluar: 'Dr Hariz',
    kod: KOD,
    urlSah: URL_SAH,
    tera: false,
    layout: {},
  });
  semak('S7-qr-kekal', kiraImej(bacaanPenuh(stdTanpaLatar)) >= 1,
    `QR dilukis: objek imej dalam PDF tanpa latar = ${kiraImej(bacaanPenuh(stdTanpaLatar))}`);

  // ------------------------------------------------------------------
  // Mod full_background (latar Canva): kod dan URL tiada walaupun
  // layout lama membawa kedudukan code
  // ------------------------------------------------------------------
  const fb = await jana(SUSUN_BOSS_LAMA);
  semak('F1-nama-ada', fb.includes(hexTeks(NAMA)),
    'kawalan positif: nama dijumpai di atas latar');
  semak('F2-kod-tiada', !fb.includes(hexTeks(KOD)),
    `kod contoh ${KOD} TIADA walaupun layout lama ada kedudukan code`);
  semak('F3-label-kod-tiada', !fb.includes(hexTeks('Certificate code:')),
    'label kod TIADA pada mod reka bentuk penuh');
  semak('F4-url-tiada',
    !fb.includes(hexTeks(URL_SAH)) && !fb.includes(hexTeks('kuizen.fun/sijil')),
    'URL pengesahan TIADA sebagai teks');
  semak('F5-teks-lalai-tiada',
    !fb.includes(hexTeks('Program Sains')) && !fb.includes(hexTeks('Completed on')),
    'mod reka bentuk penuh kekal tanpa tajuk/program/tarikh lalai');

  // QR kekal: latar 1px beralpha menjadi dua objek imej (imej + SMask),
  // jadi bandingan delta dengan qr:false.
  const fbTanpaQr = await jana({ mode: 'full_background', qr: false, code: false }, false);
  semak('F6-qr-kekal', kiraImej(fb) - kiraImej(fbTanpaQr) === 1 && kiraImej(fb) >= 3,
    `QR dilukis: tepat satu objek imej tambahan (${kiraImej(fbTanpaQr)} -> ${kiraImej(fb)})`);

  // ------------------------------------------------------------------
  // Contoh PDF untuk semakan mata CTO
  // ------------------------------------------------------------------
  const baitStd = await janaPdfSijil({
    nama: NAMA, program: 'Program Sains', tarikh: '5 Oktober 2026',
    pengeluar: 'Dr Hariz', kod: KOD, urlSah: URL_SAH,
    latar: new Uint8Array(PNG_1PX), tera: true, layout: {},
  });
  const laluanStd = 'C:/Users/Hariz/hermes-briefs/kuizen/contoh-sijil-kz009-standard.pdf';
  writeFileSync(laluanStd, baitStd);
  const baitFb = await janaPdfSijil({
    nama: NAMA, program: 'Program Sains', tarikh: '5 Oktober 2026',
    pengeluar: 'Dr Hariz', kod: KOD, urlSah: URL_SAH,
    latar: new Uint8Array(PNG_1PX), tera: true,
    layout: SUSUN_BOSS_LAMA as unknown as SusunAturSijil,
  });
  const laluanFb = 'C:/Users/Hariz/hermes-briefs/kuizen/contoh-sijil-kz009-fullbg.pdf';
  writeFileSync(laluanFb, baitFb);
  console.log(`Contoh PDF ditulis: ${laluanStd} (${baitStd.length} bait)`);
  console.log(`Contoh PDF ditulis: ${laluanFb} (${baitFb.length} bait)`);

  if (gagal > 0) {
    console.log(`\n${gagal} semakan GAGAL`);
    process.exit(1);
  }
  console.log('\nSemua semakan LULUS.');
}

main().catch((e) => {
  console.error('RALAT:', e);
  process.exit(1);
});
