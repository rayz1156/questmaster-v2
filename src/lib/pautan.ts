/**
 * Pengesah pautan dalaman (V2-012).
 *
 * Parameter `next` pada halaman log masuk mestilah laluan dalaman sahaja,
 * jika tidak ia menjadi redirect terbuka. Semakan ini dahulu bertulis
 * terus dalam src/app/login/page.tsx dan /auth/callback; kini ia diambil
 * keluar sebagai fungsi tulen supaya laluan login dan ujian sendiri
 * (scripts/selftest-masuk-kuiz.ts) memakai takrifan yang sama.
 *
 * Peraturan (kekal sama dengan /auth/callback):
 *   * mesti rentetan tidak kosong yang bermula dengan '/';
 *   * tolak '//' (pautan protocol-relative seperti //evil.com);
 *   * tolak '/\' (pemisah laluan Windows yang boleh ditafsir pelayar
 *     sebagai permulaan skema, contoh /\evil.com);
 *   * skema seperti https://x tidak bermula dengan '/', jadi ditolak
 *     secara semula jadi.
 */

/** Semak sama ada nilai `next` ialah laluan dalaman yang selamat dihala. */
export function pautanDalamanSelamat(next: string | null | undefined): boolean {
  if (typeof next !== 'string' || next.length === 0) return false;
  return next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\');
}
