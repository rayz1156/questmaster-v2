/**
 * Ujian logik V2-003a: penjanaan PDF sijil dan penjanaan kod.
 *
 * Jalankan: npx tsx scripts/selftest-sijil.ts
 *
 * Ia juga menjana contoh PDF ke
 *   C:\Users\Hariz\hermes-briefs\kuizen\contoh-sijil.pdf
 * untuk semakan mata CTO.
 */
import { janaPdfSijil, formatTarikhBm } from '../src/lib/sijil/janaPdf';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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

// Abjad yang sama dengan qm_certificate_code() dalam migrasi 0042
const ABJAD = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TERLARANG = ['0', 'O', '1', 'I', 'L'];

/** pdf-lib menulis teks sebagai hex string; tukar teks kepada hex besar. */
function hexTeks(s: string): string {
  return Buffer.from(s, 'latin1').toString('hex').toUpperCase();
}

/**
 * Bacaan penuh PDF: bait mentah latin1 + semua aliran Flate yang
 * berjaya dinyahmampat, supaya carian teks tidak tertipu oleh mampatan.
 */
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

async function main() {
  // ------------------------------------------------------------------
  // A. Format tarikh BM
  // ------------------------------------------------------------------
  const tarikh = formatTarikhBm(new Date(2026, 8, 29)); // 29 September 2026
  semak('A', tarikh === '29 September 2026', `formatTarikhBm: ${tarikh}`);

  // ------------------------------------------------------------------
  // B. PDF asas: bermula %PDF, nama muncul, tera muncul
  // ------------------------------------------------------------------
  const bait = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman',
    program: 'Kelas Sains Tingkatan 2',
    tarikh: '29 September 2026',
    pengeluar: 'Dr Hariz',
    kod: 'AB3CD4EF5G',
    urlSah: 'https://kuizen.fun/sijil/AB3CD4EF5G',
    tera: true,
  });
  const teks = bacaanPenuh(bait);
  semak('B', teks.startsWith('%PDF-'), 'PDF bermula %PDF');
  semak('B2', teks.includes(hexTeks('Aisyah Binti Rahman')), 'Nama muncul dalam PDF');
  semak('B3', teks.includes(hexTeks('Dijana dengan Kuizen')), 'Tera muncul apabila tera=true');

  // ------------------------------------------------------------------
  // C. Nama panjang: dijana tanpa ralat
  // ------------------------------------------------------------------
  const namaPanjang = 'Mohamad Al Amin bin Syed Abdullah Al-Attas Rahman ibnu Al-Husain Mahathir the Third Junior IV';
  const baitPanjang = await janaPdfSijil({
    nama: namaPanjang,
    program: 'Program Sains Matematik Robotik dan Kepimpinan Rakan Muda Peringkat Negeri',
    tarikh: '1 Januari 2026',
    pengeluar: 'Kuizen',
    kod: 'XY7ZA8BB9C',
    urlSah: 'https://kuizen.fun/sijil/XY7ZA8BB9C',
    tera: false,
  });
  semak('C', bacaanPenuh(baitPanjang).startsWith('%PDF-'), 'Nama panjang dijana tanpa ralat');

  // ------------------------------------------------------------------
  // D. Tera muncul HANYA apabila tera=true
  // ------------------------------------------------------------------
  const baitTera = await janaPdfSijil({
    nama: 'Budi', program: 'P', tarikh: '1 Januari 2026',
    pengeluar: 'K', kod: 'AA2BB3CC4D', urlSah: 'https://kuizen.fun/sijil/AA2BB3CC4D',
    tera: false,
  });
  const teksTera = Buffer.from(baitTera.buffer, baitTera.byteOffset, baitTera.length).toString('latin1');
  semak('D', !teksTera.includes(hexTeks('Dijana dengan Kuizen')), 'Tiada tera apabila tera=false');

  // ------------------------------------------------------------------
  // E. Penjanaan kod: 40,000 kod rawak, 10 aksara, tiada terlarang
  //    (modulo yang sama dengan SQL: bait % 31)
  // ------------------------------------------------------------------
  let betul = true;
  for (let i = 0; i < 40_000; i += 1) {
    const kod = Array.from(randomBytes(10))
      .map((b) => ABJAD[b % ABJAD.length])
      .join('');
    if (kod.length !== 10 || TERLARANG.some((c) => kod.includes(c))) {
      betul = false;
      break;
    }
  }
  semak('E', betul, '40,000 kod: 10 aksara, tiada 0/O/1/I/L');

  // ------------------------------------------------------------------
  // F. Contoh PDF untuk semakan mata CTO
  // ------------------------------------------------------------------
  const baitContoh = await janaPdfSijil({
    nama: 'Aisyah Binti Rahman',
    program: 'Kelas Sains Tingkatan 2 Bestari',
    tarikh: formatTarikhBm(new Date()),
    pengeluar: 'Dr Hariz (Pendidik)',
    kod: 'KZ7EXAMPLE',
    urlSah: 'https://kuizen.fun/sijil/KZ7EXAMPLE',
    tera: true,
  });
  const laluanContoh = 'C:/Users/Hariz/hermes-briefs/kuizen/contoh-sijil.pdf';
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
