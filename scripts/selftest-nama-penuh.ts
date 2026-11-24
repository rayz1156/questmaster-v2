// KZ-E: ujian pengesahan nama penuh, token dan amaran baharu.
// Jalankan: npx tsx scripts/selftest-nama-penuh.ts
import { sahkanNamaPenuh, janaToken, hashToken, tokenBerbentukSah } from "../src/lib/sijil/namaPenuh";
import { amaranNama, cariPendua, akaunDipadam } from "../src/lib/sijil/namaSijil";

let lulus = 0, gagal = 0;
const semak = (n: string, ok: boolean, info = "") => { ok ? lulus++ : gagal++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${info ? " :: " + info : ""}`); };

for (const n of ["Bro J", "MzN88", "dee", "Rogayah_Estar", "Puan Aminah binti Ali", "Mr. Abdul Rahim", "Kak Siti Aminah", "Ali 😀 Abu"]) {
  const h = sahkanNamaPenuh(n);
  semak(`ditolak: ${n}`, !h.ok, h.ok ? "" : h.mesej);
}
for (const n of ["Mak Wai Kit", "Tuan Nor Azlina binti Tuan Ismail", "Nur’Ain binti Ali", "Haji Ahmad bin Ali", "Norfarahin binti Amat @ Adnin", "UJIAN BIN NAMA PENUH", "Muthu a/l Raju", "Nur 'Aisyah binti Abd. Rahman", "  Siti   Aminah  binti Ali "]) {
  const h = sahkanNamaPenuh(n);
  semak(`diterima: ${n}`, h.ok, h.ok ? h.nama : h.mesej);
}
const h = sahkanNamaPenuh("  Siti   Aminah  binti Ali ");
semak("ruang dipadatkan", h.ok && h.nama === "Siti Aminah binti Ali");

const ap = sahkanNamaPenuh("Nur’Ain binti Ali");
semak("apostrof telefon ditukar", ap.ok && ap.nama === "Nur'Ain binti Ali");

const t = janaToken();
semak("token 43 aksara base64url", tokenBerbentukSah(t.token) && t.token.length === 43);
semak("hash 64 hex dan tetap", /^[0-9a-f]{64}$/.test(t.hash) && hashToken(t.token) === t.hash);
semak("token unik", janaToken().token !== t.token);
semak("bentuk token tidak sah ditolak", !tokenBerbentukSah("../etc/passwd") && !tokenBerbentukSah("abc"));

const kod = (n: string) => amaranNama(n, true).map((a) => a.code);
semak("organisasi PPK", kod("PPK JOHOR BAHRU TIMUR").includes("organization"));
semak("bukan organisasi bila ada BIN", !kod("PEJABAT AHMAD BIN ALI").includes("organization"));
semak("dipadam", kod("[Deleted] Muhammad Abdul Allah bin Asmah Roni").includes("deleted") && akaunDipadam("[Deleted] X Y"));
semak("nombor/garis bawah", kod("MzN88").includes("has_digits_or_underscore") && kod("Rogayah_Estar").includes("has_digits_or_underscore"));

const p = cariPendua([
  { participant_id: "a1", nama: "SHAHRUL AEDY" },
  { participant_id: "a2", nama: "SHAHRUL AEDY" },
  { participant_id: "b1", nama: "Siti Noor Fatinhana" },
  { participant_id: "b2", nama: "Siti Noor Fatinhana binti jabar" },
  { participant_id: "c1", nama: "sitimaryani mokhtar" },
  { participant_id: "c2", nama: "SITI MARYANI BINTI MOKHTAR (LPP-JOHOR)" },
  { participant_id: "d1", nama: "Muhammad Ali bin Ahmad" },
  { participant_id: "d2", nama: "Muhammad Ali bin Hassan" },
  { participant_id: "e1", nama: "Lain A", email: "x@y.com" },
  { participant_id: "e2", nama: "Lain B", email: "X@Y.com" },
]);
semak("pendua nama sama", p.has("a1") && p.has("a2"));
semak("pendua nama diri vs bin", p.has("b1") && p.has("b2"));
semak("pendua tanpa ruang dan kurungan", p.has("c1") && p.has("c2"));
semak("bukan pendua: bapa berbeza", !p.has("d1") && !p.has("d2"));
semak("pendua e-mel", p.has("e1") && p.has("e2"));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
