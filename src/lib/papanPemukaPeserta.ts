/**
 * Logik tulen papan pemuka peserta (KZ-018).
 *
 * Semua fungsi di sini tulen: tiada Supabase, tiada jaringan, tiada
 * ketergantungan React. Halaman `src/app/participant/home/page.tsx`
 * memanggil fungsi ini dengan data yang diambil melalui fungsi sedia
 * ada dalam `src/lib/data.ts`. Ujian: `scripts/selftest-kz018.ts`.
 */

import type { Hunt } from "./types";

/**
 * Inisial nama untuk avatar: huruf pertama dua perkataan pertama.
 * Satu perkataan menghasilkan satu huruf; rentetan kosong menghasilkan "?".
 * (Kekal serupa dengan `initials` lama di halaman home supaya paparan
 * tidak berubah secara senyap.)
 */
export function inisial(nama: string): string {
  const parts = (nama || "").trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}

/**
 * Kedudukan saya dalam senarai markah yang sudah diisih menurun.
 * Seri dikira kedudukan yang sama: 1 + bilangan baris dengan markah
 * lebih tinggi daripada baris saya. Memulangkan 0 jika saya tiada
 * dalam senarai atau `myId` kosong (tiada pasukan / tiada baris).
 */
export function kedudukanSaya<T>(
  baris: T[],
  idOf: (r: T) => string,
  skorOf: (r: T) => number,
  myId: string | null
): number {
  if (!myId) return 0;
  const barisSaya = baris.find((r) => idOf(r) === myId);
  if (!barisSaya) return 0;
  const skorSaya = skorOf(barisSaya) || 0;
  return 1 + baris.filter((r) => (skorOf(r) || 0) > skorSaya).length;
}

/** Satu baris papan pendahulu yang sudah siap untuk dipaparkan. */
export type BarisPendahulu<T> = {
  baris: T;
  kedudukan: number;
  saya: boolean;
};

/** Hasil 5 teratas dengan baris sendiri yang mungkin berasingan. */
export type PendahuluPemotongan<T> = {
  atas: BarisPendahulu<T>[];
  saya: BarisPendahulu<T> | null;
  /** Benar jika baris saya berada di luar 5 teratas (perlu pemisah). */
  terpisah: boolean;
};

/**
 * Potong 5 teratas daripada senarai berisih, dan pastikan baris saya
 * sentiasa muncul: sama ada dalam 5 teratas itu sendiri, atau sebagai
 * `saya` di bawah dengan pemisah (`terpisah = true`).
 */
export function atas5DenganSaya<T>(
  baris: T[],
  idOf: (r: T) => string,
  skorOf: (r: T) => number,
  myId: string | null,
  had: number = 5
): PendahuluPemotongan<T> {
  const atas: BarisPendahulu<T>[] = baris.slice(0, had).map((r) => ({
    baris: r,
    // Seri berkongsi kedudukan: 1 + bilangan baris dengan markah lebih tinggi.
    kedudukan: 1 + baris.filter((x) => (skorOf(x) || 0) > (skorOf(r) || 0)).length,
    saya: !!myId && idOf(r) === myId,
  }));
  if (!myId) return { atas, saya: null, terpisah: false };

  const dalamAtas = atas.some((b) => b.saya);
  if (dalamAtas) return { atas, saya: null, terpisah: false };

  const idx = baris.findIndex((r) => idOf(r) === myId);
  if (idx < 0) return { atas, saya: null, terpisah: false };

  const kedudukan = kedudukanSaya(baris, idOf, skorOf, myId);
  const saya: BarisPendahulu<T> = { baris: baris[idx], kedudukan, saya: true };
  return { atas, saya, terpisah: true };
}

/**
 * Pembahagian tab aktiviti (KZ-018): status "siap" aktiviti tidak boleh
 * ditentukan dengan pasti (siap direkod ikut pasukan dalam
 * `qm_team_quest_completions`, tiada rekod per pengguna dan tiada rekod
 * untuk kelas mod individu), maka tab ialah "Active" / "Ended"
 * berdasarkan `status` dan `end_at` aktiviti.
 *
 * - Aktif: status "active" DAN (tiada end_at, atau end_at masih depan).
 * - Tamat: status "archived", atau end_at telah lepas.
 * - Draf: tidak dipapar ke peserta pada papan pemuka (draf peribadi
 *   pendidik; senarai `listQuestsForParticipant` mengembalikan semua).
 */
export type TabAktiviti<T extends Pick<Hunt, "status" | "end_at" | "start_at">> = {
  aktif: T[];
  tamat: T[];
};

export function bahagiAktiviti<
  T extends Pick<Hunt, "status" | "end_at" | "start_at">,
>(aktiviti: T[] | null | undefined, kini: Date = new Date()): TabAktiviti<T> {
  const aktif: T[] = [];
  const tamat: T[] = [];
  for (const h of aktiviti || []) {
    if (h.status === "draft") continue;
    const sudahTamat =
      h.status !== "active" ||
      (h.end_at ? new Date(h.end_at).getTime() <= kini.getTime() : false);
    (sudahTamat ? tamat : aktif).push(h);
  }
  return { aktif, tamat };
}

/**
 * Bilangan item yang memenuhi predikat. Digunakan untuk cip
 * "N active classes" dalam banner; predikat ialah `statusKelas`
 * halaman supaya logik kelas kekal di satu tempat (`kelasStatus.ts`).
 */
export function kiraBila<T>(baris: T[] | null | undefined, predikat: (r: T) => boolean): number {
  let n = 0;
  for (const r of baris || []) if (predikat(r)) n++;
  return n;
}

/**
 * Label tarikh baris maklumat kad aktiviti: pendidik boleh set
 * `start_at` / `end_at` (lihat `src/lib/types.ts:3`). Memulangkan
 * rentetan ringkas untuk kad; kosong jika kedua-dua tarikh tiada.
 */
export function peneranganTarikh(
  mula: string | null | undefined,
  tamat: string | null | undefined
): string {
  if (mula && tamat) return `Schedule: ${mula} to ${tamat}`;
  if (tamat) return `Due: ${tamat}`;
  if (mula) return `Starts: ${mula}`;
  return "";
}

/* ============================================================
 * Fungsi KZ-018b (papan pemuka Versi 2, fokus satu tindakan).
 * Semua tulen; tiada Supabase, tiada jaringan.
 * ============================================================ */

/**
 * Aktiviti "NEXT UP" (KZ-018b): antara aktiviti aktif, pilih yang
 * `end_at` terdekat. Aktiviti tanpa `end_at` diletak selepas yang
 * bertarikh; antara mereka, pilih yang paling baharu dicipta
 * "(tiada end_at: yang terbaru)". Memulangkan null jika senarai kosong.
 */
export function pilihAktivitiSeterusnya<
  T extends Pick<Hunt, "end_at" | "created_at">,
>(aktif: T[] | null | undefined): T | null {
  const senarai = aktif || [];
  if (senarai.length === 0) return null;
  const masa = (r: T) => {
    const t = r.end_at ? new Date(r.end_at).getTime() : Number.NaN;
    return Number.isNaN(t) ? null : t;
  };
  // Bertarikh dahulu (end_at terdekat), kemudian yang tanpa tarikh ikut
  // created_at terbaru. Baris dengan end_at terdekat menang keseluruhan.
  const bertarikh = senarai
    .filter((r) => masa(r) !== null)
    .sort((a, b) => (masa(a) as number) - (masa(b) as number));
  if (bertarikh.length > 0) return bertarikh[0];
  const tanpaTarikh = senarai
    .filter((r) => masa(r) === null)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return tanpaTarikh[0] ?? null;
}

/** Hasil label tarikh baris quest. `segera` = merah tebal (tamat <= 1 hari). */
export type LabelTarikh = { label: string; segera: boolean };

/**
 * Label tarikh ringkas baris "My Quests" (KZ-018b), gaya pratonton:
 * "Due tomorrow", "Due in 5 days", "Due 24 Oct" untuk aktif;
 * "Ended 8 Oct" untuk yang tamat; "" jika tiada tarikh.
 * `segera` benar jika tarikh akhir dalam <= 1 hari atau telah lepas
 * (butang label dipapar MERAH #b91c1c tebal).
 */
export function labelTarikhQuest(
  tamatPada: string | null | undefined,
  sudahTamat: boolean,
  kini: Date = new Date()
): LabelTarikh {
  const formatTarikh = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };
  if (sudahTamat) {
    const teks = tamatPada ? `Ended ${formatTarikh(tamatPada)}` : "Ended";
    return { label: teks, segera: false };
  }
  if (!tamatPada) return { label: "", segera: false };
  const tarikh = new Date(tamatPada);
  if (Number.isNaN(tarikh.getTime())) return { label: "", segera: false };
  const hari = Math.floor((tarikh.getTime() - kini.getTime()) / 86_400_000);
  if (hari <= 1) {
    // Hari ini, esok atau telah lepas: segera (merah).
    if (hari <= 0) return { label: "Due today", segera: true };
    return { label: "Due tomorrow", segera: true };
  }
  if (hari <= 7) return { label: `Due in ${hari} days`, segera: false };
  return { label: `Due ${formatTarikh(tamatPada)}`, segera: false };
}

/**
 * Ayat kotak amber kedudukan (KZ-018b). Mengambil kedudukan saya,
 * markah baris di atas (jika ada) dan kedudukan baris itu. Memulangkan
 * null jika tiada kedudukan (kotak amber disembunyikan).
 * - Kedudukan 1: "in class. You are leading. Keep it up."
 * - Lain: "in class. {gap} pts to overtake {nama} for #{kedudukan atas}."
 *   `kedudukanAtas` ialah kedudukan sebenar baris di atas, bukan
 *   rank-1 buta, supaya ayat kekal betul bila ada seri.
 */
export function ayatKedudukan(
  kedudukan: number,
  skorSaya: number,
  barisAtas: { nama: string; skor: number; kedudukan: number } | null
): string | null {
  if (kedudukan <= 0) return null;
  if (kedudukan === 1) return "in class. You are leading. Keep it up.";
  if (!barisAtas) return null;
  const gap = Math.max(1, (barisAtas.skor || 0) - (skorSaya || 0));
  return `in class. ${gap} pts to overtake ${barisAtas.nama} for #${barisAtas.kedudukan}.`;
}

/**
 * Ayat kecil kad LIVE (KZ-018b): "{class name} · {n} classmates already
 * in." ditambah " Your team is waiting." jika peserta ada pasukan.
 */
export function ayatKadLive(namaKelas: string, bilPemain: number, adaPasukan: boolean): string {
  // Teks tepat ikut tiket: "{class name} · {n} classmates already in."
  const asas = `${namaKelas} · ${Math.max(0, bilPemain)} classmates already in.`;
  return adaPasukan ? `${asas} Your team is waiting.` : asas;
}

/**
 * Status sesi kuiz langsung yang boleh dimasuki peserta: lobi, soalan
 * sedang ditanya, atau jawapan didedahkan. "ended" tidak boleh dimasuki.
 * (Nilai status: migrasi 0017 baris 61.)
 */
export const SESI_BOLEH_MASUK: readonly string[] = ["lobby", "asking", "revealed"];

export function sesiBolehMasuk(status: string | null | undefined): boolean {
  return !!status && SESI_BOLEH_MASUK.includes(status);
}

/**
 * Sesi LIVE terkini (KZ-018b): antara sesi yang boleh dimasuki, pilih
 * yang paling baharu mengikut `started_at` (waktu sesi dicipta hos).
 * Yang lain dipaparkan sebagai pautan "Also live: ..." di bawah butang.
 */
export function pilihSesiTerkini<
  T extends { status: string; started_at: string | null },
>(sesi: T[] | null | undefined): T | null {
  const senarai = (sesi || []).filter((s) => sesiBolehMasuk(s.status));
  if (senarai.length === 0) return null;
  const masa = (s: T) => {
    const t = s.started_at ? new Date(s.started_at).getTime() : Number.NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  return senarai.sort((a, b) => masa(b) - masa(a))[0];
}

/**
 * Warna jalur stabil ikut kelas (KZ-018b): palet tetap dipilih dengan
 * indeks kelas dalam senarai kelas peserta (bukan id UUID, supaya warna
 * tidak melompat antara peranti).
 */
const PALET_KELAS: readonly string[] = ["#7c3aed", "#0e7490", "#b45309", "#be185d", "#15803d"];

export function warnaKelas(indeks: number): string {
  if (indeks < 0) return PALET_KELAS[0];
  return PALET_KELAS[indeks % PALET_KELAS.length];
}

/* ============================================================
 * Fungsi KZ-020 (papan pemuka LMS). Semua tulen; tiada Supabase,
 * tiada jaringan. Ujian: scripts/selftest-kz020.ts.
 * ============================================================ */

/**
 * Pasangan warna untuk avatar/petak inisial ikut indeks (KZ-020):
 * latar lembut dan warna teks/aksen ke atasnya. Enam pasangan tetap,
 * dipilih mengikut indeks baris supaya stabil.
 */
export type PasanganWarna = { latar: string; teks: string };

const PALET_INDEKS: readonly PasanganWarna[] = [
  { latar: "#ebe2ff", teks: "#854fff" },
  { latar: "#e5e9ff", teks: "#6576ff" },
  { latar: "#d2f9ee", teks: "#1ee0ac" },
  { latar: "#fdf3d3", teks: "#f4bd0e" },
  { latar: "#fbe5e3", teks: "#e85347" },
  { latar: "#ceeef6", teks: "#09c2de" },
];

export function warnaIndeks(indeks: number): PasanganWarna {
  if (indeks < 0) return PALET_INDEKS[0];
  return PALET_INDEKS[indeks % PALET_INDEKS.length];
}

/**
 * Satu baris carta bar yang sudah siap untuk dipaparkan (KZ-020).
 * `nisbah` ialah tinggi bar relatif kepada bar tertinggi (0 hingga 1).
 */
export type BarisCarta<T> = {
  baris: T;
  label: string;
  skor: number;
  nisbah: number;
  saya: boolean;
};

/**
 * Data carta bar markah kelas (KZ-020): isih menurun, ambil `had` baris
 * teratas, dan kira nisbah tinggi setiap bar terhadap markah tertinggi.
 * Bar tertinggi sentiasa nisbah 1; senarai kosong atau semua markah 0
 * menghasilkan nisbah 0 untuk semua bar (baris masih dipapar sebagai
 * tunas kecil supaya pengguna tahu ada berapa entri).
 */
export function dataCartaBar<T>(
  baris: T[] | null | undefined,
  idOf: (r: T) => string,
  labelOf: (r: T) => string,
  skorOf: (r: T) => number,
  myId: string | null,
  had: number = 12
): BarisCarta<T>[] {
  const senarai = (baris || [])
    .slice()
    .sort((a, b) => (skorOf(b) || 0) - (skorOf(a) || 0))
    .slice(0, Math.max(1, had));
  const maks = senarai.reduce((m, r) => Math.max(m, skorOf(r) || 0), 0);
  return senarai.map((r) => ({
    baris: r,
    label: labelOf(r),
    skor: skorOf(r) || 0,
    nisbah: maks > 0 ? (skorOf(r) || 0) / maks : 0,
    saya: !!myId && idOf(r) === myId,
  }));
}