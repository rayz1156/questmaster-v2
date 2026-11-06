/**
 * Ujian sendiri untuk import soalan Arena: pemecah templat (CSV), pembaca
 * .xlsx, Aiken dan templat yang dimuat turun.
 *
 * Jalankan:  npx tsx scripts/selftest-arena-import.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik
 * penghurai. Fail .xlsx di bawah dibina sendiri sebagai ZIP yang sah
 * ([Content_Types].xml, xl/workbook.xml, rels, sheet1, sharedStrings) supaya
 * pembaca diuji tanpa Excel dan tanpa pakej baharu.
 */
import * as zlib from 'node:zlib';
import {
  ARENA_CSV_TEMPLATE,
  ARENA_XLSX_MAX_XML_BYTES,
  parseArenaAiken,
  parseArenaCsv,
  parseArenaSheet,
  readXlsxRows,
} from '../src/lib/arena/import';
import type { ArenaQuestionInput } from '../src/lib/arena/types';

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

/* ===== Bahagian 1: templat CSV (kriteria 1, 8) ===== */

// Laluan /api/arena/template memulangkan BOM + ARENA_CSV_TEMPLATE.
const tpl = '﻿' + ARENA_CSV_TEMPLATE;
check('templat bermula dengan BOM UTF-8', tpl.charCodeAt(0) === 0xfeff);
const tplLines = tpl.replace(/^﻿/, '').split(/\r\n/).filter((l) => l.trim() !== '');
check('templat ada 7 baris (pengepala + 6 contoh)', tplLines.length === 7, tplLines.length);
check('baris pertama ialah pengepala', tplLines[0]?.startsWith('jenis,soalan,pilihan_a,'), tplLines[0]);

const t = parseArenaCsv(ARENA_CSV_TEMPLATE);
check('templat: tiada ralat', t.errors.length === 0, t.errors);
check('templat: 6 soalan', t.questions.length === 6, t.questions.length);
check('templat: satu soalan setiap jenis',
  t.questions.map((q) => q.type).join(',') === 'multiple,subjective,ox,essay,match,order',
  t.questions.map((q) => q.type));
check('templat: semua origin manual', t.questions.every((q) => q.origin === 'manual'));

const aneka = t.questions[0];
check('aneka: 4 pilihan', (aneka?.data as { choiceList?: unknown[] }).choiceList?.length === 4);
const cl = (aneka?.data as { choiceList: { key: string; text: string; isAnswer: boolean }[] }).choiceList ?? [];
check('aneka: jawapan A,C menjadi dua isAnswer',
  cl.filter((c) => c.isAnswer).map((c) => c.key).join(',') === 'A,C',
  cl);
check('aneka: pilihan ikut lajur', cl.map((c) => c.text).join(',') === 'Pisang,Manggis,Nanas,Durian', cl);
check('aneka: markah 100, masa 30', aneka?.points === 100 && aneka?.time_limit_sec === 30, [aneka?.points, aneka?.time_limit_sec]);

const pendek = t.questions[1] as (typeof t.questions)[number] & { data: { answerList: { key: string; text: string }[] } };
check('pendek: dua jawapan diterima',
  pendek?.data.answerList?.map((a) => a.text).join('|') === 'Kuala Lumpur|KL',
  pendek?.data.answerList);
check('pendek: petunjuk dipetakan', pendek?.hint?.type === 'text' && pendek?.hint?.value === 'Singkatannya KL.', pendek?.hint);

const ox = t.questions[2] as (typeof t.questions)[number] & { data: { answer: string } };
check('betul_salah: Betul menjadi o', ox?.data.answer === 'o', ox?.data.answer);

const esei = t.questions[3] as (typeof t.questions)[number] & { data: { rubric?: string; maxLength?: number } };
check('esei: rubrik terpelihara', /cahaya matahari/.test(esei?.data.rubric ?? ''), esei?.data);
check('esei: markah 200, masa 60', esei?.points === 200 && esei?.time_limit_sec === 60, [esei?.points, esei?.time_limit_sec]);

const padan = t.questions[4] as (typeof t.questions)[number] & {
  data: { leftItems: { key: string; text: string }[]; rightItems: { key: string; text: string }[]; answerPairs: { left: string; right: string }[] };
};
check('padanan: Kucing dipadankan dengan Meow',
  padan?.data.leftItems[0]?.text === 'Kucing' && padan?.data.rightItems[0]?.text === 'Meow' &&
  padan?.data.answerPairs[0]?.left === 'L1' && padan?.data.answerPairs[0]?.right === 'R1',
  padan?.data);
check('padanan: 3 pasangan', padan?.data.leftItems.length === 3 && padan?.data.rightItems.length === 3, padan?.data);

const susun = t.questions[5] as (typeof t.questions)[number] & { data: { items: { key: string; text: string }[] } };
check('susunan: 5 item ikut turutan lajur',
  susun?.data.items.map((i) => i.text).join(',') === 'Pilih tempat yang cerah,Gali lubang,Masukkan benih,Tutup dengan tanah,Siram air',
  susun?.data.items);
check('susunan: kunci ikut lajur', susun?.data.items.map((i) => i.key).join(',') === 'A,B,C,D,E', susun?.data.items);

/* ===== Bahagian 2: pembatas ; dan BOM (kriteria 3) ===== */

const semi = parseArenaCsv(
  '﻿jenis;soalan;pilihan_a;pilihan_b;jawapan;markah;masa_saat\r\naneka;Ibu negara Malaysia?;Johor Bahru;Kuala Lumpur;B;100;20\r\n',
);
check('pembatas koma bertitik + BOM',
  semi.errors.length === 0 && semi.questions.length === 1 &&
  (semi.questions[0]?.data as { choiceList: { key: string; isAnswer: boolean }[] }).choiceList.some((c) => c.key === 'B' && c.isAnswer),
  [semi.errors, semi.questions.length]);

/* ===== Bahagian 3: baris rosak (kriteria 4) ===== */

const badAneka = parseArenaCsv(
  'jenis,soalan,pilihan_a,pilihan_b,jawapan\r\naneka,2+2?,4,5,A\r\naneka,3+3?,6,7,\r\n',
);
check('aneka tanpa jawapan ditolak, nombor baris Excel betul',
  badAneka.questions.length === 0 && badAneka.errors.length === 1 && badAneka.errors[0]?.row === 3,
  [badAneka.errors]);
check('mesej ralat menyebut lajur jawapan', /jawapan/.test(badAneka.errors[0]?.message ?? ''), badAneka.errors[0]);

const badType = parseArenaCsv('jenis,soalan,pilihan_a,pilihan_b,jawapan\r\nmagic,Apa?Ya,Tidak,B\r\n');
check('jenis tidak dikenali ditolak pada baris 2', badType.errors.length === 1 && badType.errors[0]?.row === 2, badType.errors);

const blankMid = parseArenaCsv('jenis,soalan,pilihan_a,pilihan_b,jawapan\r\naneka,OK?,Ya,Tidak,A\r\n\r\nmagic,Apa?Ya,Tidak,B\r\n');
check('nombor baris ikut Excel walaupun ada baris kosong',
  blankMid.errors.length === 1 && blankMid.errors[0]?.row === 4, blankMid.errors);

const gapCsv = parseArenaCsv('jenis,soalan,pilihan_a,pilihan_b,jawapan\r\naneka,OK?,,Tidak,B\r\n');
check('lompang di tengah pilihan ditolak', gapCsv.errors.length === 1 && /earlier choice/.test(gapCsv.errors[0]?.message ?? ''), gapCsv.errors);

const orderBig = parseArenaCsv(
  'jenis,soalan,pilihan_a,pilihan_b,pilihan_c,pilihan_d,pilihan_e,pilihan_f,jawapan\r\nsusunan,Susun.,satu,dua,tiga,empat,lima,enam,\r\n',
);
check('susunan 6 item ditolak (maksimum 5)', orderBig.errors.length === 1, orderBig.errors);

/* ===== Bahagian 4: pembaca .xlsx (kriteria 2) ===== */

// Pembina ZIP tulis sendiri: STORED (tanpa mampatan) atau deflate.
function buildZip(files: { name: string; data: Buffer }[], compress: boolean): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const comp = compress ? zlib.deflateRawSync(f.data) : f.data;
    const method = compress ? 8 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(0, 14); // crc (pembaca ujian tidak menyemak)
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    local.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(0, 16); // crc
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += 30 + name.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, eocd]);
}

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function colLetter(n0: number): string {
  let s = '';
  let n = n0 + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Lembaran pertama dengan data SAMA dengan templat CSV (6 jenis).
const shared: string[] = [];
function sharedIdx(text: string): number {
  shared.push(text);
  return shared.length - 1;
}
function cellS(col: number, row: number, text: string): string {
  return `<c r="${colLetter(col)}${row}" t="s"><v>${sharedIdx(text)}</v></c>`;
}
function cellN(col: number, row: number, num: number): string {
  return `<c r="${colLetter(col)}${row}"><v>${num}</v></c>`;
}

// lajur: 0 jenis, 1 soalan, 2..7 pilihan_a..f, 8 jawapan, 9 markah, 10 masa_saat, 11 petunjuk
const rowsXml: string[] = [];
function addRow(row: number, cellsXml: string): void {
  rowsXml.push(`<row r="${row}">${cellsXml}</row>`);
}
addRow(1, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((c) => cellS(c, 1, ['jenis', 'soalan', 'pilihan_a', 'pilihan_b', 'pilihan_c', 'pilihan_d', 'pilihan_e', 'pilihan_f', 'jawapan', 'markah', 'masa_saat', 'petunjuk'][c])).join(''));
addRow(2, cellS(0, 2, 'aneka') + cellS(1, 2, 'Pilih DUA buah yang berwarna kuning apabila masak.') +
  cellS(2, 2, 'Pisang') + cellS(3, 2, 'Manggis') + cellS(4, 2, 'Nanas') + cellS(5, 2, 'Durian') +
  cellS(8, 2, 'A,C') + cellN(9, 2, 100) + cellN(10, 2, 30));
addRow(3, cellS(0, 3, 'pendek') + cellS(1, 3, 'Apakah nama ibu negara Malaysia?') +
  '<c r="E3"/>' + // sel kosong di tengah baris, tidak mengalihkan lajur
  cellS(8, 3, 'Kuala Lumpur|KL') + cellN(9, 3, 100) + cellN(10, 3, 20) +
  `<c r="L3" t="inlineStr"><is><t>Singkatannya KL.</t></is></c>`);
addRow(4, cellS(0, 4, 'betul_salah') + cellS(1, 4, 'Air mendidih pada suhu 100 darjah Celsius di tekanan paras laut.') +
  cellS(8, 4, 'Betul') + cellN(9, 4, 100) + cellN(10, 4, 15));
addRow(5, cellS(0, 5, 'esei') + cellS(1, 5, 'Terangkan secara ringkas bagaimana tumbuhan hijau membuat makanan sendiri.') +
  cellS(8, 5, 'Sebut: cahaya matahari, air & klorofil.') + cellN(9, 5, 200) + cellN(10, 5, 60));
addRow(6, cellS(0, 6, 'padanan') + cellS(1, 6, 'Padankan haiwan dengan bunyinya.') +
  cellS(2, 6, 'Kucing = Meow') + cellS(3, 6, 'Anjing = Guk guk') + cellS(4, 6, 'Lembu = Moo') +
  cellN(9, 6, 100) + cellN(10, 6, 30));
addRow(7, cellS(0, 7, 'susunan') + cellS(1, 7, 'Susun langkah menanam pokok mengikut turutan yang betul.') +
  cellS(2, 7, 'Pilih tempat yang cerah') + cellS(3, 7, 'Gali lubang') + cellS(4, 7, 'Masukkan benih') +
  cellS(5, 7, 'Tutup dengan tanah') + cellS(6, 7, 'Siram air') +
  `<c r="J7"><v>100</v></c><c r="K7"><v>45</v></c><c r="L7" t="str"><f>"Tanam dulu"</f><v>Tanam dulu</v></c>`);

const sharedXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst count="' + shared.length + '" uniqueCount="' + shared.length + '">' +
  shared.map((s) => '<si><t xml:space="preserve">' + escXml(s) + '</t></si>').join('') + '</sst>';
const sheetXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet><sheetData>' +
  rowsXml.join('') + '</sheetData></worksheet>';
const workbookXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Lembaran1" sheetId="1" r:id="rId1"/></sheets></workbook>';
const relsXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>';
const contentTypesXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>';

function xlsxFiles(): { name: string; data: Buffer }[] {
  return [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml) },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml) },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(relsXml) },
    { name: 'xl/sharedStrings.xml', data: Buffer.from(sharedXml) },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheetXml) },
  ];
}

function stripHint(q?: ArenaQuestionInput): string | null {
  if (!q) return null;
  return JSON.stringify({ type: q.type, prompt: q.prompt, data: q.data, points: q.points, time_limit_sec: q.time_limit_sec });
}

const csvQuestions = t.questions; // kriteria 1 sebagai rujukan

for (const compress of [false, true]) {
  const buf = buildZip(xlsxFiles(), compress);
  const rows = readXlsxRows(buf);
  const xt = parseArenaSheet(rows);
  const label = compress ? 'deflate' : 'STORED';
  check(`xlsx (${label}): tiada ralat`, xt.errors.length === 0, xt.errors);
  check(`xlsx (${label}): 6 soalan`, xt.questions.length === 6, xt.questions.length);
  check(`xlsx (${label}): soalan sama dengan CSV`,
    xt.questions.every((q, i) => stripHint(q) === stripHint(csvQuestions[i])),
    xt.questions.map((q, i) => [stripHint(q), stripHint(csvQuestions[i])]));
  const xlPendek = xt.questions[1];
  check(`xlsx (${label}): petunjuk inlineStr dikekalkan`, xlPendek?.hint?.value === 'Singkatannya KL.', xlPendek?.hint);
  const xlSusun = xt.questions[5];
  check(`xlsx (${label}): petunjuk t="str" (formula) dibaca`, xlSusun?.hint?.value === 'Tanam dulu', xlSusun?.hint);
}

const stored = readXlsxRows(buildZip(xlsxFiles(), false));
check('xlsx: entiti &amp; dinyahkod sekali', stored[4]?.[8] === 'Sebut: cahaya matahari, air & klorofil.', stored[4]?.[8]);
check('xlsx: sel kosong di tengah tidak mengalihkan lajur',
  stored[2]?.[8] === 'Kuala Lumpur|KL' && stored[2]?.[2] === '' && stored[2]?.[3] === '',
  stored[2]);
check('xlsx: nombor kekal rentetan mentah', stored[1]?.[9] === '100' && stored[1]?.[10] === '30', [stored[1]?.[9], stored[1]?.[10]]);

// lembaran kedua mesti diABAIKAN: tambah sheet2 selepas sheet1 dalam ZIP
const twoSheets = xlsxFiles();
twoSheets.push({ name: 'xl/worksheets/sheet2.xml', data: Buffer.from(
  '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>jenis</t></is></c></row></sheetData></worksheet>') });
const two = parseArenaSheet(readXlsxRows(buildZip(twoSheets, false)));
check('xlsx: hanya lembaran pertama dibaca', two.questions.length === 6, two.questions.length);

/* ===== Bahagian 5: fail xlsx rosak / bom zip (kriteria 7) ===== */

function throws(read: () => unknown): string | null {
  try {
    read();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

check('bukan ZIP ditolak dengan mesej jelas',
  /not an Excel/.test(throws(() => readXlsxRows(Buffer.from('hello world, ini bukan zip'))) ?? ''),
  throws(() => readXlsxRows(Buffer.from('hello world, ini bukan zip'))));

const noSheet = buildZip([{ name: '[Content_Types].xml', data: Buffer.from(contentTypesXml) }], false);
check('ZIP tanpa lembaran ditolak',
  /no worksheet/.test(throws(() => readXlsxRows(noSheet)) ?? ''),
  throws(() => readXlsxRows(noSheet)));

// bom zip: entri mengaku kecil tetapi inflate kepada 25 MB melebihi had 20 MB
const bombData = zlib.deflateRawSync(Buffer.alloc(25 * 1024 * 1024, 0x41));
const bombLocal = Buffer.alloc(30);
bombLocal.writeUInt32LE(0x04034b50, 0);
bombLocal.writeUInt16LE(8, 8); // method deflate
bombLocal.writeUInt32LE(1000, 22); // saiz tidak dipercayai
bombLocal.writeUInt16LE('xl/worksheets/sheet1.xml'.length, 26);
const bombCen = Buffer.alloc(46);
bombCen.writeUInt32LE(0x02014b50, 0);
bombCen.writeUInt16LE(8, 10);
bombCen.writeUInt32LE(bombData.length, 20);
bombCen.writeUInt32LE(1000, 24);
bombCen.writeUInt16LE('xl/worksheets/sheet1.xml'.length, 28);
bombCen.writeUInt32LE(0, 42); // offset header setempat: mula buffer
const bombBuf = Buffer.concat([
  bombLocal, Buffer.from('xl/worksheets/sheet1.xml'), bombData,
  bombCen, Buffer.from('xl/worksheets/sheet1.xml'),
  (() => { const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(1, 8); e.writeUInt16LE(1, 10); e.writeUInt32LE(bombCen.length + 'xl/worksheets/sheet1.xml'.length, 12); e.writeUInt32LE(30 + 'xl/worksheets/sheet1.xml'.length + bombData.length, 16); return e; })(),
]);
const bombMsg = throws(() => readXlsxRows(bombBuf));
check('bom zip (inflate melebihi had) ditolak tanpa ranap',
  bombMsg !== null && (/too large|decompressed/.test(bombMsg)),
  bombMsg);

// entri saiz sah tetapi mengaku uncompSize melebihi had: ditolak sebelum inflate
const big = zlib.deflateRawSync(Buffer.alloc(1024, 0x41));
const bigFiles = [
  { name: 'xl/worksheets/sheet1.xml', data: Buffer.alloc(ARENA_XLSX_MAX_XML_BYTES + 1, 0x41) },
];
// bina ZIP tangan dengan uncompSize dipercayai tetapi data sebenar kecil
const bigName = Buffer.from(bigFiles[0].name, 'utf8');
const bigLocal = Buffer.alloc(30);
bigLocal.writeUInt32LE(0x04034b50, 0);
bigLocal.writeUInt16LE(8, 8);
bigLocal.writeUInt32LE(big.length, 18);
bigLocal.writeUInt32LE(bigFiles[0].data.length, 22);
bigLocal.writeUInt16LE(bigName.length, 26);
const bigCen = Buffer.alloc(46);
bigCen.writeUInt32LE(0x02014b50, 0);
bigCen.writeUInt16LE(8, 10);
bigCen.writeUInt32LE(big.length, 20);
bigCen.writeUInt32LE(bigFiles[0].data.length, 24);
bigCen.writeUInt16LE(bigName.length, 28);
bigCen.writeUInt32LE(0, 42); // offset header setempat: mula buffer
const bigEocd = Buffer.alloc(22);
bigEocd.writeUInt32LE(0x06054b50, 0);
bigEocd.writeUInt16LE(1, 8);
bigEocd.writeUInt16LE(1, 10);
bigEocd.writeUInt32LE(46 + bigName.length, 12);
bigEocd.writeUInt32LE(30 + bigName.length + big.length, 16);
const bigMsg = throws(() => readXlsxRows(Buffer.concat([bigLocal, bigName, big, bigCen, bigName, bigEocd])));
check('uncompSize melebihi had 20 MB ditolak sebelum inflate', /too large/.test(bigMsg ?? ''), bigMsg);

/* ===== Bahagian 6: Aiken (kriteria 5) ===== */

const aikenText = [
  'What is 2 + 2?',
  'A. 3',
  'B. 4',
  'ANSWER: B',
  '',
  'Blok rosak tanpa baris jawapan',
  'A. satu',
  'B. dua',
  '',
  'Ibu negara Perancis?',
  'A) Lyon',
  'B) Paris',
  'ANSWER: B',
  '',
  'Sungai terpanjang di Malaysia?',
  'A. Rajang',
  'B. Pahang',
  'ANSWER: A',
  '',
].join('\r\n');
const ai = parseArenaAiken(aikenText);
check('aiken: 3 soalan sah', ai.questions.length === 3, ai.questions.length);
check('aiken: 1 blok dilangkau', ai.skipped === 1, ai.skipped);
check('aiken: semua jenis multiple dengan points 100, masa 30',
  ai.questions.every((q) => q.type === 'multiple' && q.points === 100 && q.time_limit_sec === 30),
  ai.questions.map((q) => [q.type, q.points, q.time_limit_sec]));
const aiB = ai.questions[0]?.data as { choiceList: { key: string; isAnswer: boolean }[] };
check('aiken: kunci jawapan dipetakan betul', aiB.choiceList.some((c) => c.key === 'B' && c.isAnswer) && aiB.choiceList.filter((c) => c.isAnswer).length === 1, aiB);
check('aiken: pilihan ( ) difahami', (ai.questions[1]?.data as { choiceList: { key: string }[] }).choiceList[1]?.key === 'B');

/* ===== Ringkasan ===== */

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);