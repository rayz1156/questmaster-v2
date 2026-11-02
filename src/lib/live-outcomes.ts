/**
 * Pengesahan badan PUT outcomes kuiz (KZ-037).
 *
 * Modul TULEN: sengaja tiada import pelayan (next/server,
 * supabase-route) supaya scripts/selftest-kz037.ts boleh
 * memanggilnya terus dengan npx tsx tanpa menarik runtime Next.
 * UUID_RE di sini kekal sepadan dengan UUID_RE dalam
 * src/lib/lnaAkses.ts (regex yang sama, salinan dua-dua tempat
 * atas sebab kekangan modul tulen).
 */

/** Had Outcome yang boleh ditag pada satu kuiz (KZ-037). */
export const HAD_OUTCOME_KUIZ = 15;

/** Format UUID heksadesimal, huruf besar atau kecil. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Benarkan rentetan UUID sahaja; nilai lain palsu. */
export function sahUuid(x: unknown): boolean {
  return typeof x === 'string' && UUID_RE.test(x);
}

/**
 * Sahkan senarai outcomeIds badan PUT outcomes kuiz:
 *  - mesti tatasusunan;
 *  - maks HAD_OUTCOME_KUIZ unsur;
 *  - setiap unsur mesti UUID sah;
 *  - pendua dibuang (upsert tidak boleh melanggar PK
 *    (quiz_id, outcome_id)).
 * Null bermakna tidak sah; laluan memulangkan 400.
 */
export function sahOutcomeIds(nilai: unknown): string[] | null {
  if (!Array.isArray(nilai)) return null;
  if (nilai.length > HAD_OUTCOME_KUIZ) return null;
  if (!nilai.every((x) => sahUuid(x))) return null;
  return Array.from(new Set(nilai as string[]));
}