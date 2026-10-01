/**
 * Ujian logik V2-015: susun atur sijil (normaliseSusunAtur) dan mod
 * latar reka bentuk penuh dalam janaPdf.
 *
 * Jalankan: npx tsx scripts/selftest-sijil-susunatur.ts
 *
 * Mod full_background diuji dengan latar PNG sintetik 1x1: teks lalai
 * (tajuk, program, tarikh, pengeluar) TIDAK boleh muncul manakala nama
 * dan (pilihan) QR dan kod sijil muncul pada kedudukan pecahan.
 */
import { janaPdfSijil, type SusunAturSijil } from '../src/lib/sijil/janaPdf';
import {
  normaliseSusunAtur,
  WARNA_LALAI,
  PANJANG_TAJUK_MAKS,
} from '../src/lib/sijil/susunAtur';
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

/** Bandingan dalam, tidak peka tertib kunci. */
function sama(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a as Record<string, unknown>);
  const kb = Object.keys(b as Record<string, unknown>);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    sama((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Susun atur contoh sebenar reka bentuk Boss (tiket V2-015 baris 18). */
const SUSUN_BOSS = {
  mode: 'full_background',
  name: { x: 0.505, y: 0.373, maxWidth: 0.6, size: 40, color: '#001F4B', weight: 'bold', align: 'center' },
  qr: { x: 0.815, y: 0.75, size: 0.08 },
  code: { x: 0.855, y: 0.885, size: 8, color: '#001F4B', align: 'center' },
};

async function janaFullBg(
  layout: unknown,
  nama: string,
  tera = true,
  kod = 'CONTOH0000',
): Promise<string> {
  const bait = await janaPdfSijil({
    nama,
    program: 'Program Sains',
    tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz',
    kod,
    urlSah: `https://kuizen.fun/sijil/${kod}`,
    latar: new Uint8Array(PNG_1PX),
    tera,
    layout: layout as unknown as SusunAturSijil,
  });
  return bacaanPenuh(bait);
}

async function main() {
  // ------------------------------------------------------------------
  // 1-9: normaliseSusunAtur
  // ------------------------------------------------------------------
  const n1 = normaliseSusunAtur({
    foo: 'bar',
    tajuk: 123,
    titleBm: '  Sijil ',
    mode: 'full_background',
    name: { x: 1.5, y: -2, maxWidth: 0.6, size: 200, color: 'red', weight: 'italic', align: 'right' },
    qr: { x: 0.5, y: 0.5, size: 1 },
    code: { x: 0.5, y: 0.9, size: 99, color: '#AABBCC', align: 'middle' },
  });
  semak('1-kunci-asing', !('foo' in n1) && !('tajuk' in n1), 'kunci foo dan tajuk dibuang');
  semak('2-apit-xy', n1.name?.x === 1 && n1.name?.y === 0, `name x=${n1.name?.x} y=${n1.name?.y} (diapit 0..1)`);
  semak('3-size-nama', n1.name?.size === 96, `name.size ${n1.name?.size} (diapit 8..96)`);
  semak('4-warna', n1.name?.color === WARNA_LALAI, `warna tidak sah -> ${n1.name?.color}`);
  semak('5-weight-align', n1.name?.weight === undefined && n1.name?.align === 'center',
    'weight tidak sah dibuang, align tidak sah jatuh center');
  semak('6-qr-size', n1.qr !== false && n1.qr?.size === 0.2, `qr.size ${n1.qr !== false ? n1.qr?.size : '?'} (diapit 0.04..0.2)`);
  semak('7-code-size-warna', n1.code !== false && n1.code?.size === 24 && n1.code?.color === '#AABBCC',
    'code.size diapit ke 24, warna sah kekal seperti asal');
  semak('8-tajuk', n1.titleBm === 'Sijil', `titleBm dipangkas ruang: "${n1.titleBm}"`);

  const n2 = normaliseSusunAtur({ titleBm: 'A'.repeat(300) });
  semak('9-tajuk-120', (n2.titleBm ?? '').length === PANJANG_TAJUK_MAKS,
    `tajuk dipangkas kepada ${PANJANG_TAJUK_MAKS} aksara`);

  const n3 = normaliseSusunAtur({ mode: 'pijah', qr: false, code: false });
  semak('10-mode-tak-sah', n3.mode === undefined, 'mode tidak sah dibuang (lalai standard)');
  semak('11-false-dikekal', n3.qr === false && n3.code === false, 'qr false dan code false dikekalkan');

  const n4 = normaliseSusunAtur({ name: { x: 0.5, y: 0.3, maxWidth: 0.6 } });
  semak('12-name-tak-lengkap', n4.name === undefined, 'name tanpa size dibuang sepenuhnya');

  const jahat = [
    normaliseSusunAtur(null),
    normaliseSusunAtur([1, 2]),
    normaliseSusunAtur('x'),
    normaliseSusunAtur(42),
    normaliseSusunAtur(undefined),
  ];
  semak('13-input-jahat', jahat.every((h) => sama(h, {})),
    'null / array / rentetan / nombor -> layout kosong');

  const sekali = normaliseSusunAtur({ ...SUSUN_BOSS, name: { ...SUSUN_BOSS.name, x: 3 } });
  semak('14-idempoten', sama(normaliseSusunAtur(sekali), sekali), 'normalkan dua kali = sama hasil');

  semak('15-boss-sah', sama(normaliseSusunAtur(SUSUN_BOSS), SUSUN_BOSS),
    'contoh reka bentuk Boss lulus tanpa perubahan');

  // ------------------------------------------------------------------
  // 16-17: mod standard tinggal sama
  // ------------------------------------------------------------------
  const std = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman', program: 'Kelas Sains', tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz', kod: 'AB3CD4EF5G', urlSah: 'https://kuizen.fun/sijil/AB3CD4EF5G',
    latar: new Uint8Array(PNG_1PX), tera: true, layout: {},
  });
  const teksStd = bacaanPenuh(std);
  semak('16-standard-tajuk', teksStd.includes(hexTeks('Sijil Penyertaan'))
    && teksStd.includes(hexTeks('Certificate of Participation')),
    'mod standard masih melukis tajuk dwibahasa lalai');
  semak('17-standard-semua',
    teksStd.includes(hexTeks('Aisyah Binti Rahman'))
    && teksStd.includes(hexTeks('Kelas Sains'))
    && teksStd.includes(hexTeks('Certificate code: AB3CD4EF5G')),
    'mod standard masih melukis nama, program dan baris kod');

  // ------------------------------------------------------------------
  // 18-21: full_background tidak melukis teks lalai
  // ------------------------------------------------------------------
  const fb = await janaFullBg(SUSUN_BOSS, 'Aisyah Binti Rahman');
  semak('18-tanpa-tajuk', !fb.includes(hexTeks('Sijil Penyertaan'))
    && !fb.includes(hexTeks('Certificate of Participation')),
    'tajuk dwibahasa TIADA');
  semak('19-tanpa-program-tarikh', !fb.includes(hexTeks('Program Sains'))
    && !fb.includes(hexTeks('Completed on')),
    'program dan tarikh TIADA');
  semak('20-tanpa-pengeluar', !fb.includes(hexTeks('Dr Hariz'))
    && !fb.includes(hexTeks('Certificate code:')),
    'pengeluar dan baris kod lalai TIADA');
  semak('21-nama-ada', fb.includes(hexTeks('Aisyah Binti Rahman')), 'nama ADA pada kedudukan');

  // QR dimatikan sepenuhnya untuk pembanding objek imej.
  const fbTanpa = await janaFullBg(
    { mode: 'full_background', qr: false, code: false }, 'Budi Santoso', false,
  );

  // PNG latar 1x1 beralpha: pdf-lib menjadikannya DUA objek imej (imej +
  // SMask), jadi bandingan delta, bukan nombor mutlak.
  semak('22-latqr-imej', kiraImej(fb) - kiraImej(fbTanpa) === 1 && kiraImej(fb) >= 2,
    `QR dilukis: tepat satu objek imej tambahan (${kiraImej(fbTanpa)} -> ${kiraImej(fb)})`);
  semak('23-kod-ada', fb.includes(hexTeks('CONTOH0000')), 'kod sijil ADA di bawah QR');
  semak('24-tera', fb.includes(hexTeks('Dijana dengan Kuizen')), 'tera dihormati bila tera=true');
  semak('25-qr-false', kiraImej(fbTanpa) >= 2 && kiraImej(fbTanpa) < kiraImej(fb),
    `qr:false -> latar tetap dilukis, QR tidak (${kiraImej(fbTanpa)} objek)`);
  semak('26-kod-false', !fbTanpa.includes(hexTeks('CONTOH0000')), 'code:false -> tiada kod');
  semak('27-tera-false', !fbTanpa.includes(hexTeks('Dijana dengan Kuizen')), 'tera=false -> tiada tera');

  // ------------------------------------------------------------------
  // 28: nama panjang dikecilkan, tiada ralat
  // ------------------------------------------------------------------
  const namaPanjang = 'Mohamad Al Amin bin Syed Abdullah Al-Attas Rahman ibnu Al-Husain Mahathir the Third Junior IV';
  const fbPanjang = await janaFullBg(
    { mode: 'full_background', name: { x: 0.5, y: 0.3, maxWidth: 0.4, size: 96, color: '#001F4B' } },
    namaPanjang,
  );
  semak('28-nama-panjang', fbPanjang.includes(hexTeks(namaPanjang)),
    'nama panjang dikecilkan supaya muat maxWidth dan tetap dilukis');

  // ------------------------------------------------------------------
  // 29: tanpa name (lalai tengah) tetap jana
  // ------------------------------------------------------------------
  const fbLalai = await janaFullBg({ mode: 'full_background' }, 'Nama Lalai');
  semak('29-nama-lalai', fbLalai.includes(hexTeks('Nama Lalai')) && kiraImej(fbLalai) === kiraImej(fb),
    'tanpa name: nama dilukis di tengah dan QR lalai muncul');

  // ------------------------------------------------------------------
  // 30-35: normaliseSusunAtur medan baharu (V2-016b)
  // ------------------------------------------------------------------
  const m1 = normaliseSusunAtur({
    mode: 'full_background',
    course: { x: 0.5, y: 0.2, maxWidth: 0.6, size: 40, color: 'red', weight: 'italic', align: 'right' },
    details: { x: 0.5, y: 0.3, maxWidth: 0.8, size: 300, color: '#001F4B' },
    signer: { x: 0.1, y: 0.9, maxWidth: 0.3, size: 20, color: '#001F4B', align: 'right' },
    signature: { x: 0.1, y: 0.8, width: 5 },
  });
  // Selepas normalisasi dengan objek penuh, semua kekunci mestilah objek.
  const kursus = m1.course as Exclude<typeof m1.course, false | undefined>;
  const butiran = m1.details as Exclude<typeof m1.details, false | undefined>;
  const pena = m1.signer as Exclude<typeof m1.signer, false | undefined>;
  const sig = m1.signature as Exclude<typeof m1.signature, false | undefined>;
  semak('30-course-bentuk-name',
    kursus.x === 0.5 && kursus.size === 40 && kursus.color === WARNA_LALAI
      && kursus.align === 'center' && kursus.weight === undefined,
    'course berkongsi bentuk name: warna lalai, align lalai, weight tidak sah dibuang');
  semak('31-details-size', butiran.size === 96, `details.size diapit ke 96 (${butiran.size})`);
  semak('32-signer-tanpa-weight',
    pena.align === 'center' && pena.size === 20 && !('weight' in pena),
    'signer: align lalai center dan tiada medan weight');
  semak('33-signature-apit', sig.width === 0.5 && sig.x === 0.1,
    `signature.width diapit ke 0.5 (${sig.width})`);
  const m2 = normaliseSusunAtur({ course: false, details: false, signer: false, signature: false });
  semak('34-false-dikekal',
    m2.course === false && m2.details === false && m2.signer === false && m2.signature === false,
    'course/details/signer/signature false dikekalkan (jangan cetak)');
  const m3 = normaliseSusunAtur({
    course: { x: 0.5, y: 0.2, maxWidth: 0.6 },
    signature: { x: 0.1, y: 0.8 },
  });
  semak('35-tak-lengkap', m3.course === undefined && m3.signature === undefined,
    'course tanpa size dan signature tanpa width dibuang sepenuhnya');
  semak('36-idempoten-baru', sama(normaliseSusunAtur(m1), m1),
    'normalkan semula layout medan baharu = sama hasil');

  // ------------------------------------------------------------------
  // 37-44: medan isian pada janaPdf (V2-016b)
  // ------------------------------------------------------------------
  const MEDAN = {
    course: 'Bengkel Robotik UPSI 2026',
    date_start: '2026-10-01',
    date_end: '2026-10-03',
    location: 'Dewan Kuliah FKMT, UPSI',
    signer_name: 'Dr Hariz',
    signer_title: 'Pensyarah Kanan',
  };
  const SUSUN_MEDAN = {
    mode: 'full_background',
    qr: false,
    code: false,
    name: { x: 0.5, y: 0.35, maxWidth: 0.7, size: 40, color: '#001F4B' },
    course: { x: 0.5, y: 0.25, maxWidth: 0.7, size: 18, color: '#001F4B' },
    details: { x: 0.5, y: 0.65, maxWidth: 0.8, size: 11, color: '#001F4B' },
    signer: { x: 0.12, y: 0.9, maxWidth: 0.3, size: 12, color: '#001F4B', align: 'left' },
    signature: { x: 0.12, y: 0.72, width: 0.1 },
  };
  const fbMedan = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman',
    program: 'Program Sains',
    tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz',
    kod: 'CONTOH0000',
    urlSah: 'https://kuizen.fun/sijil/CONTOH0000',
    latar: new Uint8Array(PNG_1PX),
    tera: false,
    layout: SUSUN_MEDAN as unknown as SusunAturSijil,
    medan: MEDAN,
    tandatangan: new Uint8Array(PNG_1PX),
  });
  const teksFbMedan = bacaanPenuh(fbMedan);
  semak('37-kursus-ada', teksFbMedan.includes(hexTeks('Bengkel Robotik UPSI 2026')),
    'kursus dicetak pada kedudukan course');
  semak('38-butiran-ada',
    teksFbMedan.includes(hexTeks('1 hingga 3 Oktober 2026 | Dewan Kuliah FKMT, UPSI')),
    'baris butiran tarikh | tempat dicetak');
  semak('39-penandatangan-ada',
    teksFbMedan.includes(hexTeks('Dr Hariz')) && teksFbMedan.includes(hexTeks('Pensyarah Kanan')),
    'nama tebal dan jawatan dicetak pada blok signer');

  const fbMedanTanpaImej = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman',
    program: 'Program Sains',
    tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz',
    kod: 'CONTOH0000',
    urlSah: 'https://kuizen.fun/sijil/CONTOH0000',
    latar: new Uint8Array(PNG_1PX),
    tera: false,
    layout: SUSUN_MEDAN as unknown as SusunAturSijil,
    medan: MEDAN,
  });
  semak('40-imej-tandatangan',
    kiraImej(teksFbMedan) - kiraImej(bacaanPenuh(fbMedanTanpaImej)) >= 1,
    'imej tandatangan dilukis (PNG 1px beralpha: imej + SMask = dua objek tambahan)');

  const fbMedanKosong = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman',
    program: 'Program Sains',
    tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz',
    kod: 'CONTOH0000',
    urlSah: 'https://kuizen.fun/sijil/CONTOH0000',
    latar: new Uint8Array(PNG_1PX),
    tera: false,
    layout: SUSUN_MEDAN as unknown as SusunAturSijil,
    medan: {},
  });
  const teksKosong = bacaanPenuh(fbMedanKosong);
  semak('41-medan-kosong-senyap',
    !teksKosong.includes(hexTeks('Bengkel')) && !teksKosong.includes(hexTeks('Dr Hariz'))
      && !teksKosong.includes(hexTeks('|')),
    'medan kosong: tiada label, tiada ruang aneh, tiada apa-apa dicetak');

  let ralatAksara: unknown = null;
  let teksAksara = '';
  try {
    const fbAksara = await janaPdfSijil({
      nama: 'Nama',
      program: 'Program',
      tarikh: '30 September 2026',
      pengeluar: 'Dr Hariz',
      kod: 'CONTOH0000',
      urlSah: 'https://kuizen.fun/sijil/CONTOH0000',
      latar: new Uint8Array(PNG_1PX),
      tera: false,
      layout: SUSUN_MEDAN as unknown as SusunAturSijil,
      medan: { course: 'Bengkel \u4e2d\u6587 \u0627\u0644\u0639\u0631\u0628\u064a\u0629', signer_name: '\u4e2d\u6587' },
    });
    teksAksara = bacaanPenuh(fbAksara);
  } catch (e) {
    ralatAksara = e;
  }
  semak('42-aksara-luar-winansi',
    ralatAksara === null && teksAksara.includes(hexTeks('?')),
    'aksara CJK/Arab diganti dengan ? dan janaPdf tidak lontar ralat');

  // Mod standard dengan medan (V2-016b): kursus, butiran dan penandatangan
  // dicetak; tanpa medan output kekal SAMA.
  const stdMedan = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman', program: 'Kelas Sains', tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz', kod: 'AB3CD4EF5G', urlSah: 'https://kuizen.fun/sijil/AB3CD4EF5G',
    latar: new Uint8Array(PNG_1PX), tera: true, layout: {},
    medan: MEDAN, tandatangan: new Uint8Array(PNG_1PX),
  });
  const teksStdMedan = bacaanPenuh(stdMedan);
  semak('43-standard-medan',
    teksStdMedan.includes(hexTeks('Bengkel Robotik UPSI 2026'))
      && teksStdMedan.includes(hexTeks('1 hingga 3 Oktober 2026 | Dewan Kuliah FKMT, UPSI'))
      && teksStdMedan.includes(hexTeks('Dr Hariz'))
      && teksStdMedan.includes(hexTeks('Pensyarah Kanan')),
    'mod standard: kursus, butiran, nama dan jawatan penandatangan dicetak');

  const stdKosong = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman', program: 'Kelas Sains', tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz', kod: 'AB3CD4EF5G', urlSah: 'https://kuizen.fun/sijil/AB3CD4EF5G',
    latar: new Uint8Array(PNG_1PX), tera: true, layout: {}, medan: {},
  });
  const teksStdKosong = bacaanPenuh(stdKosong);
  semak('44-standard-tanpa-medan',
    teksStdKosong.includes(hexTeks('Sijil Penyertaan'))
      && teksStdKosong.includes(hexTeks('Aisyah Binti Rahman'))
      && teksStdKosong.includes(hexTeks('Kelas Sains'))
      && teksStdKosong.includes(hexTeks('Certificate code: AB3CD4EF5G'))
      && !teksStdKosong.includes(hexTeks('Bengkel'))
      && !teksStdKosong.includes(hexTeks('Dewan Kuliah'))
      && !teksStdKosong.includes(hexTeks('Pensyarah Kanan')),
    'mod standard tanpa nilai medan: tiada kursus/butiran/penandatangan dicetak');

  // Teks terlalu panjang untuk maxWidth: saiz turun hingga minimum 8
  // kemudian dipangkas dengan elipsis.
  const fbPotong = await janaPdfSijil({
    nama: 'Nama',
    program: 'Program',
    tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz',
    kod: 'CONTOH0000',
    urlSah: 'https://kuizen.fun/sijil/CONTOH0000',
    latar: new Uint8Array(PNG_1PX),
    tera: false,
    layout: {
      mode: 'full_background', qr: false, code: false,
      course: { x: 0.5, y: 0.25, maxWidth: 0.1, size: 96, color: '#001F4B' },
    } as unknown as SusunAturSijil,
    medan: { course: 'KURSUS PANJANG SANGAT SEKALI LAGI DAN LAGI TANPA HENTI' },
  });
  semak('45-pangkas-elipsis',
    bacaanPenuh(fbPotong).includes(hexTeks('...')),
    'teks tidak muat: kecilkan ke minimum 8, kemudian pangkas dengan elipsis');

  // ------------------------------------------------------------------
  // 46: contoh PDF untuk semakan mata CTO
  // ------------------------------------------------------------------
  const baitContoh = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman',
    program: 'Kelas Sains Tingkatan 2 Bestari',
    tarikh: '30 September 2026',
    pengeluar: 'Dr Hariz (Pendidik)',
    kod: 'CONTOH0000',
    urlSah: 'https://kuizen.fun/sijil/CONTOH0000',
    latar: new Uint8Array(PNG_1PX),
    tera: true,
    layout: SUSUN_BOSS as unknown as SusunAturSijil,
  });
  const laluanContoh = 'C:/Users/Hariz/hermes-briefs/kuizen/contoh-sijil-fullbg.pdf';
  writeFileSync(laluanContoh, baitContoh);
  console.log(`Contoh PDF ditulis: ${laluanContoh} (${baitContoh.length} bait)`);

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
