/**
 * Pemetaan kod ralat penilaian rakan kepada mesej Bahasa Inggeris yang
 * boleh dibaca, untuk laluan API pelayan.
 *
 * JANGAN import '@/lib/pelan' dari laluan API: fail itu membina klien
 * Supabase pelayar pada skop modul (lihat catatan dalam
 * src/app/api/classes/[id]/teams/import-csv/route.ts). Salinan kecil di
 * sini memastikan mesej yang sama tanpa kebergantungan pelayar. Kod yang
 * sama juga didaftarkan dalam peta MESEJ di src/lib/pelan.ts.
 */
const MESEJ: Record<string, string> = {
  QM_PLAN_FREE:
    'This feature is not part of the free plan. The free plan covers quizzes only.',
  QM_PEER_MAX_ROUNDS: 'A class can have at most six evaluation rounds.',
  QM_PEER_CLOSED: 'This evaluation round is closed.',
  QM_PEER_NOT_MEMBER: 'You are not a member of this group.',
  QM_PEER_SELF: 'You cannot evaluate yourself.',
  QM_PEER_JUSTIFY: 'Please explain any score of 0 or 1.',
  QM_FORBIDDEN: 'Only an educator of this class can do this.',
  QM_NOT_FOUND: 'This evaluation round does not exist.',
};

/** Kod yang terkandung dalam mesej ralat, jika ada. */
export function kodPeer(e: { message?: string } | null | undefined): string | null {
  const teks = e?.message ?? '';
  for (const kod of Object.keys(MESEJ)) if (teks.includes(kod)) return kod;
  return null;
}

/** Mesej Bahasa Inggeris untuk ralat, atau teks asal jika kod tidak dikenali. */
export function mesejPeer(e: { message?: string } | null | undefined): string {
  const kod = kodPeer(e);
  if (kod) return MESEJ[kod];
  return e?.message || 'Something went wrong.';
}

/** Status HTTP yang sesuai bagi kod ralat. */
export function statusPeer(kod: string | null): number {
  if (kod === 'QM_PLAN_FREE' || kod === 'QM_FORBIDDEN') return 403;
  if (kod === 'QM_NOT_FOUND') return 404;
  if (kod === 'QM_PEER_MAX_ROUNDS') return 409;
  return 400;
}