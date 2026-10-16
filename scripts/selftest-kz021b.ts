// Selftest KZ-021b: tafsiran keadaan bar sisi boleh dikecilkan.
import { tafsirKecil, nilaiSimpan, KUNCI_BAR_SISI } from "../src/lib/barSisi";

let jumlah = 0;
let gagal = 0;
function semak(nama: string, ok: boolean) {
  jumlah++;
  if (!ok) gagal++;
  console.log(`${ok ? "LULUS" : "GAGAL"}: ${nama}`);
}

semak("kunci storan tetap", KUNCI_BAR_SISI === "kz-bar-sisi-kecil");
semak("null = penuh", tafsirKecil(null) === false);
semak("undefined = penuh", tafsirKecil(undefined) === false);
semak("'0' = penuh", tafsirKecil("0") === false);
semak("'1' = kecil", tafsirKecil("1") === true);
semak("nilai rosak = penuh", tafsirKecil("true") === false);
semak("simpan kecil = '1'", nilaiSimpan(true) === "1");
semak("simpan penuh = '0'", nilaiSimpan(false) === "0");
semak("pusingan simpan/baca", tafsirKecil(nilaiSimpan(true)) && !tafsirKecil(nilaiSimpan(false)));

console.log(`\nJumlah: ${jumlah}, gagal: ${gagal}`);
if (gagal > 0) process.exit(1);
