// Import soalan Arena daripada Excel (.xlsx), CSV templat dan teks Aiken.
// Pelayan sahaja: pembaca .xlsx memerlukan Buffer dan zlib.
//
// Semua soalan yang dihasilkan di sini DILALUI validateQuestion, supaya
// import tidak boleh mencipta soalan yang tidak sah melalui laluan lain.
//
// Keselamatan (kzsec): pembaca ZIP ditulis sendiri (tiada kebergantungan
// npm); entri hanya dibaca dalam memori, tiada penulisan ke sistem fail.
// Jumlah saiz XML selepas inflate dihadkan (lindung bom zip).
import * as zlib from 'node:zlib';
import { parseAiken, parseCsvRows, detectCsvDelimiter } from '@/lib/live-quiz';
import { validateQuestion } from '@/lib/arena/validate';
import type { ArenaHint, ArenaQuestionData, ArenaQuestionInput, ArenaQType } from '@/lib/arena/types';

/** Ralat satu baris templat. `row` ikut nombor baris Excel (pengepala = 1). */
export interface ArenaRowError {
  row: number;
  message: string;
}

/** Had import (tiket): maksimum 200 soalan setiap muat naik. */
export const ARENA_IMPORT_MAX = 200;
/** Had csv/aiken: 500,000 aksara. */
export const ARENA_TEXT_MAX_CHARS = 500_000;
/** Had fail .xlsx selepas nyahkod base64: 2 MB. */
export const ARENA_XLSX_MAX_BYTES = 2 * 1024 * 1024;
/** Had jumlah XML selepas inflate (lindung bom zip): 20 MB. */
export const ARENA_XLSX_MAX_XML_BYTES = 20 * 1024 * 1024;
/** Had bilangan entri ZIP yang dibaca. */
export const ARENA_XLSX_MAX_ENTRIES = 200;
/** Had baris dan lajur lembaran yang dibaca (jauh melebihi 200 soalan). */
export const ARENA_XLSX_MAX_ROWS = 5000;
export const ARENA_XLSX_MAX_COLS = 64;

const OPTION_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];

/* ============================================================ templat CSV */

/** Pengepala templat Arena (Bahasa Melayu, ikut tiket). */
export const ARENA_CSV_HEADER =
  'jenis,soalan,pilihan_a,pilihan_b,pilihan_c,pilihan_d,pilihan_e,pilihan_f,jawapan,markah,masa_saat,petunjuk';

function csvField(f: string): string {
  return /["\r\n,;]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f;
}
function csvRow(cells: string[]): string {
  return cells.map(csvField).join(',');
}

/** Templat yang dimuat turun pendidik: 6 baris contoh, satu setiap jenis. CRLF supaya Excel gembira. */
export const ARENA_CSV_TEMPLATE = [
  ARENA_CSV_HEADER,
  csvRow(['aneka', 'Pilih DUA buah yang berwarna kuning apabila masak.', 'Pisang', 'Manggis', 'Nanas', 'Durian', '', '', 'A,C', '100', '30', '']),
  csvRow(['pendek', 'Apakah nama ibu negara Malaysia?', '', '', '', '', '', '', 'Kuala Lumpur|KL', '100', '20', 'Singkatannya KL.']),
  csvRow(['betul_salah', 'Air mendidih pada suhu 100 darjah Celsius di tekanan paras laut.', '', '', '', '', '', '', 'Betul', '100', '15', '']),
  csvRow(['esei', 'Terangkan secara ringkas bagaimana tumbuhan hijau membuat makanan sendiri.', '', '', '', '', '', '', 'Sebut: cahaya matahari, air & klorofil.', '200', '60', '']),
  csvRow(['padanan', 'Padankan haiwan dengan bunyinya.', 'Kucing = Meow', 'Anjing = Guk guk', 'Lembu = Moo', '', '', '', '', '100', '30', '']),
  csvRow(['susunan', 'Susun langkah menanam pokok mengikut turutan yang betul.', 'Pilih tempat yang cerah', 'Gali lubang', 'Masukkan benih', 'Tutup dengan tanah', 'Siram air', '', '', '100', '45', 'Tanam dulu, baru siram air.']),
  '',
].join('\r\n');

/* ============================================================ templat CSV */

/** Normalkan satu pengepala/jenis: huruf kecil, buang ruang, tanda sempang dan underscore. */
function normHead(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** Padanan nama lajur kepada kunci dalaman. */
function headerKey(h: string): string {
  const k = normHead(h);
  const pil = /^pilihan([a-f])$/.exec(k);
  if (pil) return 'pilihan_' + pil[1];
  const opt = /^(?:option|choice)([a-f])$/.exec(k);
  if (opt) return 'pilihan_' + opt[1];
  const aliases: Record<string, string> = {
    jenis: 'jenis', type: 'jenis',
    soalan: 'soalan', question: 'soalan', prompt: 'soalan',
    jawapan: 'jawapan', answer: 'jawapan', correct: 'jawapan',
    markah: 'markah', points: 'markah', mata: 'markah',
    masasaat: 'masa_saat', masa: 'masa_saat', saat: 'masa_saat', seconds: 'masa_saat', time: 'masa_saat',
    petunjuk: 'petunjuk', hint: 'petunjuk',
  };
  return aliases[k] ?? k;
}

/** Padanan nilai `jenis` kepada jenis Arena. */
const TYPE_ALIASES: Record<string, ArenaQType> = {
  aneka: 'multiple', multiple: 'multiple',
  pendek: 'subjective', subjective: 'subjective',
  betulsalah: 'ox', ox: 'ox', truefalse: 'ox',
  esei: 'essay', essay: 'essay',
  padanan: 'match', match: 'match', matching: 'match',
  susunan: 'order', order: 'order', sorting: 'order',
};

/** Nombor bulat positif atau null. */
function wholeNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t || !/^\d+$/.test(t)) return null;
  return parseInt(t, 10);
}

/* ============================================================ templat (baris) */

/**
 * Tukar baris templat (baris pertama = pengepala) kepada soalan Arena.
 * Semua atau tiada: jika `errors` tidak kosong, pemanggil TIDAK boleh
 * memasukkan apa-apa. Nombor baris ralat ikut Excel (pengepala = 1).
 */
export function parseArenaSheet(rows: string[][]): { questions: ArenaQuestionInput[]; errors: ArenaRowError[] } {
  const questions: ArenaQuestionInput[] = [];
  const errors: ArenaRowError[] = [];

  const firstIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  if (firstIdx === -1) return { questions, errors: [{ row: 0, message: 'The file is empty.' }] };

  const header = rows[firstIdx].map((h) => headerKey(String(h ?? '')));
  const col = (name: string) => header.indexOf(name);
  const iJenis = col('jenis');
  const iSoalan = col('soalan');
  if (iJenis === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row has no "jenis" column. Start from the downloaded template.' });
  }
  if (iSoalan === -1) {
    errors.push({ row: firstIdx + 1, message: 'The header row has no "soalan" column. Start from the downloaded template.' });
  }
  if (errors.length > 0) return { questions: [], errors };

  const iJawapan = col('jawapan');
  const iMarkah = col('markah');
  const iMasa = col('masa_saat');
  const iPetunjuk = col('petunjuk');
  const iPilihan = OPTION_LETTERS.map((l) => col('pilihan_' + l));
  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? String(r[i] ?? '').trim() : '');

  for (let r = firstIdx + 1; r < rows.length; r++) {
    const raw = rows[r];
    if (!Array.isArray(raw) || !raw.some((c) => String(c ?? '').trim() !== '')) continue; // baris kosong dilangkau
    const rowNo = r + 1;

    // jenis
    const jenisRaw = cell(raw, iJenis);
    const type = TYPE_ALIASES[normHead(jenisRaw)] ?? null;
    if (!type) {
      errors.push({
        row: rowNo,
        message: `Unknown question type "${jenisRaw}". Use aneka, pendek, betul_salah, esei, padanan or susunan.`,
      });
      continue;
    }

    // soalan
    const prompt = cell(raw, iSoalan);
    if (!prompt) {
      errors.push({ row: rowNo, message: 'The question text is empty.' });
      continue;
    }

    // pilihan ikut turutan lajur, tanpa lompang tengah (seperti Live Quiz)
    const texts = iPilihan.map((i) => cell(raw, i));
    const filled: { letter: string; text: string }[] = [];
    let gap = false;
    let gapCol = '';
    for (let k = 0; k < texts.length; k++) {
      if (texts[k]) {
        if (gap) { gapCol = OPTION_LETTERS[k]; break; }
        filled.push({ letter: OPTION_LETTERS[k].toUpperCase(), text: texts[k] });
      } else {
        gap = true;
      }
    }
    if (gapCol) {
      errors.push({
        row: rowNo,
        message: `pilihan_${gapCol} is filled but an earlier choice column is empty. Fill the choices in order.`,
      });
      continue;
    }

    const jawapanRaw = cell(raw, iJawapan);
    let data: ArenaQuestionData | null = null;

    if (type === 'multiple') {
      if (filled.length < 2) {
        errors.push({ row: rowNo, message: 'aneka needs at least two filled choice columns (pilihan_a, pilihan_b...).' });
        continue;
      }
      const keys = jawapanRaw.split(/[,;]/).map((s) => s.trim().toUpperCase().replace(/[.)\s]+$/, '')).filter(Boolean);
      if (keys.length === 0) {
        errors.push({ row: rowNo, message: 'the "jawapan" column is empty. Fill in the correct letter, e.g. A or A,C.' });
        continue;
      }
      if (new Set(keys).size !== keys.length) {
        errors.push({ row: rowNo, message: 'the "jawapan" column repeats a letter.' });
        continue;
      }
      const bad = keys.find((k) => !/^[A-F]$/.test(k) || !filled.some((f) => f.letter === k));
      if (bad) {
        errors.push({ row: rowNo, message: `"jawapan" must match a filled choice, but it reads "${jawapanRaw}".` });
        continue;
      }
      data = {
        choiceList: filled.map((f) => ({ key: f.letter, text: f.text, isAnswer: keys.includes(f.letter) })),
      };
    } else if (type === 'subjective') {
      const parts = jawapanRaw.split('|').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) {
        errors.push({
          row: rowNo,
          message: 'pendek needs at least one accepted answer in "jawapan", separated by | (e.g. Hijau|hijau muda).',
        });
        continue;
      }
      data = { answerList: parts.map((t, i) => ({ key: String.fromCharCode(97 + i), text: t })) };
    } else if (type === 'ox') {
      const a = normHead(jawapanRaw).replace(/[.)]+$/, '');
      const oMap: Record<string, 'o' | 'x'> = {
        betul: 'o', b: 'o', o: 'o', true: 'o', t: 'o', ya: 'o', y: 'o',
        salah: 'x', s: 'x', x: 'x', false: 'x', f: 'x', tidak: 'x', n: 'x',
      };
      const ans = oMap[a];
      if (!ans) {
        errors.push({
          row: rowNo,
          message: `"jawapan" must read Betul or Salah (also B/S, O/X, True/False), but it reads "${jawapanRaw}".`,
        });
        continue;
      }
      data = { answer: ans };
    } else if (type === 'essay') {
      // jawapan = rubrik (pilihan), dipapar kepada pendidik sahaja
      data = jawapanRaw ? { rubric: jawapanRaw } : {};
    } else if (type === 'match') {
      const pairs: { left: string; right: string }[] = [];
      let badPair = '';
      for (const f of filled) {
        const eq = f.text.indexOf('=');
        const left = eq > 0 ? f.text.slice(0, eq).trim() : '';
        const right = eq >= 0 && eq < f.text.length - 1 ? f.text.slice(eq + 1).trim() : '';
        if (!left || !right) { badPair = f.text; break; }
        pairs.push({ left, right });
      }
      if (badPair) {
        errors.push({
          row: rowNo,
          message: `padanan choices must look like "kiri = kanan", but one reads "${badPair}". The "jawapan" column is ignored for padanan.`,
        });
        continue;
      }
      if (pairs.length < 2 || pairs.length > 5) {
        errors.push({ row: rowNo, message: 'padanan needs 2-5 pairs in pilihan_a..pilihan_f.' });
        continue;
      }
      data = {
        leftItems: pairs.map((p, i) => ({ key: `L${i + 1}`, text: p.left })),
        rightItems: pairs.map((p, i) => ({ key: `R${i + 1}`, text: p.right })),
        answerPairs: pairs.map((_, i) => ({ left: `L${i + 1}`, right: `R${i + 1}` })),
      };
    } else {
      // order (susunan): pilihan_a..e dalam turutan BETUL, 2-5 item
      if (filled.length < 2 || filled.length > 5) {
        errors.push({ row: rowNo, message: 'susunan needs 2-5 items in pilihan_a..pilihan_e, in the correct order.' });
        continue;
      }
      data = { items: filled.map((f) => ({ key: f.letter, text: f.text })) };
    }

    // markah (lalai 100) dan masa saat (lalai 30)
    let points = 100;
    const pRaw = cell(raw, iMarkah);
    if (pRaw) {
      const n = wholeNumber(pRaw);
      if (n === null || n < 1 || n > 10000) {
        errors.push({ row: rowNo, message: `"markah" must be a whole number between 1 and 10000, but it reads "${pRaw}".` });
        continue;
      }
      points = n;
    }
    let timeLimit = 30;
    const sRaw = cell(raw, iMasa);
    if (sRaw) {
      const n = wholeNumber(sRaw);
      if (n === null || n < 5 || n > 600) {
        errors.push({ row: rowNo, message: `"masa_saat" must be a whole number between 5 and 600, but it reads "${sRaw}".` });
        continue;
      }
      timeLimit = n;
    }

    // petunjuk (pilihan): teks sahaja
    const hintRaw = iPetunjuk === -1 ? '' : cell(raw, iPetunjuk);
    const hint: ArenaHint | null = hintRaw ? { type: 'text', value: hintRaw } : null;

    const input: ArenaQuestionInput = {
      type, prompt, data: data as ArenaQuestionData, hint, points, time_limit_sec: timeLimit, origin: 'manual',
    };
    const v = validateQuestion(input);
    if (!v.ok) {
      errors.push({ row: rowNo, message: v.error });
      continue;
    }
    questions.push(v.value);
  }

  // Semua atau tiada: jika ada sebarang ralat baris, pemanggil menerima
  // senarai kosong supaya import separuh jalan tidak mungkin berlaku.
  return { questions: errors.length > 0 ? [] : questions, errors };
}

/** Tukar teks CSV (Excel Malaysia/Eropah boleh guna `;`) kepada soalan. BOM dibuang. */
export function parseArenaCsv(text: string): { questions: ArenaQuestionInput[]; errors: ArenaRowError[] } {
  const noBom = text.replace(/^\uFEFF/, '');
  return parseArenaSheet(parseCsvRows(noBom, detectCsvDelimiter(noBom)));
}

/**
 * Tukar teks Aiken kepada soalan Arena jenis `multiple` (satu jawapan betul),
 * markah 100, masa 30 s. Blok rosak dilangkau oleh parseAiken (dikira dalam
 * `skipped`), sama seperti Live Quiz.
 */
export function parseArenaAiken(text: string): { questions: ArenaQuestionInput[]; skipped: number } {
  const parsed = parseAiken(text);
  const questions: ArenaQuestionInput[] = [];
  let skipped = parsed.skipped;
  for (const q of parsed.questions) {
    const input: ArenaQuestionInput = {
      type: 'multiple',
      prompt: q.prompt,
      data: {
        choiceList: q.options.map((o) => ({ key: o.key, text: o.text, isAnswer: o.key === q.correct_key })),
      },
      hint: null,
      points: 100,
      time_limit_sec: 30,
      origin: 'manual',
    };
    const v = validateQuestion(input);
    if (!v.ok) { skipped++; continue; }
    questions.push(v.value);
  }
  return { questions, skipped };
}

/* ============================================================ pembaca .xlsx */

/** Entri ZIP dari central directory. Data hanya dibaca dalam memori. */
interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  uncompSize: number;
  dataStart: number;
}

/** Baca senarai entri dari central directory (EOCD dicari dari hujung buffer). */
function readZipEntries(buf: Buffer): ZipEntry[] {
  if (buf.length < 22 || buf.readUInt16LE(0) !== 0x4b50) {
    throw new Error('That file is not an Excel .xlsx workbook. An .xlsx file is a ZIP archive.');
  }
  let eocd = -1;
  const scanFrom = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= scanFrom; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('That file is not a valid Excel .xlsx workbook (no ZIP directory).');
  const count = buf.readUInt16LE(eocd + 10);
  if (count === 0 || count > ARENA_XLSX_MAX_ENTRIES) {
    throw new Error('That workbook has too many internal files.');
  }
  let off = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (off < 0 || off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error('That workbook ZIP archive is corrupt.');
    }
    const flags = buf.readUInt16LE(off + 8);
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    off += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // folder
    if (flags & 0x0008 || compSize === 0xffffffff || uncompSize === 0xffffffff) {
      // saiz dalam descriptor, bukan central directory: tidak disokong
      throw new Error('That workbook uses unsupported ZIP features (data descriptor).');
    }
    if (localOff < 0 || localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) {
      throw new Error('That workbook ZIP archive is corrupt.');
    }
    const lnameLen = buf.readUInt16LE(localOff + 26);
    const lextraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lnameLen + lextraLen;
    if (dataStart + compSize > buf.length) {
      throw new Error('That workbook ZIP archive is corrupt.');
    }
    entries.push({ name, method, compSize, uncompSize, dataStart });
  }
  return entries;
}

/** Nyahkod entiti XML, satu laluan sahaja (&amp;lt; kekal &lt;, bukan <). */
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Baca satu fail dalam arkib dengan had saiz dikongsi (lindung bom zip). */
function zipRead(buf: Buffer, entries: ZipEntry[], name: string, budget: { left: number }): Buffer {
  const e = entries.find((x) => x.name === name);
  if (!e) return Buffer.alloc(0);
  if (e.method === 0) {
    // STORED: compSize mesti sama dengan uncompSize
    if (e.compSize !== e.uncompSize) throw new Error('That workbook ZIP archive is corrupt.');
    if (e.uncompSize > budget.left) throw new Error('That workbook is too large to import.');
    budget.left -= e.uncompSize;
    return buf.subarray(e.dataStart, e.dataStart + e.uncompSize);
  }
  if (e.method !== 8) throw new Error('That workbook uses an unsupported ZIP compression method.');
  if (e.uncompSize > budget.left) throw new Error('That workbook is too large to import.');
  const comp = buf.subarray(e.dataStart, e.dataStart + e.compSize);
  let out: Buffer;
  try {
    out = zlib.inflateRawSync(comp, { maxOutputLength: budget.left + 1 });
  } catch {
    throw new Error('That workbook could not be decompressed.');
  }
  if (out.length > budget.left) throw new Error('That workbook is too large to import.');
  budget.left -= out.length;
  return out;
}

/** Peta rId -> laluan lembaran kerja, daripada xl/_rels/workbook.xml.rels. */
function worksheetTargets(relsXml: string): Map<string, string> {
  const m = new Map<string, string>();
  const re = /<Relationship\b[^>]*>/g;
  let t: RegExpExecArray | null;
  while ((t = re.exec(relsXml)) !== null) {
    const id = /Id="([^"]+)"/.exec(t[0])?.[1];
    const target = /Target="([^"]+)"/.exec(t[0])?.[1];
    const relType = /Type="([^"]+)"/.exec(t[0])?.[1] ?? '';
    if (id && target && /\/worksheet$/.test(relType)) m.set(id, target);
  }
  return m;
}

/** Gabungkan asas "xl" dengan Target relatif (atau mutlak bermula "/"). */
function joinZipPath(base: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return base + '/' + target.replace(/^\.\//, '');
}

/** Rentetan dikongsi: setiap <si> ialah satu rentetan; <r><t> dipecahkan dan digabung. */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    const inner = m[1] ?? '';
    const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let s = '';
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner)) !== null) s += decodeXml(t[1]);
    out.push(s);
  }
  return out;
}

/** Nombor lajur daripada huruf rujukan sel (A = 0, B = 1, ...). */
function colIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

/** Baca lembaran kerja: baris ikut r="N" (lompang dikekalkan), lajur ikut r="C5". */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(xml)) !== null) {
    const attrs = m[1] ?? m[2] ?? '';
    const content = m[3] ?? '';
    const rNo = parseInt(/(?:^|\s)r="(\d+)"/.exec(attrs)?.[1] ?? '0', 10);
    if (rNo > ARENA_XLSX_MAX_ROWS) throw new Error('That workbook has too many rows.');
    const idx = (rNo >= 1 ? rNo : rows.length + 1) - 1;
    if (idx >= ARENA_XLSX_MAX_ROWS) throw new Error('That workbook has too many rows.');
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let lastCol = -1;
    while ((cm = cellRe.exec(content)) !== null) {
      const cAttrs = cm[1] ?? '';
      const cInner = cm[2] ?? '';
      // kedudukan lajur: r="C5"; tanpa r, ikut selepas sel terdahulu
      const ref = /(?:^|\s)r="([A-Z]+)\d+"/.exec(cAttrs)?.[1];
      let colIdx = ref ? colIndex(ref) : lastCol + 1;
      lastCol = colIdx;
      if (colIdx < 0 || colIdx >= ARENA_XLSX_MAX_COLS) continue;
      const t = /\bt="([^"]+)"/.exec(cAttrs)?.[1] ?? '';
      let value = '';
      if (t === 's') {
        // rentetan dikongsi: <v> ialah indeks ke dalam sharedStrings
        const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cInner)?.[1] ?? '';
        const i = /^\d+$/.test(v.trim()) ? parseInt(v.trim(), 10) : -1;
        value = i >= 0 && i < shared.length ? shared[i] : '';
      } else if (t === 'inlineStr') {
        // rentetan dalam tempat: <is><t>...</t></is>
        const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cInner)?.[1] ?? cInner;
        const tRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
        let s = '';
        let tm: RegExpExecArray | null;
        while ((tm = tRe.exec(is)) !== null) s += decodeXml(tm[1]);
        value = s;
      } else if (t === 'b') {
        value = (/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cInner)?.[1] ?? '').trim() === '1' ? 'true' : 'false';
      } else {
        // nombor (lalai), hasil formula (t="str") atau ralat sel (t="e"): kekal mentah
        value = decodeXml(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cInner)?.[1] ?? '');
      }
      while (cells.length <= colIdx) cells.push('');
      cells[colIdx] = value;
    }
    while (rows.length <= idx) rows.push([]);
    rows[idx] = cells;
  }
  return rows;
}

/**
 * Baca lembaran PERTAMA sahaja fail .xlsx dan pulangkan baris sebagai string[][].
 * Saiz XML selepas inflate dihadkan (lindung bom zip); saiz setiap entri
 * disemak sebelum inflate supaya fail yang besar ditolak serta-merta.
 */
export function readXlsxRows(buf: Buffer): string[][] {
  const entries = readZipEntries(buf);
  const budget = { left: ARENA_XLSX_MAX_XML_BYTES };

  const sharedXml = zipRead(buf, entries, 'xl/sharedStrings.xml', budget);
  const shared = sharedXml.length ? parseSharedStrings(sharedXml.toString('utf8')) : [];

  let sheetXml: Buffer | null = null;
  const wbXml = zipRead(buf, entries, 'xl/workbook.xml', budget);
  if (wbXml.length) {
    const wb = wbXml.toString('utf8');
    const sheetTag = /<sheet\b[^>]*?>/.exec(wb)?.[0] ?? '';
    const rid = /r:id="([^"]+)"/.exec(sheetTag)?.[1];
    if (rid) {
      const relsXml = zipRead(buf, entries, 'xl/_rels/workbook.xml.rels', budget).toString('utf8');
      const target = worksheetTargets(relsXml).get(rid);
      if (target) sheetXml = zipRead(buf, entries, joinZipPath('xl', target), budget);
    }
  }
  // fallback untuk penulis .xlsx paling ringkas (tiada r:id)
  if (!sheetXml || !sheetXml.length) sheetXml = zipRead(buf, entries, 'xl/worksheets/sheet1.xml', budget);
  if (!sheetXml || !sheetXml.length) {
    throw new Error('That workbook has no worksheet to read.');
  }
  return parseSheet(sheetXml.toString('utf8'), shared);
}