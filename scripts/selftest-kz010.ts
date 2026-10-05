/**
 * Ujian logik KZ-010: nama kursus lalai daripada nama kelas pada PDF sijil
 * mod full_background. Bila medan Course kosong, teks kursus = parameter
 * `program` (nama kelas daripada program_snapshot); medan Course diisi
 * mengatasi; layout course = false mematikan cetakan.
 *
 * Jalankan: npx tsx scripts/selftest-kz010.ts
 *
 * Kaedah bacaan yang sama dengan selftest-kz009.ts: bait latin1 mentah
 * DITAMBAH semua aliran Flate yang berjaya dinyahmampat; teks dicari
 * sebagai hex besar. Kawalan positif (nama dijumpai) membuktikan kaedah
 * ini nampak teks yang memang dilukis, supaya keputusan negatif bukan
 * negatif palsu.
 */
import { janaPdfSijil, type SusunAturSijil } from '../src/lib/sijil/janaPdf';
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

const NAMA = 'Aisyah Binti Rahman';
const PROGRAM = 'Kelas Ujian ABC';

/** Kotak kursus aktif: bentuk penuh SusunAturNama (dipapar di bawah nama). */
const KURSUS_AKTIF = {
  x: 0.5, y: 0.55, maxWidth: 0.6, size: 18,
  color: '#001F4B', weight: 'regular', align: 'center',
};

async function jana(layout: unknown, medan?: Record<string, string>): Promise<string> {
  const bait = await janaPdfSijil({
    nama: NAMA,
    program: PROGRAM,
    tarikh: '5 Oktober 2026',
    pengeluar: 'Dr Hariz',
    kod: 'KZ9TEST0001',
    urlSah: 'https://kuizen.fun/sijil/KZ9TEST0001',
    latar: new Uint8Array(PNG_1PX),
    tera: false,
    layout: layout as unknown as SusunAturSijil,
    medan,
  });
  return bacaanPenuh(bait);
}

async function main() {
  // ------------------------------------------------------------------
  // Kes 1: medan.course tiada, layout course aktif -> nama kelas dicetak.
  // ------------------------------------------------------------------
  const k1 = await jana({ mode: 'full_background', course: KURSUS_AKTIF });
  semak('K1-kawalan-nama-ada', k1.includes(hexTeks(NAMA)),
    'kawalan positif: nama dijumpai (kaedah bacaan nampak teks yang dilukis)');
  semak('K1-nama-kelas-dicetak', k1.includes(hexTeks(PROGRAM)),
    `medan Course kosong -> teks kursus = nama kelas "${PROGRAM}"`);

  // ------------------------------------------------------------------
  // Kes 2: medan.course = 'Kursus Khas' mengatasi nama kelas.
  // ------------------------------------------------------------------
  const k2 = await jana({ mode: 'full_background', course: KURSUS_AKTIF }, { course: 'Kursus Khas' });
  semak('K2-kursus-khas-dicetak', k2.includes(hexTeks('Kursus Khas')),
    'medan Course diisi -> teks kursus = nilai medan');
  semak('K2-nama-kelas-tiada', !k2.includes(hexTeks(PROGRAM)),
    'nama kelas TIDAK dicetak bila medan Course mengatasi');

  // ------------------------------------------------------------------
  // Kes 3: layout.course = false -> tiada teks kursus walaupun nama kelas
  // atau medan Course ada.
  // ------------------------------------------------------------------
  const k3 = await jana({ mode: 'full_background', course: false });
  semak('K3-nama-kelas-tiada', !k3.includes(hexTeks(PROGRAM)),
    'layout course = false -> nama kelas TIDAK dicetak');
  semak('K3-kursus-khas-tiada',
    !k3.includes(hexTeks('Kursus Khas')) && !k3.includes(hexTeks('Course / programme')),
    'layout course = false -> medan Course juga TIDAK dicetak');
  semak('K3-kawalan-nama-ada', k3.includes(hexTeks(NAMA)),
    'kawalan positif: nama masih dilukis (negatif K3 bukan negatif palsu)');

  // ------------------------------------------------------------------
  // Kawalan: mod standard TIDAK berubah. Tanpa medan.course, program
  // tetap dicetak pada kedudukan program (bukan bergantung layout course);
  // dengan medan.course, hanya nilai medan dicetak di baris itu.
  // ------------------------------------------------------------------
  const std = await jana({}, undefined);
  semak('STD-program-kekal', std.includes(hexTeks(PROGRAM)),
    'mod standard: program tetap dicetak tanpa medan.course (tiada perubahan)');
  const std2 = await jana({}, { course: 'Kursus Khas' });
  semak('STD-kursus-kekal', std2.includes(hexTeks('Kursus Khas')),
    'mod standard: kursus daripada medan kekal dicetak');
  semak('STD-nama-kekal', std2.includes(hexTeks(NAMA)),
    'mod standard: nama kekal dicetak');

  if (gagal > 0) {
    console.log(`\n${gagal} semakan GAGAL`);
    process.exit(1);
  }
  console.log('\nSemua semakan LULUS');
}

main().catch((e) => {
  console.error('RAALAT:', e);
  process.exit(1);
});
