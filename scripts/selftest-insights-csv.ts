/**
 * Ujian sendiri untuk binaan CSV eksport Insights (tiket V2-014a).
 *
 * Jalankan:  npx tsx scripts/selftest-insights-csv.ts
 *
 * Seperti selftest-csv-peserta: `npx tsc` dan `npm run build` tidak menyemak
 * logik format, jadi suntikan formula, koma dan petikan dalam nama, lajur
 * trend dinamik serta bahagian kosong diuji di sini dengan data bercampur.
 */
import {
  binaCsvInsights,
  jamKl,
  masaKl,
  namaFailInsights,
  separaBahagian,
} from '../src/lib/insightsCsv';
import type { InsightsKelas } from '../src/lib/insightsKelas';

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

/* ===== Data ujian ===== */

const data: InsightsKelas = {
  class_id: '00000000-0000-0000-0000-0000000000ca',
  pulse: {
    members: 3,
    avg_total: 757.0,
    median_total: 0,
    live_participation_pct: 66.7,
    accuracy_pct: 50.0,
    pending_reviews: 1,
    live_sessions: 2,
  },
  students: [
    {
      user_id: 'u1',
      name: 'Ali, "Best" Ahmad',
      task_score: 20,
      live_score: 2300,
      adjustment_score: -50,
      total_score: 2270,
      rank: 1,
      live_sessions: 2,
      answered: 4,
      correct: 2,
      accuracy_pct: 50.0,
      avg_ms: 3000,
      approved: 2,
      pending: 0,
      rejected: 0,
      last_active: '2026-09-28T20:30:00Z',
      team_id: 't1',
      team_name: 'Pasukan Alpha',
      trend: [
        {
          session_id: 's1',
          played_at: '2026-09-27T04:00:00Z',
          score: 1500,
          pct: 75.0,
          quiz_title: 'Kuiz Satu',
          session_ended_at: '2026-09-27T05:00:00Z',
        },
        {
          session_id: 's2',
          played_at: '2026-09-28T10:00:00Z',
          score: 800,
          pct: 40.0,
          quiz_title: 'Kuiz Satu',
          session_ended_at: '2026-09-28T11:00:00Z',
        },
      ],
      flags: [],
    },
    {
      user_id: 'u2',
      name: '=cmd|/C calc',
      task_score: 0,
      live_score: 0,
      adjustment_score: 0,
      total_score: 0,
      rank: 2,
      live_sessions: 1,
      answered: 0,
      correct: 0,
      accuracy_pct: null,
      avg_ms: null,
      approved: 0,
      pending: 1,
      rejected: 0,
      last_active: null,
      team_id: null,
      team_name: null,
      trend: [
        {
          session_id: 's1',
          played_at: '2026-09-27T04:30:00Z',
          score: 500,
          pct: 25.0,
          quiz_title: 'Kuiz Satu',
          session_ended_at: '2026-09-27T05:00:00Z',
        },
      ],
      flags: ['bottom_20', 'pending_old'],
    },
    {
      user_id: 'u3',
      name: 'Siti Aminah',
      task_score: 0,
      live_score: 0,
      adjustment_score: 0,
      total_score: 0,
      rank: 3,
      live_sessions: 0,
      answered: 0,
      correct: 0,
      accuracy_pct: null,
      avg_ms: null,
      approved: 0,
      pending: 0,
      rejected: 0,
      last_active: '2026-09-20T16:00:00Z',
      team_id: null,
      team_name: null,
      trend: [],
      flags: ['never_live'],
    },
  ],
  distribution: { total: [], task: [], live: [] },
  hard_questions: [
    {
      question_id: 'q2',
      quiz_title: 'Kuiz Satu',
      prompt: 'Dua darab tiga?',
      answered: 3,
      correct_pct: 33.3,
      avg_ms: 4333.3,
      top_wrong_choice: { key: 'A', label: 'Lima', count: 2 },
      correct_label: 'Beta',
    },
  ],
  hard_challenges: [
    {
      challenge_id: 'c2',
      title: 'Cabaran Dua',
      hunt_title: 'Hunt Ujian',
      submitted: 2,
      approved: 1,
      rejected: 1,
      rejected_pct: 50.0,
      pending: 0,
    },
  ],
  teams: [],
  generated_at: '2026-09-30T00:00:00Z',
};

/* ===== Bahagian 1: separaBahagian ===== */

check('separa: satu bahagian', JSON.stringify(separaBahagian('students')) === '["students"]');
check('separa: all mengembangkan kepada enam',
  separaBahagian('all').length === 6 && separaBahagian('all')[0] === 'students');
check('separa: bahagian tidak sah dibuang, yang sah kekal',
  JSON.stringify(separaBahagian('students,bogus')) === '["students"]');
check('separa: semua tidak sah ditolak kosong', separaBahagian('bogus').length === 0);
check('separa: ruang, huruf besar dan duplikat',
  JSON.stringify(separaBahagian(' Students , TEAMS ,teams')) === '["students","teams"]',
  separaBahagian(' Students , TEAMS ,teams'));
check('separa: null kosong', separaBahagian(null).length === 0);

/* ===== Bahagian 2: students ===== */

const csvStudents = binaCsvInsights(data, ['students']);
check('students: BOM di awal', csvStudents.charCodeAt(0) === 0xfeff);
const barisStudents = csvStudents.slice(1).split('\r\n').filter((b) => b.length > 0);
check('students: baris tajuk 17 lajur tanpa # dan tanpa emel',
  barisStudents[0] ===
    'Rank,Name,Team,Activities,Live Quiz,Adjustments,Total,Live sessions,Answered,Correct,Accuracy %,Avg time (s),Approved,Pending,Rejected,Last active,Flags'
    && !barisStudents[0].includes('Email')
    && !csvStudents.slice(1).startsWith('#'),
  barisStudents[0]);

// Ali: koma dan petikan dalam nama dipetik RFC 4180, pelarasan -50 kekal
// mentah, purata 3000 ms menjadi 3.0 s, tarikh KL (UTC 20:30 = 04:30 esok).
check('students: nama berpetik, pelarasan negatif, saat dan tarikh KL',
  barisStudents[1].startsWith('1,"Ali, ""Best"" Ahmad",Pasukan Alpha,20,2300,-50,2270,2,4,2,50.0,3.0,2,0,0,2026-09-29T04:30:00,'),
  barisStudents[1]);

// Suntikan formula: nama bermula = diawali petikan tunggal.
check('students: suntikan formula dilindungi',
  barisStudents[2].startsWith("2,'=cmd|/C calc"),
  barisStudents[2]);

// Siti: tiada jawapan, medan kosong bukan sifar untuk accuracy dan masa.
check('students: nilai NULL kosong, bendera berlabel Inggeris',
  barisStudents[3].endsWith(
    'Siti Aminah,,0,0,0,0,0,0,0,,,0,0,0,2026-09-21T00:00:00,Never joined a Live Quiz'),
  barisStudents[3]);

/* ===== Bahagian 3: attention ===== */

const csvAttention = binaCsvInsights(data, ['attention']);
const barisAttention = csvAttention.slice(1).split('\r\n').filter((b) => b.length > 0);
check('attention: tajuk empat lajur dan hanya pelajar berbendera',
  barisAttention[0] === 'Name,Flags,Total,Last active' && barisAttention.length === 3,
  barisAttention);
check('attention: bendera dipisah titik berkoma ruang',
  barisAttention[1] === "'=cmd|/C calc,Bottom 20%; Submission waiting 3+ days,0,",
  barisAttention[1]);

/* ===== Bahagian 4: questions dan challenges ===== */

const csvQuestions = binaCsvInsights(data, ['questions']);
const barisQuestions = csvQuestions.slice(1).split('\r\n').filter((b) => b.length > 0);
check('questions: jawapan salah paling kerap dengan label dan kunci',
  barisQuestions[1] === 'Kuiz Satu,Dua darab tiga?,3,33.3,4.3,Lima (A),2',
  barisQuestions[1]);

const csvChallenges = binaCsvInsights(data, ['challenges']);
const barisChallenges = csvChallenges.slice(1).split('\r\n').filter((b) => b.length > 0);
check('challenges: peratus ditolak 1 titik perpuluhan',
  barisChallenges[1] === 'Hunt Ujian,Cabaran Dua,2,1,1,50.0,0',
  barisChallenges[1]);

/* ===== Bahagian 5: bahagian kosong ===== */

const csvTeams = binaCsvInsights(data, ['teams']);
check('teams: kelas tanpa pasukan hanya baris tajuk',
  csvTeams === '\uFEFFTeam,Members,Total,Avg per member,Top member share %,Members with 0,Unbalanced\r\n',
  JSON.stringify(csvTeams));

/* ===== Bahagian 6: trend dengan lajur dinamik ===== */

const csvTrend = binaCsvInsights(data, ['trend']);
const barisTrend = csvTrend.slice(1).split('\r\n').filter((b) => b.length > 0);
// Lajur mengikut masa sesi (KL): s1 13:00, s2 19:00.
check('trend: lajur dinamik ikut masa sesi KL',
  barisTrend[0] === 'Name,Kuiz Satu 2026-09-27 13:00,Kuiz Satu 2026-09-28 19:00',
  barisTrend[0]);
check('trend: pelajar lengkap dua pct',
  barisTrend[1] === '"Ali, ""Best"" Ahmad",75.0,40.0',
  barisTrend[1]);
check('trend: sesi yang tidak disertai kosong',
  barisTrend[2] === "'=cmd|/C calc,25.0," && barisTrend[3] === 'Siti Aminah,,',
  [barisTrend[2], barisTrend[3]]);

/* ===== Bahagian 7: banyak bahagian dalam satu fail ===== */

const csvSemua = binaCsvInsights(data, ['students', 'teams']);
check('banyak: baris # Students diikuti baris kosong sebelum # Teams',
  csvSemua.slice(1).startsWith('# Students\r\n')
    && csvSemua.slice(1).includes('\r\n\r\n# Teams\r\nTeam,Members,'),
  csvSemua.slice(1, 120));
const csvAll = binaCsvInsights(data, separaBahagian('all'));
check('all: keenam-enam tajuk bahagian ada',
  ['# Students', '# Attention', '# Questions', '# Challenges', '# Teams', '# Trend']
    .every((t) => csvAll.includes(t + '\r\n')),
  csvAll.length);

/* ===== Bahagian 8: nama fail ===== */

check('nama fail: satu bahagian',
  namaFailInsights('Kelas A Ujian', ['students'], '20260930')
    === 'kuizen-insights-kelas-a-ujian-students-20260930.csv',
  namaFailInsights('Kelas A Ujian', ['students'], '20260930'));
check('nama fail: banyak bahagian jatuh kepada all',
  namaFailInsights('Kelas A Ujian', ['students', 'teams'], '20260930')
    === 'kuizen-insights-kelas-a-ujian-all-20260930.csv');
check('nama fail: nama kelas berisiko ditapis',
  !/[\r\n\";]/.test(namaFailInsights('Kelas "X"\r\n', ['teams'], '20260930')));

/* ===== Bahagian 9: tarikh KL ===== */

check('masaKl: UTC 20:30 jadi esok 04:30 KL',
  masaKl('2026-09-28T20:30:00Z') === '2026-09-29T04:30:00',
  masaKl('2026-09-28T20:30:00Z'));
check('jamKl: tengah hari sama hari', jamKl('2026-09-27T05:00:00Z') === '2026-09-27 13:00');
check('masaKl: null kosong', masaKl(null) === '' && jamKl('bukan tarikh') === '');

/* ===== Ringkasan ===== */

console.log('');
console.log(`${pass} lulus, ${fail} gagal`);
if (fail > 0) process.exit(1);
