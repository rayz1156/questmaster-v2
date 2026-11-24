// KZ-C: ujian logik baris gilir e-mel sijil. Jalankan: npx tsx scripts/selftest-gilir-emel.ts
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "x";
import { kelaskanRalat, tundaMs, isiTemplat, emelTersuai, kadarSesaat, MAX_CUBAAN } from "../src/lib/sijil/pekerjaEmel";

let lulus = 0, gagal = 0;
const semak = (n: string, ok: boolean, info = "") => { ok ? lulus++ : gagal++; console.log(`${ok ? "PASS" : "FAIL"} ${n}${info ? " :: " + info : ""}`); };

const e452 = Object.assign(new Error("Mail command failed: 452 4.4.5 Messages per second limit exceeded (2/2)"), { responseCode: 452 });
semak("452 sementara", kelaskanRalat(e452) === "sementara");
semak("421 sementara", kelaskanRalat({ responseCode: 421 }) === "sementara");
semak("450/451 sementara", kelaskanRalat({ responseCode: 450 }) === "sementara" && kelaskanRalat({ responseCode: 451 }) === "sementara");
semak("550 kekal", kelaskanRalat({ responseCode: 550, message: "No such user" }) === "kekal");
semak("HTTP 429 sementara", kelaskanRalat({ status: 429 }) === "sementara");
semak("HTTP 503 sementara", kelaskanRalat({ statusCode: 503 }) === "sementara");
semak("HTTP 400 kekal", kelaskanRalat({ status: 400 }) === "kekal");
semak("ETIMEDOUT sementara", kelaskanRalat({ code: "ETIMEDOUT" }) === "sementara");
semak("mesej 452 tanpa kod sementara", kelaskanRalat(new Error("Mail command failed: 452 4.4.5 limit")) === "sementara");
semak("EAUTH kekal", kelaskanRalat({ code: "EAUTH", responseCode: 535 }) === "kekal");

const tunda = [1, 2, 3, 4, 5].map((c) => tundaMs(c, () => 0.5));
semak("backoff 2/4/8/16/32 s", JSON.stringify(tunda) === JSON.stringify([2000, 4000, 8000, 16000, 32000]), tunda.join(","));
semak("jitter dalam +/-25%", tundaMs(1, () => 0) === 1500 && tundaMs(1, () => 1) === 2500);
semak("maksimum 5 cubaan", MAX_CUBAAN === 5);

delete process.env.EMAIL_MAX_PER_SECOND;
semak("kadar lalai 1", kadarSesaat() === 1);
process.env.EMAIL_MAX_PER_SECOND = "5";
semak("kadar diapit 1.5", kadarSesaat() === 1.5);
process.env.EMAIL_MAX_PER_SECOND = "abc";
semak("kadar tidak sah jadi 1", kadarSesaat() === 1);

const nilai = { nama: "Ali <b>", kursus: "PAIC-M04", tarikh: "4 Oktober 2026", tempat: "KL", kod_sijil: "ABC123", pautan_pengesahan: "https://kuizen.fun/sijil/ABC123" };
semak("isi templat", isiTemplat("Tahniah {nama}, {kursus} {kod_sijil} {tidak}", nilai) === "Tahniah Ali <b>, PAIC-M04 ABC123 {tidak}");
const e = emelTersuai("Sijil {kursus}\nBcc: x", "Salam {nama}\n\nPautan {pautan_pengesahan}", nilai, true);
semak("subjek satu baris", e.subject === "Sijil PAIC-M04 Bcc: x");
semak("html di-escape", e.html.includes("Ali &lt;b&gt;") && !e.html.includes("Ali <b>"));
semak("teks tidak di-escape", e.text.startsWith("Salam Ali <b>"));

console.log(`\n${lulus} lulus, ${gagal} gagal`);
if (gagal > 0) process.exit(1);
