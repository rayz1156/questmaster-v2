/**
 * Kuizen Arena, KZ-047 / KZ-046: peti emas Pulau Harta Karun.
 *
 * Satu sumber kebenaran: logik peti emas kini hidup dalam
 * `src/lib/arena/games.ts` (dibina oleh KZ-045) dan dipakai oleh pelayan
 * (laluan jawapan Arena, view 'pulau' menggandakan markah bila ini benar).
 * Fail ini kekal sebagai re-export supaya import lama
 * (contoh scripts/selftest-pulau.ts) terus berfungsi tanpa perubahan.
 */

export { isGoldenChest } from '@/lib/arena/games';