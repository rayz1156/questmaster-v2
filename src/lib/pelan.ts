import { supabase } from '@/lib/supabase';

export type Pelan = 'free' | 'pro' | 'institution' | 'unlimited';

/**
 * Had pelan: SATU sumber untuk UI dan landing page. Angka di sini MESTI
 * selari dengan qm_plan_limits dalam supabase/migrations/0040_pelan_v2.sql
 * (baris 87 hingga 89). Null bermakna tanpa had (pelan unlimited atau
 * had pro/institution yang memang null). Jangan guna nilai ini sebagai
 * sekatan: kuatkuasa sebenar berada di pangkalan data.
 *
 * file_mb / storage_mb dalam MB.
 */
export const HAD_PELAN: Record<Pelan, {
  kelas: number | null;
  kelasKoPendidik: number | null;
  ahliSeKelas: number | null;
  pemainSesi: number | null;
  aktiviti: number | null;
  papan: number | null;
  fileMb: number | null;
  storageMb: number | null;
  penilaianRakan: boolean;
}> = {
  free: {
    kelas: 3,
    kelasKoPendidik: 3,
    ahliSeKelas: 150,
    pemainSesi: 60,
    aktiviti: 30,
    papan: 5,
    fileMb: 10,
    storageMb: 100,
    penilaianRakan: false,
  },
  pro: {
    kelas: 30,
    kelasKoPendidik: 30,
    ahliSeKelas: null,
    pemainSesi: 300,
    aktiviti: null,
    papan: null,
    fileMb: 20,
    storageMb: 1024,
    penilaianRakan: true,
  },
  institution: {
    kelas: 30,
    kelasKoPendidik: 30,
    ahliSeKelas: null,
    pemainSesi: 300,
    aktiviti: null,
    papan: null,
    fileMb: 20,
    storageMb: 10240,
    penilaianRakan: true,
  },
  // Pelan dalaman, tidak dijual (V2-002b-baiki): semua had null dan boleh
  // muat naik video. HARGA_PELAN tidak memasukkannya.
  unlimited: {
    kelas: null,
    kelasKoPendidik: null,
    ahliSeKelas: null,
    pemainSesi: null,
    aktiviti: null,
    papan: null,
    fileMb: null,
    storageMb: null,
    penilaianRakan: true,
  },
};

/** Harga pelan, mata wang MYR. Sumber tunggal untuk UI dan landing page.
 *  Pelan unlimited TIDAK dijual: pelan dalaman, jadi tiada harga. */
export const HARGA_PELAN = {
  free: { tahunan: 0 },
  pro: { bulanan: 29, tahunanSebulan: 19, tahunan: 228 },
  institution: { tahunan: 1500, kerusi: 10 },
} as const;

// Nota bahasa: bahagian dalam aplikasi pendidik sudah diterjemah ke Bahasa
// Inggeris dalam kerja terdahulu, jadi mesej di sini mengikut bahasa skrin
// tempat ia muncul. Mesej pangkalan data kekal Bahasa Melayu dan tidak
// pernah dipaparkan mentah kepada pengguna. Untuk menukar bahasa UI, cukup
// ubah fail ini sahaja. Angka dibaca daripada HAD_PELAN supaya mesej tidak
// pernah berbeza dengan kuatkuasa sebenar.
const MESEJ: Record<string, string> = {
  QM_PLAN_FREE: 'This feature is not available on the free plan. Upgrade to unlock more.',
  QM_PLAN_PRO: 'Peer evaluation is available on the Pro plan. Upgrade to unlock it.',
  QM_LIMIT_CLASSES:
    `You have reached your class limit. Your plan allows ${HAD_PELAN.free.kelas} classes on the free plan.`,
  QM_LIMIT_QUIZZES:
    'You have reached the quiz limit set for your account. Please contact the administrator.',
  QM_LIMIT_ACTIVITIES:
    `You have reached the activity limit (quests and quizzes). The free plan allows ${HAD_PELAN.free.aktiviti}. Delete old ones or upgrade.`,
  QM_LIMIT_BOARDS:
    `You have reached the board limit. The free plan allows ${HAD_PELAN.free.papan} boards. Delete old ones or upgrade.`,
  QM_LIMIT_MEMBERS: 'This class is full. Remove a participant or upgrade your plan.',
  QM_LIMIT_STORAGE: 'Your storage is full. Delete old files or upgrade your plan.',
  QM_LIMIT_FILE_SIZE: 'This file exceeds the per-file size limit of your plan.',
  QM_VIDEO_BLOCKED: 'Video files are not supported. Paste a YouTube or Google Drive link instead.',
  QM_LIMIT_PLAYERS: 'This session is full.',
  QM_FORBIDDEN: 'Only an administrator can do this.',
  QM_BAD_PLAN: 'Invalid plan.',
  QM_LEADER_CONFLICT:
    'One of the groups already has a leader. Remove the extra leader in your file and upload again.',
  QM_NOT_FOUND: 'That class could not be found.',
  QM_PEER_MAX_ROUNDS: 'A class can have at most six evaluation rounds.',
  QM_PEER_CLOSED: 'This evaluation round is closed.',
  QM_PEER_NOT_MEMBER: 'You are not a member of this group.',
  QM_PEER_SELF: 'You cannot evaluate yourself.',
  QM_PEER_JUSTIFY: 'Please explain any score of 0 or 1.',
};

/** Kod had yang terkandung dalam ralat, jika ada. */
export function kodHad(e: unknown): string | null {
  const teks = (e as { message?: string } | null)?.message ?? String(e ?? '');
  for (const kod of Object.keys(MESEJ)) if (teks.includes(kod)) return kod;
  return null;
}

/** Tukar ralat pangkalan data kepada ayat yang boleh dibaca pengguna. */
export function mesejHad(e: unknown, lalai = 'Something went wrong.'): string {
  const kod = kodHad(e);
  if (kod) return MESEJ[kod];
  const teks = (e as { message?: string } | null)?.message ?? '';
  return teks || lalai;
}

export type RingkasanPelan = {
  pelan: Pelan;
  hadKelas: number | null;
  hadKuiz: number | null;
  hadPemain: number | null;
  kelasDigunakan: number;
  aktivitiDigunakan: number | null;
  papanDigunakan: number | null;
  storageDigunakanBytes: number | null;
  tamatTempoh: string | null;
};

type JsonPelan = {
  plan?: string;
  effective_plan?: string;
  expires_at?: string | null;
  limits?: Record<string, unknown> | null;
  usage?: {
    classes?: number;
    activities?: number;
    boards?: number;
    storage_bytes?: number;
  } | null;
};

/** Pelan dan penggunaan kuota semasa pengguna yang log masuk (RPC 0040/0041). */
export async function pelanSaya(): Promise<RingkasanPelan | null> {
  const { data: sesi } = await supabase.auth.getSession();
  if (!sesi.session) return null;

  const { data, error } = await supabase.rpc('qm_my_plan_usage');
  if (error || !data) return null;

  const j = data as JsonPelan;
  // 'unlimited' ialah pelan keempat yang sah (V2-002b-baiki); apa-apa nilai
  // lain yang tidak dikenali jatuh ke free seperti sebelum ini.
  const plan: Pelan =
    j.plan === 'pro' || j.plan === 'institution' || j.plan === 'unlimited'
      ? j.plan
      : 'free';
  const had = j.limits || {};
  return {
    pelan: plan,
    hadKelas: (had.classes as number | null) ?? null,
    hadKuiz: null,
    hadPemain: (had.live_players as number | null) ?? null,
    kelasDigunakan: j.usage?.classes ?? 0,
    aktivitiDigunakan: j.usage?.activities ?? null,
    papanDigunakan: j.usage?.boards ?? null,
    storageDigunakanBytes: j.usage?.storage_bytes ?? null,
    tamatTempoh: j.expires_at ?? null,
  };
}

/** Had yang sangat besar bermakna tiada had dari segi praktikal. */
export function tanpaHad(n: number | null): boolean {
  return n === null || n >= 1000000;
}
