/**
 * KZ-045: peraturan permainan Arena yang mesti SAMA TEPAT antara pelayan dan
 * klien. Fail ini tulen (tiada import, tiada crypto) supaya KZ-047 boleh
 * menyalinnya ke klien tanpa perubahan.
 *
 * Peti emas (Pulau Harta Karun): soalan emas memberi markah dua kali ganda.
 * Deterministik daripada (sessionId, questionId) sahaja supaya hos, pemain
 * dan pelayan sentiasa bersetuju tanpa menyimpan apa-apa dalam pangkalan
 * data. Hash djb2 atas rentetan "sessionId:questionId", emas jika h % 4 = 0
 * (kira-kira satu daripada empat soalan).
 */
export function isGoldenChest(sessionId: string, questionId: string): boolean {
  let h = 5381;
  const s = sessionId + ':' + questionId;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h % 4 === 0;
}
