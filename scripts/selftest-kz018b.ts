/**
 * Ujian sendiri logik tulen baharu KZ-018b (papan pemuka peserta Versi 2).
 *
 * Jalankan:  npx tsx scripts/selftest-kz018b.ts
 *
 * Tiada pangkalan data dan tiada jaringan: fungsi tulen
 * `src/lib/papanPemukaPeserta.ts` (bahagian KZ-018b) diuji dengan data
 * bercampur: pilih aktiviti seterusnya, label tarikh relatif, ayat jarak
 * kedudukan (#1, #2+, seri, tiada kedudukan), ayat kad LIVE, penapis
 * status sesi dan pilihan sesi terkini.
 */

import {
  pilihAktivitiSeterusnya,
  labelTarikhQuest,
  ayatKedudukan,
  ayatKadLive,
  sesiBolehMasuk,
  pilihSesiTerkini,
  warnaKelas,
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

const KINI = new Date("2026-10-15T12:00:00Z");

// 1. Pilih aktiviti seterusnya (NEXT UP).
{
  const a = (
    id: string,
    end_at: string | null,
    created_at: string
  ) => ({ id, end_at, created_at });

  // Yang bertarikh: end_at terdekat menang walaupun dicipta lebih awal.
  const bertarikh = [
    a("jauh", "2026-11-20T00:00:00Z", "2026-10-01T00:00:00Z"),
    a("dekat", "2026-10-18T00:00:00Z", "2026-10-10T00:00:00Z"),
    a("sederhana", "2026-10-25T00:00:00Z", "2026-10-14T00:00:00Z"),
  ];
  semak(
    "next: end_at terdekat menang",
    pilihAktivitiSeterusnya(bertarikh)?.id === "dekat",
    pilihAktivitiSeterusnya(bertarikh)?.id
  );

  // Tiada end_at: yang terbaru dicipta.
  const tanpaTarikh = [
    a("lama", null, "2026-09-01T00:00:00Z"),
    a("baharu", null, "2026-10-14T00:00:00Z"),
  ];
  semak(
    "next: tanpa end_at, terbaru dicipta",
    pilihAktivitiSeterusnya(tanpaTarikh)?.id === "baharu",
    pilihAktivitiSeterusnya(tanpaTarikh)?.id
  );

  // Bertarikh mengatasi yang tanpa tarikh.
  const bercampur = [
    a("tanpa", null, "2026-10-14T00:00:00Z"),
    a("dengan", "2026-10-20T00:00:00Z", "2026-10-01T00:00:00Z"),
  ];
  semak(
    "next: bertarikh mengatasi tanpa tarikh",
    pilihAktivitiSeterusnya(bercampur)?.id === "dengan",
    pilihAktivitiSeterusnya(bercampur)?.id
  );

  semak("next: senarai kosong => null", pilihAktivitiSeterusnya([]) === null);
  semak("next: null selamat", pilihAktivitiSeterusnya(null) === null);
}

// 2. Label tarikh relatif baris quest.
{
  const esok = new Date(KINI.getTime() + 86_400_000).toISOString();
  const hari5 = new Date(KINI.getTime() + 5 * 86_400_000).toISOString();
  const hari9 = new Date(KINI.getTime() + 9 * 86_400_000).toISOString();
  const lepas = new Date(KINI.getTime() - 8 * 86_400_000).toISOString();

  semak(
    "label: Due tomorrow (segera)",
    (() => {
      const r = labelTarikhQuest(esok, false, KINI);
      return r.label === "Due tomorrow" && r.segera === true;
    })()
  );
  semak(
    "label: Due today untuk hari sama (segera)",
    (() => {
      const r = labelTarikhQuest(KINI.toISOString(), false, KINI);
      return r.label === "Due today" && r.segera === true;
    })()
  );
  semak(
    "label: Due in 5 days",
    labelTarikhQuest(hari5, false, KINI).label === "Due in 5 days"
  );
  semak(
    "label: Due 24 Oct (lebih 7 hari)",
    labelTarikhQuest("2026-10-24T12:00:00Z", false, KINI).label === "Due 24 Oct",
    labelTarikhQuest("2026-10-24T12:00:00Z", false, KINI).label
  );
  semak(
    "label: hari 9 => label tarikh, bukan hari",
    labelTarikhQuest(hari9, false, KINI).label === "Due 24 Oct",
    labelTarikhQuest(hari9, false, KINI).label
  );
  // lepas = 8 hari sebelum KINI = 7 Okt; contoh tiket "Ended 8 Oct" ialah
  // contoh format, bukan tarikh tetap.
  semak(
    "label: Ended {tarikh} untuk yang tamat",
    labelTarikhQuest(lepas, true, KINI).label === "Ended 7 Oct",
    labelTarikhQuest(lepas, true, KINI).label
  );
  semak(
    "label: Ended tanpa tarikh",
    labelTarikhQuest(null, true, KINI).label === "Ended"
  );
  semak(
    "label: aktif tanpa tarikh => kosong",
    labelTarikhQuest(null, false, KINI).label === ""
  );
  semak(
    "label: lepas tapi masih aktif => segera",
    (() => {
      const r = labelTarikhQuest(lepas, false, KINI);
      return r.segera === true && r.label === "Due today";
    })()
  );
}

// 3. Ayat jarak kedudukan: #1, #2+, seri, tiada kedudukan.
{
  semak(
    "kedudukan: #1 leading",
    ayatKedudukan(1, 100, null) === "in class. You are leading. Keep it up."
  );
  semak(
    "kedudukan: #4 dengan jarak",
    ayatKedudukan(4, 2340, { nama: "Daniel Lim", skor: 2450, kedudukan: 3 }) ===
      "in class. 110 pts to overtake Daniel Lim for #3.",
    ayatKedudukan(4, 2340, { nama: "Daniel Lim", skor: 2450, kedudukan: 3 }) ?? ""
  );
  // Seri: kedudukan saya 5, baris atas berada di kedudukan 3 (dua seri
  // kedudukan 3 di atas saya). Ayat mesti guna kedudukan sebenar #3.
  semak(
    "kedudukan: seri => kedudukan sebenar baris atas",
    ayatKedudukan(5, 70, { nama: "X", skor: 80, kedudukan: 3 }) ===
      "in class. 10 pts to overtake X for #3.",
    ayatKedudukan(5, 70, { nama: "X", skor: 80, kedudukan: 3 }) ?? ""
  );
  // Jarak sifar tidak mungkin (baris atas mesti markah lebih tinggi),
  // tetapi pertahanan memberi gap minimum 1 supaya tiada "0 pts".
  semak(
    "kedudukan: gap minimum 1",
    ayatKedudukan(2, 90, { nama: "Y", skor: 90, kedudukan: 1 }) ===
      "in class. 1 pts to overtake Y for #1."
  );
  semak("kedudukan: tiada kedudukan => null", ayatKedudukan(0, 0, null) === null);
  semak(
    "kedudukan: kedudukan >= 2 tanpa baris atas => null",
    ayatKedudukan(3, 10, null) === null
  );
}

// 4. Ayat kad LIVE.
{
  semak(
    "live: tanpa pasukan",
    ayatKadLive("Generasi AI Madani", 23, false) ===
      "Generasi AI Madani · 23 classmates already in."
  );
  semak(
    "live: dengan pasukan",
    ayatKadLive("Kelas B", 5, true) ===
      "Kelas B · 5 classmates already in. Your team is waiting."
  );
}

// 5. Penapis status sesi (peserta hanya boleh masuk sesi belum tamat).
{
  semak("sesi: lobby boleh masuk", sesiBolehMasuk("lobby") === true);
  semak("sesi: asking boleh masuk", sesiBolehMasuk("asking") === true);
  semak("sesi: revealed boleh masuk", sesiBolehMasuk("revealed") === true);
  semak("sesi: ended TIDAK boleh masuk", sesiBolehMasuk("ended") === false);
  semak("sesi: status kosong selamat", sesiBolehMasuk(null) === false);
}

// 6. Pilih sesi terkini (jika >1 sesi langsung, papar yang terbaru).
{
  const sesi = [
    { code: "AAAA11", status: "lobby", started_at: "2026-10-15T10:00:00Z" },
    { code: "BBBB22", status: "asking", started_at: "2026-10-15T11:00:00Z" },
    { code: "CCCC33", status: "ended", started_at: "2026-10-15T12:00:00Z" },
  ];
  const pilihan = pilihSesiTerkini(sesi);
  semak(
    "sesi terkini: pilih asking 11:00, bukan ended",
    pilihan?.code === "BBBB22",
    pilihan?.code
  );
  semak(
    "sesi terkini: semua ended => null",
    pilihSesiTerkini([{ code: "DDDD44", status: "ended", started_at: "2026-10-15T12:00:00Z" }]) === null
  );
  semak("sesi terkini: senarai kosong => null", pilihSesiTerkini([]) === null);
  semak("sesi terkini: null selamat", pilihSesiTerkini(null) === null);
}

// 7. Warna jalur kelas: stabil dan kitar mengikut indeks.
{
  semak("warna: indeks 0 => #7c3aed", warnaKelas(0) === "#7c3aed");
  semak("warna: indeks 3 => #be185d", warnaKelas(3) === "#be185d");
  semak("warna: kitar 5 => #7c3aed", warnaKelas(5) === "#7c3aed");
  semak("warna: kitar 7 => #b45309", warnaKelas(7) === "#b45309");
  semak("warna: kitar 8 => #be185d", warnaKelas(8) === "#be185d");
  semak("warna: indeks negatif => pertama", warnaKelas(-1) === "#7c3aed");
}

console.log(`\nJumlah: ${bilangan}, gagal: ${gagal}`);
if (gagal > 0) process.exit(1);
