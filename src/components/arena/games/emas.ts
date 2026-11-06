/**
 * Kuizen Arena, KZ-047: peti emas Pulau Harta Karun.
 *
 * `src/lib/arena/games.ts` (tiket KZ-045) belum wujud dalam cawangan ini,
 * jadi fungsi ditakrifkan di sini dengan logik SAMA TEPAT seperti
 * spesifikasi KZ-045 baris 43: hash djb2 ke atas rentetan
 * `sessionId + ':' + questionId`, emas jika `h % 4 === 0`.
 * Pelayan (laluan jawapan Arena, view 'pulau') menggandakan markah bila
 * ini benar, jadi fungsi ini TIDAK BOLEH diubah tanpa menyegerakkan
 * pelayan. TULEN: tiada import, tiada crypto, selamat di klien/pelayan.
 */

/** Hash djb2 (KZ-045) bagi sessionId + ':' + questionId. */
export function isGoldenChest(sessionId: string, questionId: string): boolean {
  let h = 5381;
  const s = sessionId + ':' + questionId;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h % 4 === 0;
}