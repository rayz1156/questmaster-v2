/**
 * Ujian sendiri untuk fungsi tulen UI Insights (tiket V2-014b).
 *
 * Jalankan:  npx tsx scripts/selftest-insights-ui.ts
 *
 * `npx tsc` tidak menyemak logik runtime; susunan perhatian, pengiraan most
 * improved dan geometri sparkline diuji di sini dengan data bercampur
 * (bendera berulang, markah seri, pct NULL, trend satu titik).
 */
import type { PelajarInsights, TrendTitik } from '../src/lib/insightsKelas';
import {
  deltaTrend,
  kiraMostImproved,
  laluanSparkline,
  susunPerhatian,
} from '../src/lib/insightsUi';

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

/** Pelajar ujian dengan medan ringkas; markah penuh tidak relevan di sini. */
function pelajar(
  id: string,
  name: string,
  total: number,
  flags: string[],
  trend: TrendTitik[],
): PelajarInsights {
  return {
    user_id: id,
    name,
    task_score: 0,
    live_score: total,
    adjustment_score: 0,
    total_score: total,
    rank: 1,
    live_sessions: trend.length,
    answered: 0,
    correct: 0,
    accuracy_pct: null,
    avg_ms: null,
    approved: 0,
    pending: 0,
    rejected: 0,
    last_active: null,
    team_id: null,
    team_name: null,
    trend,
    flags,
  };
}

function titik(sid: string, pct: number | null): TrendTitik {
  return {
    session_id: sid,
    played_at: '2026-09-0' + sid + 'T04:00:00Z',
    score: 0,
    pct,
    quiz_title: 'Kuiz ' + sid,
    session_ended_at: null,
  };
}

/* ===== susunPerhatian ===== */

const senarai: PelajarInsights[] = [
  pelajar('u1', 'Ali', 500, ['improving'], []),
  pelajar('u2', 'Burn', 0, ['bottom_20', 'declining', 'inactive_7d'], []),
  pelajar('u3', 'Cik', 10, ['bottom_20', 'pending_old'], []),
  pelajar('u4', 'Dah', 900, [], []),
  pelajar('u5', 'Esa', 20, ['never_live'], []),
  pelajar('u6', 'Fah', 10, ['pending_old'], []),
];

const perhatian = susunPerhatian(senarai);

// 1. Hanya pelajar dengan bendera selain improving disenaraikan.
check(
  'susunPerhatian menapis improving dan tiada bendera',
  perhatian.map((s) => s.user_id).join(',') === 'u2,u3,u6,u5',
  perhatian.map((s) => s.user_id),
);

// 2. Bilangan bendera dahulu (menurun), kemudian total menaik.
check(
  'susunPerhatian bendera menurun total menaik',
  perhatian[0].user_id === 'u2' && perhatian[1].user_id === 'u3',
  perhatian.map((s) => s.user_id),
);

// 3. Seri total diputus dengan nama (Cik sebelum Fah).
const [cik, fah] = [perhatian[1], perhatian[3]];
check(
  'susunPerhatian pemutus seri nama',
  cik.user_id === 'u3' && fah.user_id === 'u5' && perhatian[2].user_id === 'u6',
  perhatian.map((s) => s.user_id),
);

// 4. Input tidak diubah (susunan salinan).
check(
  'susunPerhatian tidak mutasi input',
  senarai[0].user_id === 'u1' && senarai[3].user_id === 'u4',
  senarai.map((s) => s.user_id),
);

// 5. Senarai kosong.
check('susunPerhatian kosong', susunPerhatian([]).length === 0);

/* ===== deltaTrend dan kiraMostImproved ===== */

// 6. Dua titik: delta = hujung - awal.
check(
  'deltaTrend dua titik',
  deltaTrend([titik('1', 40), titik('2', 80)]) === 40,
);

// 7. Empat titik dibahagi separuh sama rata.
check(
  'deltaTrend empat titik separuh',
  Math.abs(deltaTrend([titik('1', 20), titik('2', 40), titik('3', 60), titik('4', 80)])! - 40) < 1e-9,
);

// 8. Titik pct NULL dilangkau, bukan dikira sifar.
check(
  'deltaTrend langkau pct NULL',
  Math.abs(deltaTrend([titik('1', null), titik('2', 30), titik('3', null), titik('4', 90)])! - 60) < 1e-9,
);

// 9. Satu titik sahaja: tidak layak.
check('deltaTrend satu titik null', deltaTrend([titik('1', 50)]) === null);

// 10. Dua titik tapi satu pct NULL: tiada perbandingan.
check(
  'deltaTrend dua titik satu null',
  deltaTrend([titik('1', null), titik('2', 50)]) === null,
);

const naik: PelajarInsights[] = [
  pelajar('a1', 'Naik Sedikit', 100, [], [titik('1', 40), titik('2', 60)]),
  pelajar('a2', 'Naik Banyak', 100, [], [titik('1', 10), titik('2', 90)]),
  pelajar('a3', 'Turun', 100, [], [titik('1', 80), titik('2', 20)]),
  pelajar('a4', 'Sesi Satu', 100, [], [titik('1', 50)]),
];

const improved = kiraMostImproved(naik);

// 11. Turun dan satu sesi tidak disenaraikan; susunan delta menurun.
check(
  'kiraMostImproved susunan dan penapis',
  improved.map((b) => b.pelajar.name).join(',') === 'Naik Banyak,Naik Sedikit' &&
    improved[0].delta === 80 && improved[1].delta === 20,
  improved.map((b) => [b.pelajar.name, b.delta]),
);

// 12. Had 5 teratas dihormati.
const ramai = Array.from({ length: 9 }, (_, i) =>
  pelajar('x' + i, 'X' + i, 100, [], [titik('1', 0), titik('2', 10 + i)]),
);
check('kiraMostImproved had 5', kiraMostImproved(ramai).length === 5);

/* ===== laluanSparkline ===== */

// 13. Kurang daripada 2 nilai: null.
check(
  'laluanSparkline kosong dan tunggal null',
  laluanSparkline([]) === null && laluanSparkline([50]) === null &&
    laluanSparkline([null, 30]) === null,
);

// 14. Dua nilai: garis mendatar bila nilai serupa.
check(
  'laluanSparkline seri mendatar',
  laluanSparkline([5, 5], 100, 30, 2) === '2.0,15.0 98.0,15.0',
  laluanSparkline([5, 5], 100, 30, 2),
);

// 15. Nilai naik: y berkurang (SVG y turun ke bawah).
const jalan = laluanSparkline([0, 10, 20], 96, 28, 2);
const ys = jalan!.split(' ').map((p) => Number(p.split(',')[1]));
check(
  'laluanSparkline naik y turun',
  ys.length === 3 && ys[0] === 26 && ys[2] === 2 && ys[1] === 14,
  { jalan, ys },
);

// 16. NULL dilangkau dan diskala semula.
check(
  'laluanSparkline langkau null',
  laluanSparkline([null, 0, null, 100], 96, 28, 2) ===
    '2.0,26.0 94.0,2.0',
  laluanSparkline([null, 0, null, 100], 96, 28, 2),
);

console.log('');
console.log(`${pass} pass, ${fail} fail`);
if (fail > 0) process.exit(1);