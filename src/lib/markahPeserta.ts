/**
 * Fungsi tulen untuk markah peserta (tiket V2-013), tanpa akses pangkalan
 * data supaya boleh diuji dengan `npx tsx scripts/selftest-markah-peserta.ts`.
 *
 * `npx tsc` dan `npm run build` tidak menyemak logik; kedudukan seri dan
 * pemisah ribuan adalah dua tempat yang senyap salah, jadi ia diuji di sana.
 */

/**
 * Kedudukan kompetitif bagi senarai mata: kedudukan setiap pemain ialah
 * 1 + bilangan pemain lain dengan mata lebih tinggi, jadi seri berkongsi
 * kedudukan yang sama dan kedudukan selepasnya melompat.
 * Contoh: [100, 90, 90, 80] memberi [1, 2, 2, 4].
 * Nilai yang bukan nombor dirawat sebagai 0 supaya baris rosak tidak
 * merosakkan kedudukan orang lain. Keputusan selari dengan susunan input.
 */
export function kiraKedudukan(mata: readonly number[]): number[] {
  const selamat = mata.map((m) => (Number.isFinite(m) ? Number(m) : 0));
  return selamat.map((m) => 1 + selamat.filter((lain) => lain > m).length);
}

/**
 * Format mata untuk paparan UI: nombor bulat dengan pemisah ribuan en-US
 * (1,234,567), nilai negatif kekal bertanda (-1,234). Nilai yang bukan
 * nombor atau tidak terhingga dipaparkan sebagai 0.
 */
export function formatMata(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return v.toLocaleString('en-US');
}
