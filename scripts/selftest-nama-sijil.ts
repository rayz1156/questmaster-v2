// KZ-A: ujian amaranNama. Jalankan: npx tsx scripts/selftest-nama-sijil.ts
import { amaranNama } from "../src/lib/sijil/namaSijil";

let lulus = 0;
let gagal = 0;
function uji(nama: string, disahkan: boolean, jangka: string[]) {
  const dapat = amaranNama(nama, disahkan).map((a) => a.code).sort();
  const ok = JSON.stringify(dapat) === JSON.stringify([...jangka].sort());
  if (ok) lulus += 1; else gagal += 1;
  console.log(`${ok ? "PASS" : "FAIL"} "${nama}" -> ${dapat.join(",") || "(tiada)"}`);
}

uji("Bro Taufik", false, ["unconfirmed", "short", "nickname"]);
uji("NURFATEHAH BINTI AHMAD (KEMAS-PAHANG)", true, ["brackets"]);
uji("TAUFIQ BIN MOHD YUSOF", true, []);
uji("Siti", true, ["short"]);
uji("Brotherhood Ali bin Abu", true, []);
uji("Dr. Muhamad Hariz bin Muhamad Adnan", true, []);
uji("", false, ["unconfirmed"]);

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
