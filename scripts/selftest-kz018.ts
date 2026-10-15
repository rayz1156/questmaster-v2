/**
 * Ujian sendiri logik tulen KZ-018 (papan pemuka peserta).
 *
 * Jalankan:  npx tsx scripts/selftest-kz018.ts
 *
 * Tiada pangkalan data dan tiada jaringan: semua fungsi tulen
 * `src/lib/papanPemukaPeserta.ts` diuji dengan data bercampur
 * (kedudukan seri, saya di luar 5 teratas, senarai kosong,
 * pembahagian tab aktiviti, inisial nama).
 */

import {
  inisial,
  kedudukanSaya,
  atas5DenganSaya,
  bahagiAktiviti,
  kiraBila,
  peneranganTarikh,
} from "../src/lib/papanPemukaPeserta";

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

// Baris skor ringkas untuk ujian kedudukan.
type Baris = { id: string; skor: number };
const b = (id: string, skor: number): Baris => ({ id, skor });
const idOf = (r: Baris) => r.id;
const skorOf = (r: Baris) => r.skor;

// 1. Kedudukan seri: dua baris markah sama berkongsi kedudukan.
{
  const senarai = [b("a", 10), b("b", 10), b("c", 5), b("d", 2)];
  semak(
    "seri: kedudukan a = 1",
    kedudukanSaya(senarai, idOf, skorOf, "a") === 1
  );
  semak(
    "seri: kedudukan b = 1 (seri dengan a)",
    kedudukanSaya(senarai, idOf, skorOf, "b") === 1
  );
  semak(
    "seri: kedudukan c = 3 (dua baris lebih tinggi)",
    kedudukanSaya(senarai, idOf, skorOf, "c") === 3
  );
  semak("tiada dalam senarai: kedudukan 0", kedudukanSaya(senarai, idOf, skorOf, "x") === 0);
  semak("myId null: kedudukan 0", kedudukanSaya(senarai, idOf, skorOf, null) === 0);
}

// 2. Saya di luar 5 teratas: baris saya berasingan dengan pemisah.
{
  const senarai = [
    b("s1", 90),
    b("s2", 80),
    b("s3", 70),
    b("s4", 60),
    b("s5", 50),
    b("s6", 40),
    b("saya", 5),
  ];
  const hasil = atas5DenganSaya(senarai, idOf, skorOf, "saya");
  semak("luar5: atas 5 baris", hasil.atas.length === 5, String(hasil.atas.length));
  semak("luar5: tiada saya dalam atas", !hasil.atas.some((x) => x.saya));
  semak(
    "luar5: baris saya berasingan dengan kedudukan 7",
    !!hasil.saya && hasil.saya.kedudukan === 7 && (hasil.saya.baris as Baris).id === "saya"
  );
  semak("luar5: terpisah = true", hasil.terpisah === true);
  semak(
    "luar5: id baris saya betul",
    !!hasil.saya && (hasil.saya.baris as Baris).id === "saya"
  );
}

// 2b. Saya DALAM 5 teratas: tiada baris berasingan.
{
  const senarai = [b("s1", 90), b("s2", 80), b("saya", 70), b("s4", 60), b("s5", 50)];
  const hasil = atas5DenganSaya(senarai, idOf, skorOf, "saya");
  semak("dalam5: atas 5, saya bertanda", hasil.atas.length === 5 && hasil.atas[2].saya);
  semak("dalam5: saya null", hasil.saya === null);
  semak("dalam5: terpisah = false", hasil.terpisah === false);
}

// 3. Senarai kosong / tiada pasukan.
{
  semak("kosong: atas 0", atas5DenganSaya([], idOf, skorOf, "saya").atas.length === 0);
  const kosong = atas5DenganSaya<Baris>([], idOf, skorOf, null);
  semak("kosong: tiada id, saya null dan tidak terpisah", kosong.saya === null && !kosong.terpisah);
  semak(
    "kosong: kedudukan 0 walaupun myId diberi",
    kedudukanSaya<Baris>([], idOf, skorOf, "saya") === 0
  );
}

// 4. Pembahagian tab aktiviti ikut status dan end_at.
{
  const kini = new Date("2026-10-15T00:00:00Z");
  const aktiviti = [
    { id: "a1", status: "active", end_at: "2026-12-01T00:00:00Z", start_at: null },
    { id: "a2", status: "active", end_at: "2026-10-01T00:00:00Z", start_at: null }, // end_at lepas
    { id: "a3", status: "active", end_at: null, start_at: null },
    { id: "a4", status: "archived", end_at: null, start_at: null },
    { id: "a5", status: "draft", end_at: null, start_at: null }, // draf tidak dipapar
  ];
  const hasil = bahagiAktiviti(aktiviti as any, kini);
  const id = (l: any[]) => l.map((x) => x.id).sort();
  semak("tab: aktif = a1, a3", String(id(hasil.aktif)) === "a1,a3", String(id(hasil.aktif)));
  semak("tab: tamat = a2, a4", String(id(hasil.tamat)) === "a2,a4", String(id(hasil.tamat)));
  semak("tab: draf dikecualikan", !id(hasil.aktif).includes("a5") && !id(hasil.tamat).includes("a5"));
  semak("tab: senarai kosong / null selamat", bahagiAktiviti(null, kini).aktif.length === 0);
}

// 5. Inisial: satu perkataan, dua perkataan, kosong.
{
  semak("inisial: satu perkataan => H", inisial("Hariz") === "H", inisial("Hariz"));
  semak("inisial: dua perkataan => AA", inisial("Ali Abu") === "AA", inisial("Ali Abu"));
  semak(
    "inisial: lebih dua perkataan => dua pertama sahaja",
    inisial("Ali bin Ahmad Abu") === "AB",
    inisial("Ali bin Ahmad Abu")
  );
  semak("inisial: rentetan kosong => ?", inisial("") === "?", inisial(""));
  semak("inisial: ruang sahaja => ?", inisial("   ") === "?", inisial("   "));
}

// 6. Utiliti kecil.
{
  semak("kiraBila: bilangan predikat", kiraBila([1, 2, 3, 4], (n) => n % 2 === 0) === 2);
  semak("kiraBila: kosong/null => 0", kiraBila(null, () => true) === 0);
  semak(
    "peneranganTarikh: kedua-dua tarikh",
    peneranganTarikh("2026-10-01", "2026-11-01") === "Schedule: 2026-10-01 to 2026-11-01"
  );
  semak("peneranganTarikh: end_at sahaja", peneranganTarikh(null, "2026-11-01") === "Due: 2026-11-01");
  semak("peneranganTarikh: tiada tarikh => kosong", peneranganTarikh(null, null) === "");
}

console.log(`\nJumlah: ${bilangan}, gagal: ${gagal}`);
if (gagal > 0) process.exit(1);