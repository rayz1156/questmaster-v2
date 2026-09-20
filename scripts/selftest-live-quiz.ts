/**
 * Ujian sendiri untuk logik Live Quiz yang tidak menyentuh pangkalan data:
 * pemecah CSV dan pengiraan mata.
 *
 * Jalankan:  npx tsx scripts/selftest-live-quiz.ts
 *
 * Kenapa fail ini wujud: `npx tsc` dan `npm run build` tidak menyemak logik.
 * Formula mata dan pengesahan CSV ialah dua tempat yang senyap salah, dan
 * kesilapan di situ hanya kelihatan selepas sekelas pelajar sudah bermain.
 */
import { scoreAnswer, parseQuizCsv, QUIZ_CSV_TEMPLATE } from '../src/lib/live-quiz';

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

/* ===== Bahagian 1: pemecah CSV ===== */

const t = parseQuizCsv(QUIZ_CSV_TEMPLATE);
check('template: tiada ralat', t.errors.length === 0, t.errors);
check('template: 3 soalan', t.questions.length === 3, t.questions.length);
check('template: kunci soalan 1 ialah B', t.questions[0]?.correct_key === 'B');
check('template: soalan 1 ada 4 pilihan', t.questions[0]?.options.length === 4);
check('template: soalan 3 ialah 15 saat', t.questions[2]?.time_limit_sec === 15);
check('template: soalan 1 kira detik hidup', t.questions[0]?.use_countdown === true);
check('template: soalan 3 kira detik mati', t.questions[2]?.use_countdown === false);

const quoted = parseQuizCsv('question,option_a,option_b,correct\n"Rome, Italy is where?",Europe,Asia,A\n');
check('koma dalam medan berpetik',
  quoted.errors.length === 0 && quoted.questions[0]?.prompt === 'Rome, Italy is where?',
  [quoted.errors, quoted.questions[0]]);

const semi = parseQuizCsv('question;option_a;option_b;correct\nPick A;Yes;No;A\n');
check('pembatas koma bertitik', semi.errors.length === 0 && semi.questions.length === 1, semi.errors);

check('lajur question hilang',
  parseQuizCsv('soal,option_a,option_b,correct\nx,y,z,A\n').errors.length === 1);

const badKey = parseQuizCsv('question,option_a,option_b,correct\nWhat?,Yes,No,Z\n');
check('huruf jawapan salah', badKey.errors.length === 1 && badKey.errors[0].row === 2, badKey.errors);

check('kunci menunjuk pilihan kosong',
  parseQuizCsv('question,option_a,option_b,option_c,correct\nWhat?,Yes,No,,C\n').errors.length === 1);

const gap = parseQuizCsv('question,option_a,option_b,option_c,correct\nWhat?,Yes,,Maybe,A\n');
check('lompang di tengah pilihan',
  gap.errors.length === 1 && /earlier option is empty/.test(gap.errors[0].message), gap.errors);

check('mata bukan nombor',
  parseQuizCsv('question,option_a,option_b,correct,points\nWhat?,Yes,No,A,abc\n').errors.length === 1);

const mixed = parseQuizCsv('question,option_a,option_b,correct\nGood?,Yes,No,A\nBad?,Yes,No,Z\n');
check('satu baris rosak membatalkan semua',
  mixed.questions.length === 0 && mixed.errors.length === 1, [mixed.questions.length, mixed.errors]);

const blank = parseQuizCsv('question,option_a,option_b,correct\nGood?,Yes,No,A\n\nBad?,Yes,No,Z\n');
check('nombor baris ikut Excel walau ada baris kosong', blank.errors[0]?.row === 4, blank.errors);

check('fail kosong', parseQuizCsv('   ').errors.length === 1);

check('countdown lalai hidup',
  parseQuizCsv('question,option_a,option_b,correct\nX?,Y,N,A\n').questions[0]?.use_countdown === true);
check('countdown nilai salah ditolak',
  parseQuizCsv('question,option_a,option_b,correct,countdown\nX?,Y,N,A,maybe\n').errors.length === 1);
check('countdown no difahami',
  parseQuizCsv('question,option_a,option_b,correct,countdown\nX?,Y,N,A,no\n').questions[0]?.use_countdown === false);

/* ===== Bahagian 2: pengiraan mata ===== */

const P = 1000;
const T = 20;
const cd = (ms: number) =>
  scoreAnswer({ isCorrect: true, msTaken: ms, points: P, timeLimitSec: T, useCountdown: true }).pointsAwarded;
const no = (ms: number) =>
  scoreAnswer({ isCorrect: true, msTaken: ms, points: P, timeLimitSec: T, useCountdown: false }).pointsAwarded;

// Formula rasmi Kahoot: mata = bulat( (1 - (masa/had)/2) * mata_penuh ).
// Mod kira detik Kuizen mesti sepadan tepat, bukan lebih kurang.
const kahoot = (ms: number) => Math.round((1 - ms / (T * 1000) / 2) * P);
for (const ms of [600, 1000, 2500, 5000, 10000, 15000, 19000, 20000]) {
  check(`padanan Kahoot pada ${ms}ms (${cd(ms)})`, cd(ms) === kahoot(ms), [cd(ms), kahoot(ms)]);
}

check('bawah 0.5 saat dapat penuh', cd(200) === P && cd(500) === P, [cd(200), cd(500)]);
check('pada had masa dapat separuh', cd(20000) === 500, cd(20000));
check('lewat sedikit masih dikira', cd(21000) > 0, cd(21000));
check('lewat melepasi kelonggaran dapat sifar', cd(21600) === 0, cd(21600));
check('bendera lewat dinaikkan',
  scoreAnswer({ isCorrect: true, msTaken: 30000, points: P, timeLimitSec: T, useCountdown: true }).late === true);
check('jawapan salah dapat sifar',
  scoreAnswer({ isCorrect: false, msTaken: 100, points: P, timeLimitSec: T, useCountdown: true }).pointsAwarded === 0);

check('tanpa kira detik: serta-merta dapat penuh', no(0) === P && no(400) === P, [no(0), no(400)]);
check('tanpa kira detik: tidak pernah bawah separuh', no(600000) > 500, no(600000));
check('tanpa kira detik: tidak pernah melebihi penuh', no(600) < P, no(600));
check('tanpa kira detik: 30 saat mengalahkan 90 saat', no(30000) > no(90000), [no(30000), no(90000)]);
check('tanpa kira detik: tiada potongan mati', no(300000) > 0, no(300000));
let mono = true;
for (let ms = 600; ms < 120000; ms += 900) if (no(ms) > no(ms - 900)) mono = false;
check('tanpa kira detik: menurun secara tertib', mono);
check('tanpa kira detik lebih lembut pada 15 saat', no(15000) > cd(15000), [no(15000), cd(15000)]);

console.log('\nJadual mata (mata penuh 1000, had atau rentak 20 saat)');
console.log('saat | kira detik | tanpa kira detik');
for (const s of [0, 1, 2, 5, 10, 15, 20, 30, 60, 120]) {
  console.log(
    String(s).padStart(4) + ' | ' + String(cd(s * 1000)).padStart(10) + ' | ' + String(no(s * 1000)).padStart(16),
  );
}

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
