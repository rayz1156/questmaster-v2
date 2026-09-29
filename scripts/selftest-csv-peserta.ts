/**
 * Ujian sendiri untuk binaan CSV peserta (tiket V2-010).
 *
 * Jalankan:  npx tsx scripts/selftest-csv-peserta.ts
 *
 * Seperti selftest-live-quiz: `npx tsc` dan `npm run build` tidak menyemak
 * logik format, jadi koma, petikan, Unicode dan suntikan formula diuji di
 * sini dengan data bercampur.
 */
import { binaCsvPeserta, lindungFormula, petikCsv, slugFail, tarikhKl } from '../src/lib/csvPeserta';

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

/* ===== Bahagian 1: petikCsv ===== */

check('petik: medan biasa tanpa petikan', petikCsv('Nur Aisyah') === 'Nur Aisyah');
check('petik: koma menyebabkan petikan', petikCsv('Rome, Italy') === '"Rome, Italy"');
check('petik: petikan digandakan', petikCsv('Dia kata "hi"') === '"Dia kata ""hi"""');
check('petik: baris baharu menyebabkan petikan', petikCsv('baris1\nbaris2') === '"baris1\nbaris2"');
check('petik: CR juga dipetik', petikCsv('a\rb') === '"a\rb"');

/* ===== Bahagian 2: lindungFormula ===== */

check('lindung: =HYPERLINK diawali petikan tunggal',
  lindungFormula('=HYPERLINK("http://x")') === '\'=HYPERLINK("http://x")');
check('lindung: +1', lindungFormula('+1') === "'+1");
check('lindung: -2', lindungFormula('-2') === "'-2");
check('lindung: @SUM', lindungFormula('@SUM(A1)') === "'@SUM(A1)");
check('lindung: tab di awal', lindungFormula('\tcmd') === "'\tcmd");
check('lindung: CR di awal', lindungFormula('\r悪い') === "'\r悪い");
check('lindung: nama biasa tidak disentuh', lindungFormula('Nur Aisyah') === 'Nur Aisyah');
check('lindung: nama bermula huruf kekal', lindungFormula('azlan') === 'azlan');

/* ===== Bahagian 3: slugFail ===== */

check('slug: asas', slugFail('Kelas Sains') === 'kelas-sains');
check('slug: aksara beraksen ditanggalkan tandanya', slugFail('École Maternelle') === 'ecole-maternelle');
check('slug: aksara Cina digugurkan', slugFail('Kelas 陈伟明') === 'kelas');
check('slug: had 40 aksara', slugFail('a'.repeat(100)).length === 40);
check('slug: sengkang berlebihan diruntuhkan', slugFail('  --Kelas  #1!! --') === 'kelas-1');
check('slug: kosong jatuh kepada lalai', slugFail('陈伟明') === 'class');
check('slug: tiada aksara berisiko header injection', !/[\r\n";]/.test(slugFail('Nama\r\nKelas "X"')));

/* ===== Bahagian 4: tarikhKl ===== */

check('tarikh: UTC 20:30 jadi hari esok di KL',
  tarikhKl('2026-09-29T20:30:00Z') === '2026-09-30', tarikhKl('2026-09-29T20:30:00Z'));
check('tarikh: tengah hari sama hari',
  tarikhKl('2026-09-29T04:00:00Z') === '2026-09-29');
check('tarikh: null kosong', tarikhKl(null) === '');
check('tarikh: tidak sah kosong', tarikhKl('bukan tarikh') === '');

/* ===== Bahagian 5: binaCsvPeserta ===== */

const kosong = binaCsvPeserta([]);
check('kosong: BOM di awal', kosong.charCodeAt(0) === 0xfeff);
check('kosong: hanya baris tajuk', kosong === '\uFEFFName,Email,Status,Joined\r\n', JSON.stringify(kosong));

const campur = binaCsvPeserta([
  { nama: '陈伟明', emel: 'weiming@example.com', status: 'Active', joinedAt: '2026-08-01T02:00:00Z' },
  { nama: 'Zarul', emel: null, status: 'Active', joinedAt: '2026-09-29T20:30:00Z' },
  { nama: null, emel: 'baru@example.com', status: 'Invited', joinedAt: null },
  { nama: '=HYPERLINK("http://x","klik")', emel: 'nakal@example.com', status: 'Active', joinedAt: '2026-07-05T00:00:00Z' },
  { nama: 'Nur Aisyah binti Ahmad', emel: 'aisyah@example.com', status: 'Active', joinedAt: '2026-06-15T00:00:00Z' },
  { nama: 'Tamilselvi', emel: 'tamilselvi@example.com', status: 'Active', joinedAt: '2026-06-16T00:00:00Z' },
]);

check('campur: BOM di awal', campur.charCodeAt(0) === 0xfeff);
const barisCsv = campur.slice(1).split('\r\n').filter((b) => b.length > 0);
check('campur: bilangan baris 1 tajuk + 6', barisCsv.length === 7, barisCsv.length);

// Susunan: Active ikut nama tidak peka huruf, kemudian Invited.
// Nama "=HYPERLINK(...)" bermula dengan '=' (kod titik 0x3D) yang lebih
// kecil daripada huruf Latin, jadi ia jatuh sebelum 'Nur'. Itu betul:
// susunan mengikut nama mentah, lindung formula hanya pada masa format.
check('campur: Active dahulu susun nama',
  barisCsv[2].startsWith('Nur Aisyah binti Ahmad') && barisCsv[3].startsWith('Tamilselvi'),
  barisCsv.slice(1, 6));

check('campur: Invited paling akhir ikut emel', barisCsv[6].startsWith(',baru@example.com,Invited,'), barisCsv[6]);

// Suntikan formula: medan diawali petikan tunggal, dan kerana ada petikan
// dalam medan, seluruh medan turut dipetik dengan petikan digandakan.
check('campur: suntikan formula dilindungi',
  barisCsv[1].startsWith('"\'=HYPERLINK(""http://x"",""klik"")"'),
  barisCsv[1]);

check('campur: emel null jadi medan kosong', barisCsv[4].startsWith('Zarul,,Active,'), barisCsv[4]);

// Joined: tarikh sahaja, zon Asia/Kuala_Lumpur (UTC 20:30 sudah 30 Sep).
check('campur: joined ikut tarikh KL',
  barisCsv[4].endsWith('2026-09-30'),
  barisCsv[4]);

check('campur: Invited joined kosong', barisCsv[6].endsWith(',Invited,'), barisCsv[6]);

check('campur: nama Unicode Cina kekal', campur.includes('陈伟明'));

// CRLF sebagai pemisah, tiada LF bogeng.
check('campur: pemisah CRLF', !/(^|[^\r])\n/.test(campur.slice(1)));

/* ===== Ringkasan ===== */

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
