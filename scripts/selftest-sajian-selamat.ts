/**
 * Ujian sendiri KZ-017 R2-4 untuk pengepalaSajian: keputusan pengepala sajian
 * fail pada route file-redirect (senarai BENARKAN inline) yang menggantikan
 * senarai sekat case-sensitive MIMES_BOLEH_SKRIP.
 *
 * Jalankan:  npx tsx scripts/selftest-sajian-selamat.ts
 *
 * Kenapa fail ini wujud: kzsec pusingan 2 berjaya membuktikan pintasan stored
 * XSS melalui Content-Type bercampur huruf besar/kecil kepada route file-redirect.
 * Dari sinian, inline HANYA untuk senarai selamat; semua jenis lain, termasuk
 * yang tidak dikenali atau kosong, dipaksa attachment dengan CSP sandbox.
 */
import { pengepalaSajian, normMime, bolehInline } from '../src/lib/sajianSelamat';

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

/* ===== 1. Vektor kzsec: campuran huruf besar/kecil mesti attachment ===== */
const svgCampur = pengepalaSajian('image/SVG+XML', true);
check('image/SVG+XML tidak inline', svgCampur.disposition === 'attachment', svgCampur);
check('image/SVG+XML ada CSP sandbox', svgCampur.csp === "sandbox; default-src 'none'", svgCampur.csp);
check('image/SVG+XML ternormal huruf kecil', svgCampur.contentType === 'image/svg+xml', svgCampur.contentType);

const svgParam = pengepalaSajian('Image/Svg+Xml; charset=utf-8', true);
check('Image/Svg+Xml; charset=utf-8 tidak inline', svgParam.disposition === 'attachment', svgParam);
check('Image/Svg+Xml; charset=utf-8 ternormal', svgParam.contentType === 'image/svg+xml', svgParam.contentType);

const svgKecil = pengepalaSajian('image/svg+xml', true);
check('image/svg+xml tidak inline (senarai BENARKAN, bukan senarai sekat)', svgKecil.disposition === 'attachment', svgKecil);
check('image/svg+xml ada CSP sandbox', svgKecil.csp === "sandbox; default-src 'none'", svgKecil.csp);

/* ===== 2. Jenis boleh-skrip lain: attachment dipaksa ===== */
for (const [ct, nama] of [
  ['text/html', 'text/html'],
  ['application/xhtml+xml', 'application/xhtml+xml'],
  ['application/rss+xml', 'application/rss+xml (+xml generik)'],
  ['text/plain', 'text/plain'],
] as const) {
  const r = pengepalaSajian(ct, true);
  check(nama + ' tidak inline', r.disposition === 'attachment', r);
  check(nama + ' ada CSP sandbox', r.csp === "sandbox; default-src 'none'", r.csp);
}

/* ===== 3. Senarai selamat: inline dibenarkan apabila route mahu inline ===== */
const pngKapital = pengepalaSajian('IMAGE/PNG', true);
check('IMAGE/PNG inline (huruf tidak relevan)', pngKapital.disposition === 'inline', pngKapital);
check('IMAGE/PNG csp null', pngKapital.csp === null, pngKapital.csp);
check('IMAGE/PNG ternormal huruf kecil', pngKapital.contentType === 'image/png', pngKapital.contentType);

const jpeg = pengepalaSajian('image/jpeg', true);
check('image/jpeg inline', jpeg.disposition === 'inline', jpeg);
const pdf = pengepalaSajian('application/pdf', true);
check('application/pdf inline', pdf.disposition === 'inline', pdf);
const mp4 = pengepalaSajian('video/mp4', true);
check('video/mp4 inline (awalan video/)', mp4.disposition === 'inline', mp4);
const mp3 = pengepalaSajian('audio/mpeg', true);
check('audio/mpeg inline (awalan audio/)', mp3.disposition === 'inline', mp3);

/* ===== 4. Route asal TIDAK mahu inline: attachment walaupun selamat ===== */
const pngTakMahu = pengepalaSajian('image/png', false);
check('image/png dengan mahuInline=false ialah attachment', pngTakMahu.disposition === 'attachment', pngTakMahu);
check('image/png dengan mahuInline=false ada CSP sandbox', pngTakMahu.csp === "sandbox; default-src 'none'", pngTakMahu.csp);

/* ===== 5. Jenis tidak dikenali dan kosong: attachment dipaksa ===== */
const kosong = pengepalaSajian('', true);
check('rentetan kosong tidak inline', kosong.disposition === 'attachment', kosong);
check('rentetan kosong ada CSP sandbox', kosong.csp === "sandbox; default-src 'none'", kosong.csp);
check('rentetan kosong susut ke application/octet-stream', kosong.contentType === 'application/octet-stream', kosong.contentType);

const octet = pengepalaSajian('application/octet-stream', true);
check('application/octet-stream tidak inline', octet.disposition === 'attachment', octet);
check('application/octet-stream ada CSP sandbox', octet.csp === "sandbox; default-src 'none'", octet.csp);

const octetParam = pengepalaSajian('application/octet-stream; binary', true);
check('parameter content-type dibuang', octetParam.contentType === 'application/octet-stream', octetParam.contentType);

/* ===== 6. Unit penormal ===== */
check('normMime buang parameter dan ruang', normMime('  Image/PNG ; charset=x ') === 'image/png', normMime('  Image/PNG ; charset=x '));
check('normMime kosong -> kosong', normMime('') === '', JSON.stringify(normMime('')));
check('bolehInline menolak +xml', bolehInline('image/svg+xml') === false, bolehInline('image/svg+xml'));
check('bolehInline menerima awalan video', bolehInline('video/webm') === true, bolehInline('video/webm'));

console.log(`\nJumlah: ${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);