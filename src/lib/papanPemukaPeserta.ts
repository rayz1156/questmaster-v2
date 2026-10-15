/**
 * Logik tulen papan pemuka peserta (KZ-018).
 *
 * Semua fungsi di sini tulen: tiada Supabase, tiada jaringan, tiada
 * ketergantungan React. Halaman `src/app/participant/home/page.tsx`
 * dan komponen `src/components/participant-home/*` memanggil fungsi
 * ini dengan data yang diambil melalui fungsi sedia ada dalam
 * `src/lib/data.ts`. Ujian: `scripts/selftest-kz018.ts`.
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
  const atas: BarisPendahulu<T>[] = baris.slice(0, had).map((r, i) => ({
    baris: r,
    kedudukan: i + 1,
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