/**
 * Ujian sendiri logik tulen KZ-021 (kit UI).
 *
 * Jalankan:  npx tsx scripts/selftest-kz021.ts
 *
 * Tiada pangkalan data dan tiada jaringan: fungsi tulen dalam
 * `src/lib/uiKit.ts` diuji dengan data bercampur: penomboran halaman
 * (jumlah, senarai dengan elipsis, pemotongan), skala carta bar dan
 * garis, label masa ProjectCard, serta guna semula inisial dan
 * palet indeks dari papanPemukaPeserta (KZ-020).
 */

import {
  inisial,
  warnaIndeks,
  jumlahMukaSurat,
  senaraiMukaSurat,
  potongHalaman,
  skalaBar,
  skalaGaris,
  titikSvg,
  labelMasa,
} from "../src/lib/uiKit";

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

function sama(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// 1. Jumlah muka surat.
{
  semak("jumlah: 0 item = 1 muka", jumlahMukaSurat(0, 10) === 1, String(jumlahMukaSurat(0, 10)));
  semak("jumlah: 25 item saiz 10 = 3 muka", jumlahMukaSurat(25, 10) === 3);
  semak("jumlah: 30 item saiz 10 = 3 muka", jumlahMukaSurat(30, 10) === 3);
  semak("jumlah: 31 item saiz 10 = 4 muka", jumlahMukaSurat(31, 10) === 4);
  semak("jumlah: saiz halaman 0 dianggap 1", jumlahMukaSurat(5, 0) === 5, String(jumlahMukaSurat(5, 0)));
  semak("jumlah: negatif dianggap 0 item", jumlahMukaSurat(-4, 10) === 1);
}

// 2. Senarai muka surat dengan elipsis (gaya Prev 1 2 ... 6 7 Next).
{
  const hal1 = senaraiMukaSurat(1, 7);
  semak("senarai: muka 1/7", sama(hal1, [1, 2, null, 7]), JSON.stringify(hal1));
  const hal4 = senaraiMukaSurat(4, 7);
  semak("senarai: muka 4/7", sama(hal4, [1, null, 3, 4, 5, null, 7]), JSON.stringify(hal4));
  const hal7 = senaraiMukaSurat(7, 7);
  semak("senarai: muka 7/7", sama(hal7, [1, null, 6, 7]), JSON.stringify(hal7));
  // Jumlah kecil: penuh tanpa elipsis.
  const kecil = senaraiMukaSurat(3, 5);
  semak("senarai: jumlah kecil penuh", sama(kecil, [1, 2, 3, 4, 5]), JSON.stringify(kecil));
  // Jumlah besar 102 muka, tepi 1.
  const besar1 = senaraiMukaSurat(1, 102);
  semak("senarai: 1/102", sama(besar1, [1, 2, null, 102]), JSON.stringify(besar1));
  const besar50 = senaraiMukaSurat(50, 102);
  semak("senarai: 50/102", sama(besar50, [1, null, 49, 50, 51, null, 102]), JSON.stringify(besar50));
  const besar102 = senaraiMukaSurat(102, 102);
  semak("senarai: 102/102", sama(besar102, [1, null, 101, 102]), JSON.stringify(besar102));
  // Semasa di luar julat diapit.
  const diapit = senaraiMukaSurat(999, 7);
  semak("senarai: semasa di luar diapit ke hujung", sama(diapit, [1, null, 6, 7]), JSON.stringify(diapit));
  // Elipsis tidak berganda dan sentiasa di antara nombor.
  for (let m = 1; m <= 20; m++) {
    const s = senaraiMukaSurat(m, 20);
    const duaNullBersebelahan = s.some((v, i) => v === null && s[i + 1] === null);
    semak(`senarai: 20 muka, hal ${m} tiada elipsis berganda`, !duaNullBersebelahan);
  }
}

// 3. Pemotongan halaman.
{
  const senarai = Array.from({ length: 25 }, (_, i) => i);
  const h1 = potongHalaman(senarai, 1, 10);
  semak("potong: muka 1 = item 0-9", sama(h1, senarai.slice(0, 10)), JSON.stringify(h1));
  const h3 = potongHalaman(senarai, 3, 10);
  semak("potong: muka 3 = item 20-24", sama(h3, senarai.slice(20)), JSON.stringify(h3));
  const hLuar = potongHalaman(senarai, 99, 10);
  semak("potong: halaman di luar diapit ke terakhir", sama(hLuar, senarai.slice(20)), JSON.stringify(hLuar));
  const hKosong = potongHalaman([], 1, 10);
  semak("potong: senarai kosong", hKosong.length === 0);
  semak("potong: null selamat", potongHalaman(null, 1, 10).length === 0);
}

// 4. Skala carta bar.
{
  type B = { label: string; nilai: number };
  const baris: B[] = [
    { label: "A", nilai: 100 },
    { label: "B", nilai: 60 },
    { label: "C", nilai: 30 },
  ];
  const carta = skalaBar(baris, (r) => r.label, (r) => r.nilai, 160);
  semak("bar: 3 baris", carta.length === 3);
  semak("bar: tertinggi nisbah 1 dan tinggi 160", carta[0].nisbah === 1 && carta[0].tinggi === 160, JSON.stringify(carta[0]));
  semak("bar: kedua nisbah 0.6 tinggi 96", carta[1].nisbah === 0.6 && carta[1].tinggi === 96, JSON.stringify(carta[1]));
  semak("bar: ketiga tinggi 48", carta[2].tinggi === 48, String(carta[2].tinggi));
  semak("bar: label dipakai", carta[0].label === "A");
  // Nilai sifar: tunas minimum.
  const sifar = skalaBar([{ label: "X", nilai: 0 }, { label: "Y", nilai: 0 }], (r) => r.label, (r) => r.nilai, 160, 6);
  semak("sifar: nisbah 0 tetap tunas 6px", sifar.every((c) => c.nisbah === 0 && c.tinggi === 6), JSON.stringify(sifar));
  // Kosong / null.
  semak("bar: senarai kosong", skalaBar<B>([], (r) => r.label, (r) => r.nilai, 160).length === 0);
  semak("bar: null selamat", skalaBar<B>(null, (r) => r.label, (r) => r.nilai, 160).length === 0);
  // Tinggi maksimum diapit (negatif dianggap minimum).
  const apit = skalaBar([{ label: "Z", nilai: 10 }], (r) => r.label, (r) => r.nilai, -5, 4);
  semak("bar: tinggi maksimum diapit ke atas", apit[0].tinggi === 4, String(apit[0].tinggi));
}

// 5. Skala garis (LineChart) dan titik SVG.
{
  semak("garis: tengah julat = 0.5", skalaGaris(5, 0, 10) === 0.5, String(skalaGaris(5, 0, 10)));
  semak("garis: min = 0", skalaGaris(0, 0, 10) === 0);
  semak("garis: maks = 1", skalaGaris(10, 0, 10) === 1);
  semak("garis: julat sifar = 0.5 (garis datar tengah)", skalaGaris(7, 7, 7) === 0.5);
  semak("garis: di luar diapit 0", skalaGaris(-4, 0, 10) === 0);
  semak("garis: di luar diapit 1", skalaGaris(99, 0, 10) === 1);
  semak("garis: julat bermula negatif", skalaGaris(0, -10, 10) === 0.5, String(skalaGaris(0, -10, 10)));
  semak("titik: nisbah 1 pada 300 = 300", titikSvg(1, 300) === 300);
  semak("titik: nisbah 0 = 0", titikSvg(0, 300) === 0);
  semak("titik: diapit", titikSvg(2, 300) === 300 && titikSvg(-1, 300) === 0);
  semak("titik: dibundat 2 titik perpuluhan", titikSvg(1 / 3, 300) === 100, String(titikSvg(1 / 3, 300)));
}

// 6. Label masa ProjectCard.
{
  semak("masa: siap = Done hijau", sama(labelMasa(0, true), { label: "Done", warna: "green" }));
  semak("masa: 1 hari = Due Tomorrow merah", sama(labelMasa(1, false), { label: "Due Tomorrow", warna: "red" }));
  semak("masa: 0 hari = Due Tomorrow merah", sama(labelMasa(0, false), { label: "Due Tomorrow", warna: "red" }));
  semak("masa: 5 hari = 5 Days Left kuning", sama(labelMasa(5, false), { label: "5 Days Left", warna: "yellow" }));
  semak("masa: 12 hari = kelabu", sama(labelMasa(12, false), { label: "12 Days Left", warna: "gray" }));
}

// 7. Guna semula inisial dan palet indeks dari papanPemukaPeserta.
{
  semak("inisial: dua perkataan", inisial("Ali Abu") === "AA", inisial("Ali Abu"));
  semak("inisial: tiga perkataan ambil dua pertama", inisial("Ali bin Abu") === "AB", inisial("Ali bin Abu"));
  semak("inisial: satu perkataan", inisial("Irfan") === "I", inisial("Irfan"));
  semak("inisial: kosong", inisial("") === "?");
  const w0 = warnaIndeks(0);
  semak("palet: indeks 0 ungu KZ-020", w0.latar === "#ebe2ff" && w0.teks === "#854fff", JSON.stringify(w0));
  const w6 = warnaIndeks(6);
  semak("palet: kitar 6 kembali ungu", w6.latar === "#ebe2ff" && w6.teks === "#854fff", JSON.stringify(w6));
}

console.log(`\nJumlah: ${bilangan}, gagal: ${gagal}`);
if (gagal > 0) process.exit(1);
