/**
 * Ujian sendiri KZ-017 P4 untuk imejRasterSebenar: penghiduan imej raster
 * daripada tandatangan bait (magic bytes) yang menentukan sama ada muat naik
 * multipart mendapat pengecualian keupayaan imej.
 *
 * Jalankan:  npx tsx scripts/selftest-imej-raster.ts
 *
 * Kenapa fail ini wujud: npx tsc dan npm run build tidak menyemak logik. Jika
 * penghiduan ini terpesong (contoh SVG diluluskan sebagai imej), peserta tanpa
 * keupayaan fail boleh memuat naik SVG dan membuka semula laluan stored XSS
 * kzsec penemuan 1.
 */
import { imejRasterSebenar } from '../src/lib/upload-guard';

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

/* ===== 1. PNG sebenar: tandatangan penuh 8 bait ===== */
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
check('PNG 8 bait pertama dikenali', imejRasterSebenar(png) === 'image/png', imejRasterSebenar(png));

/* ===== 2. JPEG sebenar: FF D8 FF ===== */
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
check('JPEG dikenali', imejRasterSebenar(jpeg) === 'image/jpeg', imejRasterSebenar(jpeg));

/* ===== 3. GIF sebenar: GIF87a / GIF89a ===== */
const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
check('GIF89a dikenali', imejRasterSebenar(gif) === 'image/gif', imejRasterSebenar(gif));
const gif87 = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
check('GIF87a dikenali', imejRasterSebenar(gif87) === 'image/gif', imejRasterSebenar(gif87));

/* ===== 4. WebP sebenar: RIFF....WEBP ===== */
const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
check('WebP dikenali', imejRasterSebenar(webp) === 'image/webp', imejRasterSebenar(webp));

/* ===== 5. RIFF tetapi bukan WEBP (contoh AVI/WAV) TIDAK diluluskan ===== */
const riffBukanWebp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x41, 0x56, 0x49, 0x20]);
check('RIFF bukan WEBP ditolak (null)', imejRasterSebenar(riffBukanWebp) === null, imejRasterSebenar(riffBukanWebp));

/* ===== 6. SVG: teks XML, TIDAK diluluskan sebagai imej raster ===== */
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8');
check('SVG ditolak (null)', imejRasterSebenar(new Uint8Array(svg)) === null, imejRasterSebenar(new Uint8Array(svg)));

/* ===== 7. HTML ditolak ===== */
const html = Buffer.from('<html><body>hello</body></html>', 'utf8');
check('HTML ditolak (null)', imejRasterSebenar(new Uint8Array(html)) === null, imejRasterSebenar(new Uint8Array(html)));

/* ===== 8. PDF ditolak (%PDF) ===== */
const pdf = Buffer.from('%PDF-1.7\n%fake pdf bytes', 'utf8');
check('PDF ditolak (null)', imejRasterSebenar(new Uint8Array(pdf)) === null, imejRasterSebenar(new Uint8Array(pdf)));

/* ===== 9. Penimbal kosong ditolak ===== */
check('penimbal kosong ditolak (null)', imejRasterSebenar(new Uint8Array(0)) === null, 'empty');

/* ===== 10. Penimbal terpotong tidak meletup ===== */
check('PNG terpotong 7 bait ditolak',
  imejRasterSebenar(png.subarray(0, 7)) === null, imejRasterSebenar(png.subarray(0, 7)));
check('WebP terpotong 11 bait ditolak',
  imejRasterSebenar(webp.subarray(0, 11)) === null, imejRasterSebenar(webp.subarray(0, 11)));

/* ===== 11. Bait PNG diikuti kandungan jahat tetap dikenali sebagai PNG =====
 * Ini kelakian sengaja: tandatangan hanya menentukan "ini fail PNG", bukan
 * kandungan selamat. Pengepala file-redirect tetap perlu nosniff. */
const pngBeracun = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x3c, 0x73, 0x76, 0x67]);
check('PNG dengan ekor jahat tetap image/png', imejRasterSebenar(pngBeracun) === 'image/png', imejRasterSebenar(pngBeracun));

console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail > 0 ? 1 : 0);
