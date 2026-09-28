/**
 * Ujian sendiri untuk logik pelan yang tidak menyentuh pangkalan data
 * (tiket V2-002b): HAD_PELAN mesti selari dengan qm_plan_limits dalam
 * migrasi 0040, dan mesejHad mesti mengenali setiap kod had baharu.
 *
 * Jalankan:  npx tsx scripts/selftest-pelan.ts
 *
 * Kenapa fail ini wujud: npx tsc dan npm run build tidak menyemak keselarian
 * angka. Jika HAD_PELAN terpesong daripada qm_plan_limits, meter dan mesej
 * memaparkan had yang salah tanpa sebarang ralat binaan.
 */
import { HAD_PELAN, HARGA_PELAN, mesejHad, kodHad, tanpaHad, type Pelan } from '../src/lib/pelan';

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

/* ===== Bahagian 1: HAD_PELAN selari dengan qm_plan_limits (0040, baris 87-89) =====
 *
 * Nilai yang disalin daripada migrasi 0040_pelan_v2.sql:
 *   pro:         classes 30, live_players 300, activities null, boards null,
 *                file_mb 20, storage_mb 1024, peer_review true
 *   institution: classes 30, live_players 300, activities null, boards null,
 *                file_mb 20, storage_mb 10240, peer_review true
 *   free (lalai):classes 3, members_per_class 150, live_players 60,
 *                activities 30, boards 5, file_mb 10, storage_mb 100,
 *                peer_review false
 */
const SQL: Record<Pelan, { classes: number; membersPerClass: number | null; livePlayers: number; activities: number | null; boards: number | null; fileMb: number; storageMb: number; peerReview: boolean }> = {
  pro:         { classes: 30, membersPerClass: null, livePlayers: 300, activities: null, boards: null, fileMb: 20, storageMb: 1024,  peerReview: true },
  institution: { classes: 30, membersPerClass: null, livePlayers: 300, activities: null, boards: null, fileMb: 20, storageMb: 10240, peerReview: true },
  free:        { classes: 3,  membersPerClass: 150,  livePlayers: 60,  activities: 30,   boards: 5,   fileMb: 10, storageMb: 100,   peerReview: false },
};

for (const p of ['free', 'pro', 'institution'] as Pelan[]) {
  const h = HAD_PELAN[p];
  const s = SQL[p];
  check(`${p}: kelas`, h.kelas === s.classes, [h.kelas, s.classes]);
  check(`${p}: pemain sesi`, h.pemainSesi === s.livePlayers, [h.pemainSesi, s.livePlayers]);
  check(`${p}: aktiviti`, h.aktiviti === s.activities, [h.aktiviti, s.activities]);
  check(`${p}: papan`, h.papan === s.boards, [h.papan, s.boards]);
  check(`${p}: had satu fail (MB)`, h.fileMb === s.fileMb, [h.fileMb, s.fileMb]);
  check(`${p}: kuota storan (MB)`, h.storageMb === s.storageMb, [h.storageMb, s.storageMb]);
  check(`${p}: penilaian rakan`, h.penilaianRakan === s.peerReview, [h.penilaianRakan, s.peerReview]);
}

check('free: peserta setiap kelas 150', HAD_PELAN.free.ahliSeKelas === 150, HAD_PELAN.free.ahliSeKelas);
check('pro: peserta setiap kelas tanpa had', HAD_PELAN.pro.ahliSeKelas === null, HAD_PELAN.pro.ahliSeKelas);

/* ===== Bahagian 2: HARGA_PELAN (tiket baris 29) ===== */
check('harga pro bulanan 29', HARGA_PELAN.pro.bulanan === 29, HARGA_PELAN.pro);
check('harga pro tahunanSebulan 19', HARGA_PELAN.pro.tahunanSebulan === 19, HARGA_PELAN.pro);
check('harga pro tahunan 228', HARGA_PELAN.pro.tahunan === 228, HARGA_PELAN.pro);
check('harga institution tahunan 1500', HARGA_PELAN.institution.tahunan === 1500, HARGA_PELAN.institution);
check('harga institution 10 kerusi', HARGA_PELAN.institution.kerusi === 10, HARGA_PELAN.institution);

/* ===== Bahagian 3: mesejHad untuk setiap kod baharu ===== */
const ralat = (kod: string, msg = 'pesan') => new Error(`${kod}: ${msg}`);

const kodBaru = [
  'QM_LIMIT_ACTIVITIES',
  'QM_LIMIT_BOARDS',
  'QM_LIMIT_MEMBERS',
  'QM_LIMIT_STORAGE',
  'QM_LIMIT_FILE_SIZE',
  'QM_VIDEO_BLOCKED',
  'QM_PLAN_PRO',
];
for (const k of kodBaru) {
  check(`mesej wujud untuk ${k}`, mesejHad(ralat(k)).length > 0 && mesejHad(ralat(k)) !== 'pesan');
  check(`kod dikenali untuk ${k}`, kodHad(ralat(k)) === k);
}

/* ===== Bahagian 4: mesej tidak lagi menyebut "quizzes only" ===== */
const semuaMesej = kodBaru.concat(['QM_PLAN_FREE', 'QM_LIMIT_CLASSES', 'QM_LIMIT_QUIZZES'])
  .map((k) => mesejHad(ralat(k))).join(' ');
check('tiada mesej menyebut "quizzes only"', !semuaMesej.includes('quizzes only'), semuaMesej);

// Mesej lama yang dikemas kini mesti menyebut quest atau aktiviti, bukan
// "fungsi kuiz sahaja".
check('QM_PLAN_FREE dikemas kini', !mesejHad(ralat('QM_PLAN_FREE')).includes('quizzes only'));

/* ===== Bahagian 5: angka dalam mesej dibaca daripada HAD_PELAN ===== */
// Ujian tidak boleh membaca tali tempat letak secara langsung kerana mesej
// dibina semasa modul dimuatkan. Ini mengesahkan sumber angka melalui
// kesan sampingan: had kelas free dalam mesej mesti 3 (nilai HAD_PELAN).
check('angka had kelas free dalam mesej ialah 3',
  mesejHad(ralat('QM_LIMIT_CLASSES')).includes('3 classes'),
  mesejHad(ralat('QM_LIMIT_CLASSES')));

/* ===== Bahagian 6: tanpaHad ===== */
check('tanpaHad(null) benar', tanpaHad(null) === true);
check('tanpaHad(1000000) benar', tanpaHad(1000000) === true);
check('tanpaHad(30) salah', tanpaHad(30) === false);
check('tanpaHad(1024) salah (storage pro kecil)', tanpaHad(1024) === false);

/* ===== Bahagian 7: kod asal masih dikenali ===== */
for (const k of ['QM_LIMIT_CLASSES', 'QM_LIMIT_QUIZZES', 'QM_LIMIT_PLAYERS', 'QM_FORBIDDEN', 'QM_BAD_PLAN', 'QM_LEADER_CONFLICT', 'QM_NOT_FOUND', 'QM_PEER_MAX_ROUNDS', 'QM_PEER_CLOSED', 'QM_PEER_NOT_MEMBER', 'QM_PEER_SELF', 'QM_PEER_JUSTIFY']) {
  check(`kod lama kekal: ${k}`, kodHad(ralat(k)) === k);
}
check('kod asing pulangkan null', kodHad(ralat('QM_LANGKAH_ASING')) === null);
check('ralat tanpa kod guna mesej mentah', mesejHad(new Error('rahsia')) === 'rahsia');
check('lalai digunakan bila mesej kosong', mesejHad(new Error(''), 'salah') === 'salah');

console.log('\nPASS=' + pass + ' FAIL=' + fail);
process.exit(fail === 0 ? 0 : 1);
