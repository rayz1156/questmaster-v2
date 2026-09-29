// selftest-admin-ranking.ts
// Ujian tulen untuk fungsi ruang kerja admin V2-011c: ranking individu,
// token jawapan moderasi, penapis kelas/aktiviti/moderasi/audit dan
// pemetaan sasaran audit. Jalankan dengan:
//   npx tsx scripts/selftest-admin-ranking.ts
// Tiada pangkalan data. Setiap semakan mencetak LULUS/GAGAL; kod tamat 1
// jika ada kegagalan.

import {
  kiraRankingIndividu,
  namaRanking,
  tokenJawapan,
  urlSelamat,
  ringkasJawapan,
  NAMA_PENGGUNA_KOSONG,
} from '../src/lib/adminRanking';
import {
  tapisKelas,
  kiraTabKelas,
  statusKelas,
  labelStatusKelas,
  TAB_KELAS,
  type KelasAdmin,
} from '../src/lib/adminClasses';
import { tapisAktiviti, kiraTabAktiviti, type TabAktiviti } from '../src/lib/adminHunts';
import { tapisModerasi, kiraTabModerasi, bukanSeed } from '../src/lib/adminModeration';
import {
  mulaPeriod,
  padanPeriod,
  sasaranAudit,
  jenisSasaran,
  padanCarianSasaran,
  senaraiTindakan,
  ringkasAlasan,
  type BarisAudit,
} from '../src/lib/adminAudit';
import type { Challenge, Submission, Hunt } from '../src/lib/types';

let bilGagal = 0;

// Pembantu: banding nilai sebenar dengan jangkaan (gaya selftest-admin-ui).
function semak(nama: string, benar: unknown, jangka: unknown) {
  const sama = JSON.stringify(benar) === JSON.stringify(jangka);
  if (sama) {
    console.log(`LULUS: ${nama}`);
  } else {
    bilGagal += 1;
    console.log(`GAGAL: ${nama} | jangka ${JSON.stringify(jangka)} | dapat ${JSON.stringify(benar)}`);
  }
}

// =====================================================================
// Bahagian 1: kiraRankingIndividu
// =====================================================================

const ch1: Challenge = { id: 'c1', hunt_id: 'h1', title: 'Q1', prompt: null, answer: null, points: 10, order_idx: 0 };
const ch2: Challenge = { id: 'c2', hunt_id: 'h1', title: 'Q2', prompt: null, answer: null, points: 25, order_idx: 1 };

function sub(
  id: string,
  userId: string,
  challengeId: string,
  status: Submission['status'],
): Submission {
  return {
    id,
    challenge_id: challengeId,
    team_id: null,
    user_id: userId,
    answer: 'jawapan',
    status,
    reviewed_by: null,
    created_at: '2026-09-01T00:00:00Z',
  };
}

const namaById = { u1: 'Ali Abu', u2: null, u3: '' };

// Asas: hanya approved dikira.
semak(
  '1a approved sahaja dikira',
  kiraRankingIndividu([sub('s1', 'u1', 'c1', 'approved'), sub('s2', 'u1', 'c1', 'rejected')], [ch1], namaById).map((r) => [r.user_id, r.skor, r.diluluskan]),
  [['u1', 10, 1]],
);

// rejected dan pending diabaikan sepenuhnya.
semak(
  '1b rejected dan pending diabaikan',
  kiraRankingIndividu(
    [sub('s1', 'u1', 'c2', 'rejected'), sub('s2', 'u1', 'c2', 'pending'), sub('s3', 'u2', 'c2', 'approved')],
    [ch2],
    namaById,
  ).map((r) => [r.user_id, r.skor]),
  [['u2', 25]],
);

// Challenge hilang daripada senarai: submission diabaikan.
semak(
  '1c challenge hilang diabaikan',
  kiraRankingIndividu([sub('s1', 'u1', 'c9', 'approved')], [ch1], namaById),
  [],
);

// Seri skor: bilangan diluluskan menur.
semak(
  '1d seri dipecahkan bilangan diluluskan',
  kiraRankingIndividu(
    [sub('s1', 'u1', 'c1', 'approved'), sub('s2', 'u1', 'c1', 'approved'), sub('s3', 'u2', 'c2', 'approved')],
    [ch1, ch2],
    namaById,
  ).map((r) => [r.user_id, r.skor, r.diluluskan]),
  [
    ['u2', 25, 1],
    ['u1', 20, 2],
  ],
);

// Seri penuh: nama menaik ("Ali Abu" sebelum "Student").
semak(
  '1e seri penuh ikut nama menaik',
  kiraRankingIndividu(
    [sub('s1', 'u1', 'c1', 'approved'), sub('s2', 'u2', 'c1', 'approved')],
    [ch1],
    namaById,
  ).map((r) => [r.user_id, r.nama]),
  [
    ['u1', 'Ali Abu'],
    ['u2', NAMA_PENGGUNA_KOSONG],
  ],
);

// Nama: pengguna tanpa nama menjadi "Student", bukan UUID.
semak('1f null -> Student', namaRanking(namaById, 'u2'), 'Student');
semak('1f kosong -> Student', namaRanking(namaById, 'u3'), 'Student');
semak(
  '1g panggilan tanpa peta nama -> Student',
  kiraRankingIndividu([sub('s1', 'u1', 'c1', 'approved')], [ch1]).map((r) => r.nama),
  ['Student'],
);

// Senarai kosong.
semak('1h senarai kosong -> []', kiraRankingIndividu([], [ch1], namaById), []);

// Mata disatukan merentasi beberapa challenge.
semak(
  '1i jumlah merentasi challenge',
  kiraRankingIndividu([sub('s1', 'u1', 'c1', 'approved'), sub('s2', 'u1', 'c2', 'approved')], [ch1, ch2], namaById).map((r) => r.skor),
  [35],
);

// =====================================================================
// Bahagian 2: tokenJawapan dan urlSelamat
// =====================================================================

semak('2a http diterima', urlSelamat('http://example.com/a'), 'http://example.com/a');
semak('2b https diterima', urlSelamat('https://example.com/a'), 'https://example.com/a');
semak('2c javascript: ditolak', urlSelamat('javascript:alert(1)'), null);
semak('2d data: ditolak', urlSelamat('data:text/html;base64,xxx'), null);
semak('2e bukan URL -> null', urlSelamat('jawapan biasa'), null);
semak('2f kosong -> null', urlSelamat(''), null);

semak(
  '2g teks biasa jadi satu token teks',
  tokenJawapan('jawapan biasa'),
  [{ jenis: 'teks', nilai: 'jawapan biasa' }],
);
semak(
  '2h URL tunggal jadi token url',
  tokenJawapan('https://example.com/hw'),
  [{ jenis: 'url', nilai: 'https://example.com/hw' }],
);
semak(
  '2i teks campur URL dipecah',
  tokenJawapan('Lihat https://example.com/x please'),
  [
    { jenis: 'teks', nilai: 'Lihat ' },
    { jenis: 'url', nilai: 'https://example.com/x' },
    { jenis: 'teks', nilai: ' please' },
  ],
);
semak(
  '2j javascript: dalam teks kekal teks',
  tokenJawapan('klik javascript:alert(1) sekarang').map((t) => t.jenis),
  ['teks'],
);
semak('2k null -> []', tokenJawapan(null), []);
semak(
  '2l baris baharu dikekalkan',
  tokenJawapan('a\nb').map((t) => t.nilai).join(''),
  'a\nb',
);

semak('2m ringkas pendek kekal', ringkasJawapan('pendek', 80), 'pendek');
semak(
  '2n ringkas panjang dipotong',
  ringkasJawapan('kata1 kata2 kata3 kata4 kata5 kata6 kata7 kata8 kata9 kata10 kata11 kata12', 40).endsWith('...'),
  true,
);

// =====================================================================
// Bahagian 3: tapisKelas
// =====================================================================

const kelasUjian: KelasAdmin[] = [
  { id: 'k1', name: 'Alpha', join_code: 'AAA111', color: '#111111', is_archived: false, ended_at: null, created_at: '2026-09-01T00:00:00Z', owner_id: 'p1' },
  { id: 'k2', name: 'Beta', join_code: 'BBB222', color: null, is_archived: false, ended_at: '2026-09-10T00:00:00Z', created_at: '2026-09-02T00:00:00Z', owner_id: 'p1' },
  { id: 'k3', name: 'Charlie', join_code: 'CCC333', color: null, is_archived: true, ended_at: '2026-09-05T00:00:00Z', created_at: '2026-09-03T00:00:00Z', owner_id: 'p2' },
];

semak('3a tab all', tapisKelas(kelasUjian, { tab: 'all' }).length, 3);
semak('3b tab active', tapisKelas(kelasUjian, { tab: 'active' }).map((k) => k.id), ['k1']);
semak('3c tab ended', tapisKelas(kelasUjian, { tab: 'ended' }).map((k) => k.id), ['k2']);
semak('3d tab archived', tapisKelas(kelasUjian, { tab: 'archived' }).map((k) => k.id), ['k3']);
semak('3e diarkib menang ke atas ended', statusKelas(kelasUjian[2]), 'archived');
semak('3f label Active', labelStatusKelas(kelasUjian[0]), 'Active');
semak('3g carian nama', tapisKelas(kelasUjian, { tab: 'all', q: 'alp' }).map((k) => k.id), ['k1']);
semak('3h carian join_code', tapisKelas(kelasUjian, { tab: 'all', q: 'bbb' }).map((k) => k.id), ['k2']);
semak(
  '3i carian tidak jumpa',
  tapisKelas(kelasUjian, { tab: 'all', q: 'zzz' }),
  [],
);
semak('3j penapis educator', tapisKelas(kelasUjian, { tab: 'all', educatorId: 'p2' }).map((k) => k.id), ['k3']);
semak(
  '3k susun nama A-Z',
  tapisKelas(kelasUjian, { tab: 'all', susun: 'name' }).map((k) => k.name),
  ['Alpha', 'Beta', 'Charlie'],
);
semak(
  '3l susun members',
  tapisKelas(kelasUjian, { tab: 'all', susun: 'members', kiraanAhli: { k1: 2, k2: 9, k3: 5 } }).map((k) => k.id),
  ['k2', 'k3', 'k1'],
);
semak(
  '3m susun newest',
  tapisKelas(kelasUjian, { tab: 'all', susun: 'newest' }).map((k) => k.id),
  ['k3', 'k2', 'k1'],
);
const kiraKelas = kiraTabKelas(kelasUjian, { q: '', educatorId: '' });
semak('3n kiraan tab', [kiraKelas.all, kiraKelas.active, kiraKelas.ended, kiraKelas.archived], [3, 1, 1, 1]);
semak('3o jumlah tab kekal 4', TAB_KELAS.length, 4);
semak(
  '3p kiraan hormat carian',
  kiraTabKelas(kelasUjian, { q: 'alpha' }),
  { all: 1, active: 1, ended: 0, archived: 0 },
);

// =====================================================================
// Bahagian 4: tapisAktiviti
// =====================================================================

const huntUjian: Hunt[] = [
  { id: 'h1', owner_id: 'p1', class_id: 'k1', title: 'Scavenger', description: null, status: 'active', invite_code: 'A1B2C3', points: 10, instructions: null, link1: null, link2: null, submission_link: null, submission_link_label: null, submission_link_embed: false, created_at: '2026-09-01T00:00:00Z', start_at: null, end_at: null },
  { id: 'h2', owner_id: 'p1', class_id: 'k2', title: 'Photo walk', description: null, status: 'draft', invite_code: 'D4E5F6', points: 10, instructions: null, link1: null, link2: null, submission_link: null, submission_link_label: null, submission_link_embed: false, created_at: '2026-09-02T00:00:00Z', start_at: null, end_at: null },
  { id: 'h3', owner_id: 'p2', class_id: 'k1', title: 'Quiz night', description: null, status: 'archived', invite_code: 'G7H8I9', points: 10, instructions: null, link1: null, link2: null, submission_link: null, submission_link_label: null, submission_link_embed: false, created_at: '2026-09-03T00:00:00Z', start_at: null, end_at: null },
];

semak('4a tab all', tapisAktiviti(huntUjian, { tab: 'all' }).length, 3);
semak('4b tab active', tapisAktiviti(huntUjian, { tab: 'active' } as { tab: TabAktiviti }).map((h) => h.id), ['h1']);
semak('4c tab draft', tapisAktiviti(huntUjian, { tab: 'draft' }).map((h) => h.id), ['h2']);
semak('4d tab archived', tapisAktiviti(huntUjian, { tab: 'archived' }).map((h) => h.id), ['h3']);
semak('4e carian tajuk', tapisAktiviti(huntUjian, { tab: 'all', q: 'quiz' }).map((h) => h.id), ['h3']);
semak('4f penapis kelas', tapisAktiviti(huntUjian, { tab: 'all', classId: 'k1' }).map((h) => h.id), ['h1', 'h3']);
const kiraAkt = kiraTabAktiviti(huntUjian, { q: '', classId: '' });
semak('4g kiraan tab', [kiraAkt.all, kiraAkt.active, kiraAkt.draft, kiraAkt.archived], [3, 1, 1, 1]);
semak(
  '4h kiraan hormat penapis kelas',
  kiraTabAktiviti(huntUjian, { classId: 'k2' }),
  { all: 1, active: 0, draft: 1, archived: 0 },
);

// =====================================================================
// Bahagian 5: tapisModerasi
// =====================================================================

const subsUjian: Submission[] = [
  sub('m1', 'u1', 'c1', 'pending'),
  sub('m2', 'u1', 'c1', 'approved'),
  sub('m3', 'u2', 'c1', 'rejected'),
  { ...sub('m4', 'u3', 'c1', 'pending'), answer: 'SEED::auto' },
];

semak('5a tab pending tanpa seed', tapisModerasi(subsUjian, 'pending').map((s) => s.id), ['m1']);
semak('5b tab reviewed', tapisModerasi(subsUjian, 'reviewed').map((s) => s.id), ['m2', 'm3']);
semak('5c tab all tanpa seed', tapisModerasi(subsUjian, 'all').map((s) => s.id), ['m1', 'm2', 'm3']);
semak('5d bukanSeed benih', bukanSeed(subsUjian[3]), false);
const kiraMod = kiraTabModerasi(subsUjian);
semak('5e kiraan tab', [kiraMod.pending, kiraMod.reviewed, kiraMod.all], [1, 2, 3]);
semak(
  '5f seed approved pun dikecualikan',
  tapisModerasi([{ ...sub('m5', 'u1', 'c1', 'approved'), answer: 'SEED::x' }], 'all'),
  [],
);

// =====================================================================
// Bahagian 6: penapis dan peta audit
// =====================================================================

const KINI_AUDIT = new Date('2026-09-29T12:00:00Z').getTime();
const isoJamLalu = (jam: number) => new Date(KINI_AUDIT - jam * 3_600_000).toISOString();

semak('6a mulaPeriod 24h', mulaPeriod('24h', KINI_AUDIT), isoJamLalu(24));
semak('6b mulaPeriod all -> null', mulaPeriod('all', KINI_AUDIT), null);
semak('6c mulaPeriod 7d', mulaPeriod('7d', KINI_AUDIT), isoJamLalu(7 * 24));

const barisAudit: BarisAudit[] = [
  { id: 1, actor_id: 'a1', action: 'class_edit', target_type: 'class', target_id: 'k1x8', meta: { reason: 'Betulkan nama kelas yang salah eja' }, created_at: isoJamLalu(1) },
  { id: 2, actor_id: 'a1', action: 'role_change', target_type: 'profile', target_id: 'u1x8', meta: { before: { role: 'participant' }, after: { role: 'educator' }, reason: 'Permintaan pengguna melalui sokongan' }, created_at: isoJamLalu(30) },
  { id: 3, actor_id: 'a2', action: 'challenge_points', target_type: 'challenge', target_id: 'c9z4', meta: { reason: 'Terlalu sukar untuk kelas ini, dikurangkan' }, created_at: isoJamLalu(8 * 24) },
];

semak('6d padanPeriod dalam 24h', barisAudit.map((r) => padanPeriod(r, '24h', KINI_AUDIT)), [true, false, false]);
semak('6e padanPeriod 7d', barisAudit.map((r) => padanPeriod(r, '7d', KINI_AUDIT)), [true, true, false]);
semak('6f padanPeriod all semua benar', barisAudit.map((r) => padanPeriod(r, 'all', KINI_AUDIT)), [true, true, true]);

const petaAudit = {
  profil: { u1x8: 'Ali Abu' },
  kelas: { k1x8: 'Alpha' },
  hunt: {},
  challenge: { c9z4: 'Q1' },
  challengeHunt: { c9z4: 'h1' },
  team: {},
};

const sasaranProfil = sasaranAudit(barisAudit[1], petaAudit);
semak('6g sasaran profil nama', sasaranProfil.nama, 'Ali Abu');
semak('6h sasaran profil href', sasaranProfil.href, '/admin/users/u1x8');
const sasaranKelas = sasaranAudit(barisAudit[0], petaAudit);
semak('6i sasaran kelas nama', sasaranKelas.nama, 'Alpha');
semak('6j sasaran kelas href', sasaranKelas.href, '/admin/classes/k1x8');
const sasaranCh = sasaranAudit(barisAudit[2], petaAudit);
semak('6k sasaran challenge jenis', sasaranCh.jenis, 'Challenge');
semak('6l sasaran challenge href ke hunt', sasaranCh.href, '/admin/hunts/h1');
const barisTiadaPeta: BarisAudit = { id: 4, actor_id: null, action: 'team_edit', target_type: 'team', target_id: 'zzzzzzzzzzzz', meta: {}, created_at: isoJamLalu(2) };
const sasaranTiadaPeta = sasaranAudit(barisTiadaPeta, petaAudit);
semak('6m tanpa nama -> jenis + id 8 aksara', [sasaranTiadaPeta.nama, sasaranTiadaPeta.jenis, sasaranTiadaPeta.idPendek, sasaranTiadaPeta.href], [null, 'Team', 'zzzzzzzz', null]);

semak('6n jenisSasaran null -> Target', jenisSasaran(null), 'Target');
semak('6o jenisSasaran submission', jenisSasaran('submission'), 'Submission');

const namaPelaku = { a1: 'Admin Satu', a2: 'Admin Dua' };
semak('6p carian nama sasaran', padanCarianSasaran(barisAudit[0], 'alpha', petaAudit, namaPelaku), true);
semak('6q carian id penuh', padanCarianSasaran(barisAudit[1], 'u1x8', petaAudit, namaPelaku), true);
semak('6r carian nama pelaku', padanCarianSasaran(barisAudit[2], 'dua', petaAudit, namaPelaku), true);
semak('6s carian tidak jumpa', padanCarianSasaran(barisAudit[0], 'zzzzz', petaAudit, namaPelaku), false);
semak('6t carian kosong padam semua', padanCarianSasaran(barisAudit[0], '', petaAudit, namaPelaku), true);

semak('6u senarai tindakan', senaraiTindakan(barisAudit), ['challenge_points', 'class_edit', 'role_change']);
semak('6v ringkas alasan pendek', ringkasAlasan({ reason: 'sebab ringkas' }), 'sebab ringkas');
semak('6w ringkas alasan tiada', ringkasAlasan({}), '-');

// =====================================================================
if (bilGagal > 0) {
  console.log(`${bilGagal} semakan GAGAL.`);
  process.exit(1);
}
console.log('Semua semakan LULUS.');
