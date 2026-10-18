// Skrip ujian penerimaan KZ-028a (dijalankan dengan: npx tsx scripts/selftest-kz028a.ts)
// Mengimport teks secara dinamik SELEPAS menetapkan NEXT_PUBLIC_BRAND.
// Cache modul ESM menghalang tukar env dalam proses yang sama, jadi skrip
// men-spawn dirinya sebagai proses anak dua kali (veltrix dan lalai).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BERKAS = fileURLToPath(import.meta.url);
const ANAK = '--anak-kz028a';

let gagal = 0;
const gagalMsg: string[] = [];
const lulusMsg: string[] = [];
function pass(m: string) { lulusMsg.push(m); }
function fail(m: string) { gagal++; gagalMsg.push(m); }
function semak(nama: string, syarat: boolean, butiran?: string) {
  if (syarat) pass(nama + (butiran ? ': ' + butiran : ''));
  else fail(nama + (butiran ? ': ' + butiran : ''));
}

// Jalankan diri sebagai proses anak (npx tsx) dengan env berbeza, pulangkan JSON.
function anak(envTambahan: Record<string, string | undefined>): Record<string, string> | null {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.NEXT_PUBLIC_BRAND;
  for (const [k, v] of Object.entries(envTambahan)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  const r = spawnSync('npx', ['tsx', BERKAS, ANAK], { env, encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    fail('proses anak gagal: ' + (r.stderr || r.stdout || 'tiada output'));
    return null;
  }
  const baris = (r.stdout || '').split('\n').find(l => l.startsWith('__KZ028A__'));
  if (!baris) {
    fail('output anak tidak ditemui: ' + (r.stdout || ''));
    return null;
  }
  return JSON.parse(baris.slice('__KZ028A__'.length)) as Record<string, string>;
}

async function modAnak() {
  // Modus anak: import dinamik selepas env ditetapkan oleh induk, cetak JSON.
  const { teks, LOKAL } = await import('../src/i18n/teks');
  const { JENAMA } = await import('../src/lib/brand');
  const { BRANDING } = await import('../src/lib/branding.config');
  const { ms } = await import('../src/i18n/ms');
  const { en } = await import('../src/i18n/en');
  console.log('__KZ028A__' + JSON.stringify({
    JENAMA,
    LOKAL,
    nama: teks.jenama.nama,
    namaProduk: BRANDING.product.name,
    namaPenuhProduk: BRANDING.product.fullName,
    deskripsiProduk: BRANDING.product.description,
    butangLogMasuk: teks.logMasuk.butang,
    aluanLogMasuk: teks.logMasuk.aluan,
    tabPendidik: teks.pendidik.tabKelas,
    jenamaMs: ms.jenama.nama,
    jenamaEn: en.jenama.nama,
  }));
}

async function utama() {
  if (process.argv.includes(ANAK)) {
    await modAnak();
    process.exit(0);
  }

  // ---- Ujian 1: NEXT_PUBLIC_BRAND='veltrix' ----
  const veltrix = anak({ NEXT_PUBLIC_BRAND: 'veltrix' });
  if (veltrix) {
    semak('U1 JENAMA veltrix', veltrix.JENAMA === 'veltrix', String(veltrix.JENAMA));
    semak('U1 nama "Veltrix Academy"', veltrix.nama === 'Veltrix Academy', String(veltrix.nama));
    semak('U1 BRANDING.product.name Inggeris', veltrix.namaProduk === 'Veltrix Academy', String(veltrix.namaProduk));
    semak('U1 BRANDING.product.fullName Inggeris', veltrix.namaPenuhProduk === 'Veltrix Academy', String(veltrix.namaPenuhProduk));
    semak('U1 deskripsi Inggeris', String(veltrix.deskripsiProduk).startsWith('The Veltrix Academy corporate learning platform'), String(veltrix.deskripsiProduk));
    semak('U1 LOKAL en-MY', veltrix.LOKAL === 'en-MY', String(veltrix.LOKAL));
    semak('U1 butang log masuk Inggeris', veltrix.butangLogMasuk === 'Sign in', String(veltrix.butangLogMasuk));
    semak('U1 aluan log masuk Inggeris', veltrix.aluanLogMasuk === 'Welcome back 👋 Sign in to continue', String(veltrix.aluanLogMasuk));
    semak('U1 tab pendidik Inggeris', veltrix.tabPendidik === 'Classes', String(veltrix.tabPendidik));
  }

  // ---- Ujian 2: tanpa env (lalai stafkita) ----
  const lalai = anak({});
  if (lalai) {
    semak('U2 JENAMA lalai stafkita', lalai.JENAMA === 'stafkita', String(lalai.JENAMA));
    semak('U2 nama "StafKita Akademi"', lalai.nama === 'StafKita Akademi', String(lalai.nama));
    semak('U2 BRANDING.product.name BM', lalai.namaProduk === 'StafKita Akademi', String(lalai.namaProduk));
    semak('U2 deskripsi BM', String(lalai.deskripsiProduk).startsWith('Platform pembelajaran korporat StafKita Akademi'), String(lalai.deskripsiProduk));
    semak('U2 LOKAL ms-MY', lalai.LOKAL === 'ms-MY', String(lalai.LOKAL));
    semak('U2 butang log masuk BM', lalai.butangLogMasuk === 'Log Masuk', String(lalai.butangLogMasuk));
    semak('U2 aluan log masuk BM', lalai.aluanLogMasuk === 'Selamat kembali 👋 Log masuk untuk teruskan', String(lalai.aluanLogMasuk));
    semak('U2 tab pendidik BM', lalai.tabPendidik === 'Kelas', String(lalai.tabPendidik));
    semak('U2 jenama ms/en berbeza', lalai.jenamaMs === 'StafKita Akademi' && lalai.jenamaEn === 'Veltrix Academy', `${lalai.jenamaMs} / ${lalai.jenamaEn}`);
  }

  // ---- Ringkasan ----
  console.log('=== KEPUTUSAN UJIAN KZ-028a ===');
  for (const m of lulusMsg) console.log('LULUS:', m);
  for (const m of gagalMsg) console.log('GAGAL:', m);
  console.log(`Jumlah lulus: ${lulusMsg.length}, gagal: ${gagal}`);
  if (gagal > 0) process.exit(1);
}

void utama();
