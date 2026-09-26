/**
 * Ujian sendiri untuk integrasi e-mel (KZ-005) yang tidak menyentuh
 * pangkalan data mahupun Encharge sebenar: fetch diolah sepenuhnya.
 *
 * Jalankan:  npx tsx scripts/selftest-email-export.ts
 *
 * Kenapa fail ini wujud: tsc tidak menyemak logik. Cubaan semula,
 * keserentakan, pemecahan nama dan slug tag ialah tempat yang senyap
 * salah, dan kesilapan di situ hanya kelihatan selepas pendidik
 * menghantar senarai pelajar sebenar kepada penyedia.
 */

/* Patch dahulu, import kemudian: tangguh cuba semula (1s/2s/4s)
 * dipendekkan kepada 1ms supaya kes 5xx habis cubaan tidak mengambil
 * 7 saat setiap kali. setTimeout global di-patch sebelum modul
 * email-providers dimuatkan secara dinamik. */
const setTimeoutAsli = globalThis.setTimeout;
(globalThis as Record<string, unknown>).setTimeout = (
  fn: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
) => setTimeoutAsli(fn, 1, ...args);

/** Satu panggilan fetch yang direkodkan. */
type Panggilan = { url: string; method: string; token: string | null; body: string | null };

let panggilan: Panggilan[] = [];
/** Skrip olok: pulangkan status HTTP untuk panggilan berturut-turut. */
let olok: ((p: Panggilan, n: number) => number | Promise<number>) | null = null;
let aktif = 0;
let maksAktif = 0;

globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
  const p: Panggilan = {
    url: typeof input === "string" ? input : String(input),
    method: init?.method || "GET",
    token: ((init?.headers as Record<string, string> | undefined)?.["X-Encharge-Token"]) ?? null,
    body: typeof init?.body === "string" ? init.body : null,
  };
  panggilan.push(p);
  aktif++;
  maksAktif = Math.max(maksAktif, aktif);
  try {
    const n = olok ? await olok(p, panggilan.length) : 200;
    return {
      ok: n >= 200 && n < 300,
      status: n,
      json: async () => ({}),
      text: async () => "",
    } as unknown as Response;
  } finally {
    aktif--;
  }
}) as typeof fetch;

let pass = 0;
let fail = 0;
function check(nama: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log("PASS " + nama);
  } else {
    fail++;
    console.log("FAIL " + nama + " :: " + JSON.stringify(extra));
  }
}

async function main() {
  const { encharge, splitName, classTags, slugify } = await import("../src/lib/email-providers/index");
  const KUNCI = "enc_sk_rahsia_jangan_bocor_123";

  /* ===== Bahagian 1: validateKey ===== */

  olok = () => 200;
  panggilan = [];
  const v200 = await encharge.validateKey(KUNCI);
  check("validateKey 200 sah", v200.ok === true && v200.status === 200, v200);
  check("validateKey guna pengepala X-Encharge-Token",
    panggilan[0]?.token === KUNCI && panggilan[0]?.url.endsWith("/accounts/info") === true,
    panggilan[0]);

  olok = () => 401;
  const v401 = await encharge.validateKey(KUNCI);
  check("validateKey 401 tidak sah", v401.ok === false && v401.status === 401, v401);

  olok = () => 403;
  const v403 = await encharge.validateKey(KUNCI);
  check("validateKey 403 tidak sah", v403.ok === false && v403.status === 403, v403);

  olok = () => 500;
  const v500 = await encharge.validateKey(KUNCI);
  check("validateKey 500 ralat penyedia, bukan kunci tidak sah",
    v500.ok === false && v500.status === 500, v500);
  check("validateKey tidak menyimpan kunci dalam hasil", JSON.stringify(v200).indexOf(KUNCI) === -1);

  // validateKey TIDAK mencuba semula: satu panggilan sahaja walaupun 500.
  panggilan = [];
  olok = () => 500;
  await encharge.validateKey(KUNCI);
  check("validateKey tidak mencuba semula pada 500", panggilan.length === 1, panggilan.length);

  /* ===== Bahagian 2: upsertContacts ===== */

  const kontak = (n: number): import("../src/lib/email-providers/index").EmailProviderContact[] =>
    Array.from({ length: n }, (_, i) => ({
      email: `pelajar${i + 1}@contoh.com`,
      firstName: `Nama${i + 1}`,
      lastName: "Akhir",
      tags: ["kuizen", "kuizen-biologi"],
    }));

  // 429 sekali kemudian berjaya: dicuba semula dan akhirnya berjaya.
  panggilan = [];
  let n = 0;
  olok = () => (++n === 1 ? 429 : 200);
  const r429 = await encharge.upsertContacts(KUNCI, kontak(1));
  check("429 dicuba semula dan berjaya", r429.sent === 1 && r429.failed === 0, r429);
  check("429 memerlukan 2 panggilan", panggilan.length === 2, panggilan.length);

  // 5xx berterusan: habis 3 cubaan semula (4 panggilan) dan gagal.
  panggilan = [];
  olok = () => 500;
  const r500 = await encharge.upsertContacts(KUNCI, kontak(1));
  check("5xx habis cubaan: gagal", r500.sent === 0 && r500.failed === 1, r500);
  check("5xx berjalan 4 percubaan (1 asal + 3 semula)", panggilan.length === 4, panggilan.length);
  check("ralat tanpa e-mel penuh dan tanpa kunci",
    r500.errors.length === 1 &&
    r500.errors[0].indexOf("pelajar1") === -1 &&
    r500.errors[0].indexOf(KUNCI) === -1,
    r500.errors);

  // 400 TIDAK dicuba semula (bukan 429/5xx).
  panggilan = [];
  olok = () => 400;
  const r400 = await encharge.upsertContacts(KUNCI, kontak(1));
  check("400 tidak dicuba semula", panggilan.length === 1 && r400.failed === 1, [panggilan.length, r400]);

  // Badan kenalan: satu kenalan setiap permintaan, tags dipisah koma.
  panggilan = [];
  olok = () => 200;
  await encharge.upsertContacts(KUNCI, kontak(1));
  const badan = panggilan[0] ? JSON.parse(panggilan[0].body || "{}") : {};
  check("badan { email, firstName, lastName, tags } dengan tags dipisah koma",
    badan.email === "pelajar1@contoh.com" &&
    badan.firstName === "Nama1" &&
    badan.lastName === "Akhir" &&
    badan.tags === "kuizen,kuizen-biologi",
    badan);
  check("URL penyedia tetap (SSRF)", panggilan[0]?.url === "https://api.encharge.io/v1/people", panggilan[0]?.url);

  // Keserentakan 4 dengan 10 kenalan: maksimum 4 serentak, semua berjaya.
  maksAktif = 0;
  panggilan = [];
  const tangguhOlok = (ms: number) => new Promise((r) => setTimeoutAsli(r, ms));
  olok = async () => {
    await tangguhOlok(20); // beri masa untuk Panggilan bertindih
    return 200;
  };
  const r10 = await encharge.upsertContacts(KUNCI, kontak(10));
  check("10 kenalan semua berjaya", r10.sent === 10 && r10.failed === 0 && r10.errors.length === 0, r10);
  check("keserentakan maksimum 4", maksAktif === 4, maksAktif);

  // Kunci tidak pernah muncul dalam hasil mahupun mesej ralat.
  olok = () => 500;
  const rKebocoran = await encharge.upsertContacts(KUNCI, kontak(2));
  check("tiada kunci dalam hasil upsert",
    JSON.stringify(rKebocoran).indexOf(KUNCI) === -1, rKebocoran);

  /* ===== Bahagian 3: pemecahan nama ===== */

  const tiga = splitName("Ali Bin Abu");
  check("tiga perkataan: pertama firstName, baki lastName",
    tiga.firstName === "Ali" && tiga.lastName === "Bin Abu", tiga);
  const satu = splitName("Cher");
  check("satu perkataan: lastName kosong", satu.firstName === "Cher" && satu.lastName === "", satu);
  const kosong = splitName("   ");
  check("nama kosong", kosong.firstName === "" && kosong.lastName === "", kosong);
  const duaperkataan = splitName("  Nurul   Hidayah  ");
  check("ruang berlebihan dipangkas",
    duaperkataan.firstName === "Nurul" && duaperkataan.lastName === "Hidayah", duaperkataan);

  /* ===== Bahagian 4: slug dan tag kelas ===== */

  check("slug asas", slugify("Biology 101! (Section A)") === "biology-101-section-a",
    slugify("Biology 101! (Section A)"));
  const tag = classTags("Biology 101!");
  check("tag kelas [kuizen, kuizen-biology-101]",
    tag.length === 2 && tag[0] === "kuizen" && tag[1] === "kuizen-biology-101", tag);
  const panjang = classTags("Introduction to Advanced Molecular Cell Biology and Genetics");
  check("tag panjang dipotong kepada 40 aksara",
    panjang.every((t) => t.length <= 40), panjang);
  check("tag tidak berakhir dengan sengkang",
    panjang.every((t) => !/-+$/.test(t)), panjang);
  check("nama kosong hanya tag kuizen", classTags("   ").length === 1 && classTags("   ")[0] === "kuizen",
    classTags("   "));
  check("aksara bukan ASCII dibuang mengikut spesifikasi (a-z0-9 sahaja)",
    slugify("Kelas Économía") === "kelas-conom-a",
    slugify("Kelas Économía"));

  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
