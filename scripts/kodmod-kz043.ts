/**
 * Kodmod KZ-043 Bahagian B: tukar corak ralat API kepada ralatJson.
 *
 * Jalankan:  npx tsx scripts/kodmod-kz043.ts
 *
 * Tukar:    NextResponse.json({ error: <ungkapan> }, { status: <ungkapan> })
 * Kepada:   ralatJson(<ungkapan>, <ungkapan>)
 *
 * Corak dengan medan lain selain `error` (contoh { error, code }) menjadi
 * ralatJson(<ungkapan>, <ungkapan>, { code }). Corak yang tidak sepadan
 * (tiada medan error, tiada medan status, lebih dua argumen, atau laluan
 * MCP) dibiarkan dan disenaraikan pada penghujung larian.
 *
 * Import { ralatJson } from '@/lib/i18n/ralatApi' ditambah selepas baris
 * import terakhir jika fail berubah dan belum mengimpornya.
 *
 * Tiada kebergantungan baharu: hanya fs/path dan rentetan.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const AKAR = path.resolve(process.argv[2] ?? path.resolve(__dirname, '..'));
const DIR_API = path.join(AKAR, 'src', 'app', 'api');
const IMPORT_RALAT = "import { ralatJson } from '@/lib/i18n/ralatApi';";

let jumlahDitukar = 0;
let jumlahDitinggal = 0;
const senaraiDitinggal: string[] = [];
const senaraiFail: string[] = [];

/** Imbas rentetan bermula pada `mula` (indeks '(' permulaan) hingga ')' sepadan. Pulangkan indeks ')' tersebut. */
function cariPenutup(s: string, mula: number): number {
  const tumpu: string[] = ['('];
  let mod: "'" | '"' | '`' | null = null;
  for (let i = mula + 1; i < s.length; i++) {
    const c = s[i];
    if (mod) {
      if (c === '\\') { i++; continue; }
      if (mod !== '`' && c === mod) { mod = null; continue; }
      if (mod === '`') {
        if (c === '`') { mod = null; continue; }
        if (c === '$' && s[i + 1] === '{') { tumpu.push('${'); mod = null; i++; continue; }
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { mod = c; continue; }
    if (c === '(' || c === '[' || c === '{') { tumpu.push(c); continue; }
    if (c === ')' || c === ']' || c === '}') {
      const atas = tumpu.pop();
      if (atas === undefined) return i;
      if (atas === '${') {
        if (c !== '}') return -1;
        mod = '`';
        continue;
      }
      if (tumpu.length === 0 && c === ')') return i;
      continue;
    }
  }
  return -1;
}

/** Pisangkan argumen mengikut koma peringkat atas (dalam rentetan/template tidak dikira). */
function pisahAtas(s: string): string[] {
  const bahagian: string[] = [];
  const tumpu: string[] = [];
  let mod: "'" | '"' | '`' | null = null;
  let mula = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (mod) {
      if (c === '\\') { i++; continue; }
      if (mod !== '`' && c === mod) { mod = null; continue; }
      if (mod === '`') {
        if (c === '`') { mod = null; continue; }
        if (c === '$' && s[i + 1] === '{') { tumpu.push('${'); mod = null; i++; continue; }
      }
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { mod = c; continue; }
    if (c === '(' || c === '[' || c === '{') { tumpu.push(c); continue; }
    if (c === ')' || c === ']' || c === '}') {
      const atas = tumpu.pop();
      if (atas === '${') mod = '`';
      continue;
    }
    if (c === ',' && tumpu.length === 0) {
      bahagian.push(s.slice(mula, i));
      mula = i + 1;
    }
  }
  bahagian.push(s.slice(mula));
  return bahagian;
}

const ketakStr = (x: string) => x.replace(/^\s+|\s+$/g, '');
const elakStr = (x: string) => x.replace(/([\\'"])/g, '\\$1');

/** Objek literal `{ ... }` kepada senarai medan peringkat atas; null jika bukan objek. */
function medanObjek(arg: string): string[] | null {
  const a = ketakStr(arg);
  if (!a.startsWith('{') || !a.endsWith('}')) return null;
  const dalam = a.slice(1, -1);
  if (ketakStr(dalam) === '') return [];
  // Koma bergantung pada hujung objek literal tidak menghasilkan medan.
  const medan = pisahAtas(dalam).map(ketakStr);
  while (medan.length > 0 && medan[medan.length - 1] === '') medan.pop();
  return medan;
}

/** Pros satu fail; pulangkan bilangan penggantian. */
function prosFail(p: string): number {
  const asal = fs.readFileSync(p, 'utf8');
  let kandungan = asal;
  let tukar = 0;

  // Gelung selamat: imbas semula selepas setiap penggantian supaya indeks
  // sentiasa tepat walaupun panjang teks berubah.
  for (let guard = 0; guard < 5000; guard++) {
    const idx = kandungan.indexOf('NextResponse.json(');
    if (idx === -1) break;
    // Lompati yang berada dalam komen baris/blok ringkas di baris sama.
    const mulaKurungan = idx + 'NextResponse.json'.length;
    const penutup = cariPenutup(kandungan, mulaKurungan);
    if (penutup === -1) break;
    const isi = kandungan.slice(mulaKurungan + 1, penutup);
    const baris = kandungan.slice(0, idx).split('\n').length;

    // Koma bergantung pada hujung senarai argumen tidak dikira sebagai argumen.
    const argsMentah = pisahAtas(isi);
    const args = ketakStr(argsMentah[argsMentah.length - 1] ?? '') === '' && argsMentah.length > 1
      ? argsMentah.slice(0, -1)
      : argsMentah;
    if (args.length !== 2) {
      senaraiDitinggal.push(`${relatif(p)}:${baris} :: ${ringkas(isi)} (bukan dua argumen)`);
      jumlahDitinggal++;
      // Tanda telah dilihat supaya gelung tidak berpusing: ganti nama sahaja.
      kandungan = kandungan.slice(0, idx) + 'NextResponse.json_(' + kandungan.slice(mulaKurungan + 1);
      continue;
    }

    const medan0 = medanObjek(args[0]);
    const medan1 = medanObjek(args[1]);
    if (!medan0 || medan0.length === 0) {
      senaraiDitinggal.push(`${relatif(p)}:${baris} :: ${ringkas(isi)} (objek pertama bukan objek ralat)`);
      jumlahDitinggal++;
      kandungan = kandungan.slice(0, idx) + 'NextResponse.json_(' + kandungan.slice(mulaKurungan + 1);
      continue;
    }
    const m = /^(?:\.\.\.)?error\s*:\s*([\s\S]+)$/.exec(medan0[0]) ;
    const singkat = medan0[0] === 'error';
    if (!m && !singkat) {
      senaraiDitinggal.push(`${relatif(p)}:${baris} :: ${ringkas(isi)} (medan pertama bukan error)`);
      jumlahDitinggal++;
      kandungan = kandungan.slice(0, idx) + 'NextResponse.json_(' + kandungan.slice(mulaKurungan + 1);
      continue;
    }
    const ungkapan = singkat ? 'error' : m![1];
    if (!medan1) {
      senaraiDitinggal.push(`${relatif(p)}:${baris} :: ${ringkas(isi)} (argumen kedua bukan objek)`);
      jumlahDitinggal++;
      kandungan = kandungan.slice(0, idx) + 'NextResponse.json_(' + kandungan.slice(mulaKurungan + 1);
      continue;
    }
    const mStatus = /^status\s*:\s*([\s\S]+)$/.exec(medan1[0] ?? '');
    // Objek kedua mesti hanya ada `status`: medan lain (contoh `headers`)
    // tidak boleh dibuang secara senyap, jadi corak itu dibiarkan.
    if (!mStatus || medan1.length !== 1) {
      senaraiDitinggal.push(`${relatif(p)}:${baris} :: ${ringkas(isi)} (medan pertama kedua bukan status)`);
      jumlahDitinggal++;
      kandungan = kandungan.slice(0, idx) + 'NextResponse.json_(' + kandungan.slice(mulaKurungan + 1);
      continue;
    }

    const sisa = medan0.slice(1).filter((x) => x !== '');
    const baharu =
      'ralatJson(' + ungkapan.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '') + ', ' + mStatus[1].trim() +
      (sisa.length > 0 ? ', { ' + sisa.join(', ') + ' }' : '') + ')';
    kandungan = kandungan.slice(0, idx) + baharu + kandungan.slice(penutup + 1);
    tukar++;
    jumlahDitukar++;
  }

  // Settle semula penanda `NextResponse.json_` kepada bentuk asal.
  kandungan = kandungan.replace(/NextResponse\.json_\(/g, 'NextResponse.json(');

  if (tukar > 0) {
    if (!kandungan.includes(IMPORT_RALAT)) {
      const barisImport = kandungan.split('\n');
      let akhirImport = -1;
      for (let i = 0; i < barisImport.length; i++) {
        if (/^import\b.*from\s+['"].*['"];?\s*$/.test(barisImport[i])) akhirImport = i;
      }
      if (akhirImport === -1) akhirImport = 0;
      barisImport.splice(akhirImport + 1, 0, IMPORT_RALAT);
      kandungan = barisImport.join('\n');
    }
    if (kandungan !== asal) {
      fs.writeFileSync(p, kandungan);
      senaraiFail.push(relatif(p));
    }
  }
  return tukar;
}

function relatif(p: string): string {
  return path.relative(AKAR, p).replace(/\\/g, '/');
}
function ringkas(s: string): string {
  const satu = s.replace(/\s+/g, ' ').trim();
  return satu.length > 90 ? satu.slice(0, 87) + '...' : satu;
}
function elakLog(s: string): string {
  return s;
}
void elakStr;
void elakLog;

/** Kumpulkan semua route.ts, menolak laluan MCP (pelanggan MCP tiada kuki). */
function kumpulRoute(dir: string, keluar: string[] = []): string[] {
  for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
    const penuh = path.join(dir, entri.name);
    if (entri.isDirectory()) {
      if (path.relative(AKAR, penuh).replace(/\\/g, '/').startsWith('src/app/api/mcp')) continue;
      kumpulRoute(penuh, keluar);
    } else if (entri.name === 'route.ts') {
      keluar.push(penuh);
    }
  }
  return keluar;
}

const semua = kumpulRoute(DIR_API);
for (const f of semua) prosFail(f);

console.log(`Fail route.ts diimbas: ${semua.length}`);
console.log(`Penggantian ralatJson: ${jumlahDitukar}`);
console.log(`Corak ditinggalkan:    ${jumlahDitinggal}`);
console.log('');
console.log('Fail yang berubah:');
for (const f of senaraiFail) console.log('  ' + f);
console.log('');
console.log('Corak ditinggalkan (perlu semakan manual):');
for (const l of senaraiDitinggal) console.log('  ' + l);