// selftest-admin-ui.ts
// Ujian tulen untuk fungsi UI ruang kerja admin (V2-011b): relTime,
// initials, penapis dan kiraan tab pengguna. Jalankan dengan:
//   npx tsx scripts/selftest-admin-ui.ts
// Tiada pangkalan data. Setiap semakan mencetak LULUS/GAGAL; kod tamat 1
// jika ada kegagalan.

import { relTime, initials } from '../src/components/admin/ui';
import {
  tapisPengguna,
  kiraTab,
  padanCarian,
  pelanTamatDalam,
  emelBelumSah,
  pendingPendidik,
  HARI_TAMAT_PELAN,
  TAB_PENGGUNA,
  type TabPengguna,
  type StatusPengguna,
} from '../src/lib/adminUsers';
import type { Profile } from '../src/lib/types';
import type { UserMeta } from '../src/lib/data';

let bilGagal = 0;

// Pembantu: banding nilai sebenar dengan jangkaan (gaya selftest-admin-audit).
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
// Bahagian 1: relTime dengan masa rujukan disuntik
// =====================================================================

// Rujukan tetap: tengah hari UTC, selamat untuk semua zon waktu mesin.
const KINI = new Date('2026-09-29T12:00:00Z').getTime();
const isoLalu = (jam: number) => new Date(KINI - jam * 3_600_000).toISOString();

semak('1a null -> Never', relTime(null, KINI), 'Never');
semak('1b tarikh rosak -> Never', relTime('bukan-tarikh', KINI), 'Never');
semak('1c 30 saat -> just now', relTime(new Date(KINI - 30_000).toISOString(), KINI), 'just now');
semak('1d 59 saat -> just now', relTime(new Date(KINI - 59_000).toISOString(), KINI), 'just now');
semak('1e 1 minit -> 1 min ago', relTime(new Date(KINI - 60_000).toISOString(), KINI), '1 min ago');
semak('1f 5 minit -> 5 min ago', relTime(new Date(KINI - 5 * 60_000).toISOString(), KINI), '5 min ago');
semak('1g 59 minit -> 59 min ago', relTime(new Date(KINI - 59 * 60_000).toISOString(), KINI), '59 min ago');
semak('1h 1 jam -> 1 h ago', relTime(new Date(KINI - 3_600_000).toISOString(), KINI), '1 h ago');
semak('1i 3 jam -> 3 h ago', relTime(isoLalu(3), KINI), '3 h ago');
semak('1j 23 jam -> 23 h ago', relTime(isoLalu(23), KINI), '23 h ago');
semak('1k 24 jam -> 1 d ago', relTime(isoLalu(24), KINI), '1 d ago');
semak('1l 2 hari -> 2 d ago', relTime(isoLalu(48), KINI), '2 d ago');
semak('1m 6 hari -> 6 d ago', relTime(isoLalu(6 * 24), KINI), '6 d ago');
semak('1n 7 hari -> tarikh', relTime(isoLalu(7 * 24), KINI), 'Sep 22, 2026');
semak('1o 30 hari -> tarikh', relTime(isoLalu(30 * 24), KINI), 'Aug 30, 2026');
semak('1p masa sama -> just now', relTime(new Date(KINI).toISOString(), KINI), 'just now');
semak('1q tanpa rujukan guna Date.now (tidak melontar)', typeof relTime(new Date().toISOString()), 'string');

// =====================================================================
// Bahagian 2: initials
// =====================================================================

semak('2a null -> ?', initials(null), '?');
semak('2b kosong -> ?', initials(''), '?');
semak('2c satu perkataan Hariz -> HA', initials('Hariz'), 'HA');
semak('2d dua perkataan -> HA', initials('Hariz Amran'), 'HA');
semak('2e tiga perkataan -> AI', initials('Ahmad bin Ismail'), 'AI');
semak('2f gelaran Dr. dibuang -> LW', initials('Dr. Lim Wei'), 'LW');
semak('2g gelaran Prof dibuang -> HA', initials('Prof Hariz'), 'HA');
semak('2h Mr dibuang -> SJ', initials('Mr Smith John'), 'SJ');

// =====================================================================
// Bahagian 3: tapisPengguna
// =====================================================================

// Profil ujian: hanya medan yang diberi tindakan berbeza.
function pengguna(id: string, tindakan: Partial<Profile>): Profile {
  return {
    id,
    role: 'participant',
    display_name: null,
    suspended: false,
    approved: true,
    logo_url: null,
    bio: null,
    avatar_url: null,
    bio_updated_at: null,
    intro_display_name: null,
    intro_media_type: null,
    intro_image_file_code: null,
    intro_video_adilo_file_id: null,
    intro_video_adilo_project_id: null,
    intro_video_thumbnail_url: null,
    intro_video_duration_seconds: null,
    intro_media_updated_at: null,
    username: null,
    is_active: true,
    username_updated_at: null,
    created_at: '2026-09-01T00:00:00Z',
    max_classes_owned: null,
    max_classes_as_coeducator: null,
    ...tindakan,
  };
}

const HARI = 86_400_000;
const senarai: Profile[] = [
  pengguna('u1', { role: 'participant', display_name: 'Ali Baba', username: 'ali' }),
  pengguna('u2', {
    role: 'educator',
    approved: false,
    display_name: 'Cikgu Tan',
    username: 'tan',
    plan_expires_at: new Date(KINI + 5 * HARI).toISOString(),
  }),
  pengguna('u3', { role: 'admin', display_name: 'Dr Admin', username: 'admin' }),
  pengguna('u4', { role: 'superadmin', display_name: 'Owner Kuizen', username: 'owner' }),
  pengguna('u5', { role: 'participant', display_name: 'Siti Nur', username: 'siti', suspended: true }),
  pengguna('u6', {
    role: 'educator',
    display_name: 'Cikgu Zulkifli',
    username: 'zul',
    plan_expires_at: new Date(KINI + 20 * HARI).toISOString(),
  }),
  pengguna('u7', {
    role: 'educator',
    display_name: 'Cikgu Tamat',
    username: 'tamat',
    plan_expires_at: new Date(KINI - 1 * HARI).toISOString(),
  }),
];

const meta: Record<string, UserMeta> = {
  u1: { id: 'u1', email: 'ali@x.com', created_at: '2026-09-01T00:00:00Z', last_sign_in_at: '2026-09-28T00:00:00Z', email_confirmed_at: '2026-09-01T01:00:00Z' },
  u2: { id: 'u2', email: 'tan@x.com', created_at: '2026-09-02T00:00:00Z', last_sign_in_at: null },
  u3: { id: 'u3', email: 'admin@x.com', created_at: '2026-09-03T00:00:00Z', last_sign_in_at: '2026-09-28T00:00:00Z', email_confirmed_at: '2026-09-03T01:00:00Z' },
  u4: { id: 'u4', email: 'owner@x.com', created_at: '2026-09-04T00:00:00Z', last_sign_in_at: '2026-09-27T00:00:00Z', email_confirmed_at: '2026-09-04T01:00:00Z' },
  u5: { id: 'u5', email: 'siti@x.com', created_at: '2026-09-05T00:00:00Z', last_sign_in_at: null, email_confirmed_at: '2026-09-05T01:00:00Z' },
  u6: { id: 'u6', email: 'zul@x.com', created_at: '2026-09-06T00:00:00Z', last_sign_in_at: null, email_confirmed_at: '2026-09-06T01:00:00Z' },
  u7: { id: 'u7', email: 'tamat@x.com', created_at: '2026-09-07T00:00:00Z', last_sign_in_at: null, email_confirmed_at: '2026-09-07T01:00:00Z' },
};

const ids = (baris: Profile[]) => baris.map((u) => u.id);
const tapis = (tab: TabPengguna, q = '', status: StatusPengguna = 'all') =>
  ids(tapisPengguna(senarai, meta, { tab, q, status, now: KINI }));

semak('3a tab all mengambil semua turutan asal', tapis('all'), ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
semak('3b tab educators', tapis('educators'), ['u2', 'u6', 'u7']);
semak('3c tab participants', tapis('participants'), ['u1', 'u5']);
semak('3d tab admins merangkumi superadmin', tapis('admins'), ['u3', 'u4']);
semak('3e tab pending approval', tapis('pending'), ['u2']);
semak('3f tab suspended', tapis('suspended'), ['u5']);
semak('3g carian nama', tapis('all', 'cikgu'), ['u2', 'u6', 'u7']);
semak('3h carian nama penuh', tapis('all', 'cikgu tan'), ['u2']);
semak('3i carian username', tapis('all', 'ali'), ['u1']);
semak('3j carian emel', tapis('all', 'owner@x'), ['u4']);
semak('3k carian case-insensitive', tapis('all', 'CIKGU TAN'), ['u2']);
semak('3l carian tiada padanan', tapis('all', 'zzz'), []);
semak('3m status verified', tapis('all', '', 'verified'), ['u1', 'u3', 'u4', 'u5', 'u6', 'u7']);
semak('3n status unverified', tapis('all', '', 'unverified'), ['u2']);
semak('3o status expiring (5 hari sahaja)', tapis('all', '', 'expiring'), ['u2']);
semak('3p tab educators + status expiring', tapis('educators', '', 'expiring'), ['u2']);
semak('3q tab participants + carian', tapis('participants', 'sit'), ['u5']);
semak('3r tab admins + carian nama', tapis('admins', 'owner'), ['u4']);

// =====================================================================
// Bahagian 4: kiraTab
// =====================================================================

const kira = (q = '', status: StatusPengguna = 'all') =>
  kiraTab(senarai, meta, { q, status, now: KINI });

semak(
  '4a kiraan lalai',
  kira(),
  { all: 7, educators: 3, participants: 2, admins: 2, pending: 1, suspended: 1 },
);
semak(
  '4b kiraan dalam carian cikgu',
  kira('cikgu'),
  { all: 3, educators: 3, participants: 0, admins: 0, pending: 1, suspended: 0 },
);
semak(
  '4c kiraan dalam status unverified',
  kira('', 'unverified'),
  { all: 1, educators: 1, participants: 0, admins: 0, pending: 1, suspended: 0 },
);
semak(
  '4d kiraan carian kosong hasil',
  kira('zzz'),
  { all: 0, educators: 0, participants: 0, admins: 0, pending: 0, suspended: 0 },
);
semak('4e senarai tab lengkap', TAB_PENGGUNA.map((t) => t.label), [
  'All',
  'Educators',
  'Participants',
  'Admins',
  'Pending approval',
  'Suspended',
]);

// =====================================================================
// Bahagian 5: fungsi kecil dan sempadan
// =====================================================================

semak('5a pelan tamat tepat 14 hari -> expiring', pelanTamatDalam(pengguna('x', { plan_expires_at: new Date(KINI + 14 * HARI).toISOString() }), KINI), true);
semak('5b pelan tamat 14 hari lebih 1 saat -> tidak', pelanTamatDalam(pengguna('x', { plan_expires_at: new Date(KINI + 14 * HARI + 1000).toISOString() }), KINI), false);
semak('5c pelan sudah tamat -> tidak expiring', pelanTamatDalam(pengguna('x', { plan_expires_at: new Date(KINI - HARI).toISOString() }), KINI), false);
semak('5d pelan tiada tarikh -> tidak', pelanTamatDalam(pengguna('x', {}), KINI), false);
semak('5e tarikh rosak -> tidak', pelanTamatDalam(pengguna('x', { plan_expires_at: 'bukan' }), KINI), false);
semak('5f had 14 hari dieksport', HARI_TAMAT_PELAN, 14);
semak('5g emelBelumSah u2', emelBelumSah('u2', meta), true);
semak('5h emelBelumSah u1 (sudah sah)', emelBelumSah('u1', meta), false);
semak('5i emelBelumSah tiada meta', emelBelumSah('tiada', meta), false);
semak('5j pendingPendidik pendidik belum lulus', pendingPendidik(senarai[1]), true);
semak('5k pendingPendidik pendidik sudah lulus', pendingPendidik(senarai[5]), false);
semak('5l pendingPendidik peserta', pendingPendidik(senarai[0]), false);
semak('5m pendingPendidik pendidik belum lulus tetapi digantung', pendingPendidik(pengguna('x', { role: 'educator', approved: false, suspended: true })), false);
semak('5n padanCarian emel kosong pada meta', padanCarian(pengguna('x', { display_name: 'Ali' }), { x: { id: 'x', email: null, created_at: '2026-09-01T00:00:00Z', last_sign_in_at: null } }, 'ali'), true);
semak('5o padanCarian jarum kosong sentiasa benar', padanCarian(pengguna('x', {}), {}, ''), true);

if (bilGagal > 0) {
  console.log(`GAGAL: ${bilGagal} semakan tidak lulus`);
  process.exit(1);
}
console.log('SEMUA SEMAKAN LULUS');
