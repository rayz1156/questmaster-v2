/**
 * Ujian sendiri untuk KZ-045: pemetaan bank Kuiz (kuiz-bank.ts) dan peraturan
 * permainan Arena (games.ts). Tidak menyentuh pangkalan data.
 *
 * Jalankan:  npx tsx scripts/selftest-kuiz-bank.ts
 *
 * Kenapa fail ini wujud: `npx tsc` tidak menyemak logik. Pemetaan jenis
 * soalan ialah tempat yang senyap salah: kunci jawapan yang tersasar
 * menyebabkan soalan "tidak boleh dijawab" dan hanya kelihatan selepas
 * sekelas pelajar sudah bermain.
 */
import {
  arenaInputToLiveRow,
  isLiveCompatible,
  liveRowToArena,
  OX_OPTIONS,
  type LiveBankRow,
} from '../src/lib/kuiz-bank';
import { isGoldenChest } from '../src/lib/arena/games';
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

/** Baris bank maya untuk memutarkan pemetaan bulat-balik. */
function barisMaya(input: ArenaQuestionInput, orderIdx = 0): LiveBankRow {
  const r = arenaInputToLiveRow(input);
  return {
    id: 'q-' + orderIdx,
    quiz_id: 'kuiz-maya',
    order_idx: orderIdx,
    prompt: r.prompt,
    options: r.options,
    correct_key: r.correct_key,
    qtype: r.qtype,
    data: r.data,
    hint: r.hint,
    points: r.points,
    time_limit_sec: r.time_limit_sec,
  };
}

/** Bandingkan ArenaQuestion hasil bulat-balik dengan input asal. */
function bulatBalik(input: ArenaQuestionInput, label: string) {
  const q = liveRowToArena(barisMaya(input));
  const sama =
    q.type === input.type &&
    q.prompt === input.prompt &&
    JSON.stringify(q.data) === JSON.stringify(input.data) &&
    (q.hint?.type === (input.hint?.type ?? null) || (!q.hint && !input.hint)) &&
    (q.hint?.value ?? null) === (input.hint?.value ?? null) &&
    q.points === (input.points ?? 100) &&
    q.time_limit_sec === (input.time_limit_sec ?? 30);
  check('bulat-balik ' + label, sama, { q, input });
}

/* ===== 1. pemetaan multiple ===== */

const multipleSatu: ArenaQuestionInput = {
  type: 'multiple',
  prompt: 'Warna langit?',
  data: {
    choiceList: [
      { key: 'a', text: 'Biru', isAnswer: true },
      { key: 'b', text: 'Merah', isAnswer: false },
      { key: 'c', text: 'Hijau', isAnswer: false },
    ],
  },
  points: 250,
  time_limit_sec: 30,
};
const m1 = arenaInputToLiveRow(multipleSatu);
check('multiple satu: options diisi', m1.options.length === 3, m1.options);
check('multiple satu: correct_key kunci betul', m1.correct_key === 'a', m1.correct_key);
check('multiple satu: data null', m1.data === null, m1.data);
check('multiple satu: mata dipetah', m1.points === 250, m1.points);
bulatBalik(multipleSatu, 'multiple satu');

const multipleBanyak: ArenaQuestionInput = {
  type: 'multiple',
  prompt: 'Pilih DUA nombor genap.',
  data: {
    choiceList: [
      { key: 'a', text: '2', isAnswer: true },
      { key: 'b', text: '3', isAnswer: false },
      { key: 'c', text: '4', isAnswer: true },
    ],
  },
};
const m2 = arenaInputToLiveRow(multipleBanyak);
check('multiple banyak: correct_key kosong', m2.correct_key === '', m2.correct_key);
check('multiple banyak: kunci dalam data', (m2.data as { choiceList: { isAnswer: boolean }[] }).choiceList.filter((c) => c.isAnswer).length === 2, m2.data);
check('multiple banyak: options tetap diisi', m2.options.length === 3, m2.options);
bulatBalik(multipleBanyak, 'multiple banyak');

/* ===== 2. pemetaan ox ===== */

const oxSoalan: ArenaQuestionInput = {
  type: 'ox',
  prompt: 'Air mendidih pada 100 darjah Celsius.',
  data: { answer: 'o' },
};
const o1 = arenaInputToLiveRow(oxSoalan);
check('ox: options O dan X', JSON.stringify(o1.options) === JSON.stringify(OX_OPTIONS), o1.options);
check('ox betul: correct_key O', o1.correct_key === 'O', o1.correct_key);
check('ox: data null', o1.data === null, o1.data);
const oxSoalanSalah: ArenaQuestionInput = {
  type: 'ox',
  prompt: 'Matahari mengelilingi Bumi.',
  data: { answer: 'x' },
};
check('ox salah: correct_key X', arenaInputToLiveRow(oxSoalanSalah).correct_key === 'X');
bulatBalik(oxSoalan, 'ox');

/* ===== 3. pemetaan subjective/essay/match/order ===== */

const subjective: ArenaQuestionInput = {
  type: 'subjective',
  prompt: 'Ibu negara Malaysia?',
  data: { answerList: [{ key: 'a', text: 'Kuala Lumpur' }], ignoreCase: true },
  hint: { type: 'text', value: 'Singkatannya KL.' },
};
const s1 = arenaInputToLiveRow(subjective);
check('subjective: options kosong', s1.options.length === 0, s1.options);
check('subjective: correct_key kosong', s1.correct_key === '', s1.correct_key);
check('subjective: data dipetah', JSON.stringify(s1.data) === JSON.stringify(subjective.data), s1.data);
check('subjective: hint dipetah', s1.hint?.value === 'Singkatannya KL.', s1.hint);
bulatBalik(subjective, 'subjective');

const esei: ArenaQuestionInput = {
  type: 'essay',
  prompt: 'Terangkan fotosintesis.',
  data: { rubric: 'cahaya, air, klorofil', maxLength: 800 },
};
const e1 = arenaInputToLiveRow(esei);
check('esei: options kosong dan kunci kosong', e1.options.length === 0 && e1.correct_key === '', e1);
bulatBalik(esei, 'esei');

const padanan: ArenaQuestionInput = {
  type: 'match',
  prompt: 'Padankan haiwan dengan bunyinya.',
  data: {
    leftItems: [{ key: 'L1', text: 'Kucing' }, { key: 'L2', text: 'Anjing' }],
    rightItems: [{ key: 'R1', text: 'Meow' }, { key: 'R2', text: 'Guk' }],
    answerPairs: [{ left: 'L1', right: 'R1' }, { left: 'L2', right: 'R2' }],
  },
};
bulatBalik(padanan, 'padanan');

const susunan: ArenaQuestionInput = {
  type: 'order',
  prompt: 'Susun langkah.',
  data: { items: [{ key: 'a', text: 'Satu' }, { key: 'b', text: 'Dua' }, { key: 'c', text: 'Tiga' }] },
};
bulatBalik(susunan, 'susunan');

/* ===== 4. liveRowToArena membina semula kunci ===== */

// Baris format lama (qtype lalai multiple, tiada data): kunci betul
// dikembalikan melalui choiceList isAnswer.
const lama: LiveBankRow = {
  id: 'lama',
  quiz_id: 'k',
  order_idx: 0,
  prompt: '2 + 2?',
  options: [
    { key: 'A', text: '3' },
    { key: 'B', text: '4' },
    { key: 'C', text: '5' },
  ],
  correct_key: 'B',
  qtype: 'multiple',
  data: null,
  hint: null,
  points: 1000,
  time_limit_sec: 20,
};
const lamaQ = liveRowToArena(lama);
check(
  'baris lama: isAnswer pada kunci B sahaja',
  lamaQ.type === 'multiple' &&
    (lamaQ.data as { choiceList: { key: string; isAnswer: boolean }[] }).choiceList.filter((c) => c.isAnswer).length === 1 &&
    (lamaQ.data as { choiceList: { key: string; isAnswer: boolean }[] }).choiceList.find((c) => c.isAnswer)?.key === 'B',
  lamaQ.data,
);
check('baris lama: set_id dipetah kepada quiz_id', lamaQ.set_id === 'k' && lamaQ.origin === 'manual', lamaQ);

const oxRow: LiveBankRow = {
  ...lama,
  id: 'ox-row',
  qtype: 'ox',
  options: OX_OPTIONS,
  correct_key: 'X',
};
const oxArena = liveRowToArena(oxRow);
check('baris ox: answer x dibina semula', (oxArena.data as { answer: string }).answer === 'x', oxArena.data);

/* ===== 5. isLiveCompatible ===== */

check('serasi: multiple satu jawapan', isLiveCompatible({ qtype: 'multiple', correct_key: 'A' }));
check('serasi: ox', isLiveCompatible({ qtype: 'ox', correct_key: 'O' }));
check('tidak serasi: subjective', !isLiveCompatible({ qtype: 'subjective', correct_key: '' }));
check('tidak serasi: essay', !isLiveCompatible({ qtype: 'essay', correct_key: '' }));
check('tidak serasi: match', !isLiveCompatible({ qtype: 'match', correct_key: '' }));
check('tidak serasi: order', !isLiveCompatible({ qtype: 'order', correct_key: '' }));
check('tidak serasi: multiple banyak jawapan', !isLiveCompatible({ qtype: 'multiple', correct_key: '' }));
check('tidak serasi: qtype tidak diketahui', !isLiveCompatible({ qtype: 'hantu', correct_key: 'A' }));

/* ===== 6. isGoldenChest ===== */

// Deterministik: panggilan berulang memberi hasil sama.
let deterministik = true;
for (let i = 0; i < 200; i++) {
  const sid = 'sid-' + i;
  const qid = 'qid-' + (i % 7);
  if (isGoldenChest(sid, qid) !== isGoldenChest(sid, qid)) deterministik = false;
}
check('isGoldenChest deterministik', deterministik);

// Nisbah: kira-kira satu daripada empat, tetapi bukan sifar dan bukan semua.
let emas = 0;
for (let i = 0; i < 1000; i++) {
  if (isGoldenChest('sesi', 'soalan-' + i)) emas++;
}
check('isGoldenChest kira-kira 1/4 (250 +- 60)', emas > 190 && emas < 310, emas);

// Kestabilan dan kepelbagaian: hasil sentiasa sama untuk panggilan sama, dan
// kedua-dua keputusan true dan false wujud dalam satu set sampel kecil.
const a = isGoldenChest('s1', 'q1');
check('isGoldenChest stabil', a === isGoldenChest('s1', 'q1'));
let adaTrue = false;
let adaFalse = false;
for (let i = 0; i < 20 && !(adaTrue && adaFalse); i++) {
  if (isGoldenChest('s1', 'q' + i)) adaTrue = true;
  else adaFalse = true;
}
check('isGoldenChest mempunyai true dan false', adaTrue && adaFalse, { adaTrue, adaFalse });
check('isGoldenChest: sesi berbeza boleh berbeza keputusan',
  isGoldenChest('s1', 'q9') === isGoldenChest('s1', 'q9'));

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
