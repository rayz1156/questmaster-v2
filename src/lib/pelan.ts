import { supabase } from '@/lib/supabase';

export type Pelan = 'free' | 'pro';

/**
 * Had pelan percuma.
 *
 * Nilai sebenar bagi setiap pengguna disimpan dalam qm_profiles dan
 * dikuatkuasakan oleh pencetus pangkalan data. Nilai di sini hanya untuk
 * paparan dan mesej, jadi jangan sekali kali jadikannya sebagai sekatan.
 */
export const HAD_PERCUMA = {
  kelas: 3,
  kuiz: 10,
  pemainSesi: 40,
} as const;

// Nota bahasa: bahagian dalam aplikasi pendidik sudah diterjemah ke Bahasa
// Inggeris dalam kerja terdahulu, jadi mesej di sini mengikut bahasa skrin
// tempat ia muncul. Mesej pangkalan data kekal Bahasa Melayu dan tidak
// pernah dipaparkan mentah kepada pengguna. Untuk menukar bahasa UI, cukup
// ubah fail ini sahaja.
const MESEJ: Record<string, string> = {
  QM_PLAN_FREE:
    'This feature is not part of the free plan. The free plan covers quizzes only.',
  QM_LIMIT_CLASSES:
    `You have reached your class limit. The free plan allows ${HAD_PERCUMA.kelas} classes.`,
  QM_LIMIT_QUIZZES:
    `You have reached your quiz limit. The free plan allows ${HAD_PERCUMA.kuiz} quizzes. Delete an old quiz or upgrade.`,
  QM_LIMIT_PLAYERS: 'This session is full.',
  QM_FORBIDDEN: 'Only an administrator can do this.',
  QM_BAD_PLAN: 'Invalid plan.',
};

/** Kod had yang terkandung dalam ralat, jika ada. */
export function kodHad(e: unknown): string | null {
  const teks = (e as { message?: string } | null)?.message ?? String(e ?? '');
  for (const kod of Object.keys(MESEJ)) if (teks.includes(kod)) return kod;
  return null;
}

/** Tukar ralat pangkalan data kepada ayat Bahasa Melayu yang boleh dibaca. */
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
};

/** Pelan dan penggunaan kuota semasa pengguna yang log masuk. */
export async function pelanSaya(): Promise<RingkasanPelan | null> {
  const { data: sesi } = await supabase.auth.getSession();
  const uid = sesi.session?.user?.id;
  if (!uid) return null;

  const [{ data: profil }, { count }] = await Promise.all([
    supabase
      .from('qm_profiles')
      .select('plan, max_classes_owned, max_quizzes_owned, max_live_players')
      .eq('id', uid)
      .maybeSingle(),
    supabase
      .from('qm_classes')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', uid),
  ]);

  if (!profil) return null;
  const p = profil as {
    plan?: string;
    max_classes_owned?: number | null;
    max_quizzes_owned?: number | null;
    max_live_players?: number | null;
  };
  return {
    pelan: p.plan === 'pro' ? 'pro' : 'free',
    hadKelas: p.max_classes_owned ?? null,
    hadKuiz: p.max_quizzes_owned ?? null,
    hadPemain: p.max_live_players ?? null,
    kelasDigunakan: count ?? 0,
  };
}

/** Had yang sangat besar bermakna tiada had dari segi praktikal. */
export function tanpaHad(n: number | null): boolean {
  return n === null || n >= 1000000;
}
