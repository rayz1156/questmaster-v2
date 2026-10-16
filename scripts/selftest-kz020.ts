/**
 * Ujian sendiri logik tulen KZ-020 (papan pemuka LMS).
 *
 * Jalankan:  npx tsx scripts/selftest-kz020.ts
 *
 * Tiada pangkalan data dan tiada jaringan: fungsi tulen baharu dalam
 * `src/lib/papanPemukaPeserta.ts` diuji dengan data bercampur:
 * data carta bar 12 teratas (isih, had, nisbah, baris saya) dan
 * warna avatar/petak ikut indeks (kitaran palet).
 */

import { dataCartaBar, warnaIndeks } from "../src/lib/papanPemukaPeserta";

let gagal = 0;
let bilangan = 0;

function semak(nama: string, syarat: boolean, butiran?: string) {
  bilangan++;
  if (syarat) {
    console.log(`LULUS: ${nama}`);
  } else {
    gagal++;
    console.error(`GAGAL: ${nama}${butiran ? ` (${butiran})` : ""}`);
  }
}

// Baris skor ringkas untuk ujian carta.
type Baris = { id: string; nama: string; skor: number };
const b = (id: string, nama: string, skor: number): Baris => ({ id, nama, skor });
const idOf = (r: Baris) => r.id;
const namaOf = (r: Baris) => r.nama;
const skorOf = (r: Baris) => r.skor;

// 1. Carta bar: isih menurun dan nisbah.
{
  const senarai = [b("s3", "Crew", 30), b("s1", "Alpha", 100), b("s2", "Beta", 60)];
  const carta = dataCartaBar(senarai, idOf, namaOf, skorOf, "s2", 12);
  semak("carta: 3 baris", carta.length === 3, String(carta.length));
  semak("carta: tertinggi dahulu", carta[0].baris.id === "s1", carta[0].baris.id);
  semak("carta: nisbah tertinggi = 1", carta[0].nisbah === 1, String(carta[0].nisbah));
  semak("carta: nisbah kedua = 0.6", carta[1].nisbah === 0.6, String(carta[1].nisbah));
  semak("carta: nisbah ketiga = 0.3", carta[2].nisbah === 0.3, String(carta[2].nisbah));
  semak("carta: label dipakai", carta[0].label === "Alpha", carta[0].label);
  semak("carta: baris saya ditanda", carta[1].saya === true && carta[0].saya === false);
}

// 2. Carta bar: had 12 teratas dan pemotongan.
{
  const senarai = Array.from({ length: 20 }, (_, i) => b(`t${i}`, `T${i}`, 20 - i));
  const carta = dataCartaBar(senarai, idOf, namaOf, skorOf, null, 12);
  semak("had: tepat 12 baris", carta.length === 12, String(carta.length));
  semak("had: yang dipotong ialah markah terendah", !carta.some((c) => c.baris.id === "t19" || c.baris.id === "t18"));
  semak("had: nisbah baris pertama = 1", carta[0].nisbah === 1);
  // Tiada myId: tiada baris ditanda.
  semak("had: tiada baris saya bila myId null", !carta.some((c) => c.saya));
  // Saya di luar 12 teratas: tidak muncul dalam carta (bar biru hanya bila saya dalam 12).
  const cartaSaya = dataCartaBar(senarai, idOf, namaOf, skorOf, "t19", 12);
  semak("had: saya di luar 12 tidak dipaparkan", !cartaSaya.some((c) => c.saya));
  // Had khusus dipatuhi.
  const carta5 = dataCartaBar(senarai, idOf, namaOf, skorOf, null, 5);
  semak("had: parameter had 5 dihormati", carta5.length === 5, String(carta5.length));
}

// 3. Carta bar: senarai kosong dan semua markah sifar.
{
  const kosong = dataCartaBar([], idOf, namaOf, skorOf, null, 12);
  semak("kosong: tiada bar", kosong.length === 0, String(kosong.length));
  semak("kosong: null selamat", dataCartaBar(null, idOf, namaOf, skorOf, null, 12).length === 0);
  const sifar = dataCartaBar([b("a", "A", 0), b("c", "C", 0)], idOf, namaOf, skorOf, "a", 12);
  semak("sifar: 2 baris dipapar", sifar.length === 2);
  semak("sifar: semua nisbah 0", sifar.every((c) => c.nisbah === 0));
  semak("sifar: baris saya masih ditanda", sifar[0].saya === true);
  // Markah negatif tidak boleh melepaskan 0 (skor 0 kekal 0).
  const negatif = dataCartaBar([b("n", "N", -5), b("m", "M", -10)], idOf, namaOf, skorOf, null, 12);
  semak("negatif: maks dianggap 0, nisbah 0", negatif.every((c) => c.nisbah === 0));
}

// 4. Carta bar: seri markah tertinggi kedua-duanya nisbah 1.
{
  const senarai = [b("x", "X", 50), b("y", "Y", 50), b("z", "Z", 10)];
  const carta = dataCartaBar(senarai, idOf, namaOf, skorOf, "x", 12);
  semak("seri: kedua-dua baris nisbah 1", carta[0].nisbah === 1 && carta[1].nisbah === 1);
  semak("seri: baris ketiga nisbah 0.2", carta[2].nisbah === 0.2, String(carta[2].nisbah));
}

// 5. Warna ikut indeks: kitaran enam pasangan dan nilai tepat.
{
  const w0 = warnaIndeks(0);
  semak("warna: indeks 0 ungu", w0.latar === "#ebe2ff" && w0.teks === "#854fff", JSON.stringify(w0));
  const w1 = warnaIndeks(1);
  semak("warna: indeks 1 biru", w1.latar === "#e5e9ff" && w1.teks === "#6576ff", JSON.stringify(w1));
  const w5 = warnaIndeks(5);
  semak("warna: indeks 5 cyan", w5.latar === "#ceeef6" && w5.teks === "#09c2de", JSON.stringify(w5));
  const w6 = warnaIndeks(6);
  semak("warna: kitar 6 kembali ungu", w6.latar === "#ebe2ff" && w6.teks === "#854fff", JSON.stringify(w6));
  const w7 = warnaIndeks(7);
  semak("warna: kitar 7 biru", w7.latar === "#e5e9ff" && w7.teks === "#6576ff", JSON.stringify(w7));
  const wNeg = warnaIndeks(-3);
  semak("warna: indeks negatif kembali ungu", wNeg.latar === "#ebe2ff" && wNeg.teks === "#854fff", JSON.stringify(wNeg));
  // 6 indeks pertama semua berbeza (palet lengkap).
  const latar = Array.from({ length: 6 }, (_, i) => warnaIndeks(i).latar);
  semak("warna: 6 latar berbeza", new Set(latar).size === 6, String(new Set(latar).size));
  const teks = Array.from({ length: 6 }, (_, i) => warnaIndeks(i).teks);
  semak("warna: 6 teks berbeza", new Set(teks).size === 6, String(new Set(teks).size));
}

console.log(`\nJumlah: ${bilangan}, gagal: ${gagal}`);
if (gagal > 0) process.exit(1);
