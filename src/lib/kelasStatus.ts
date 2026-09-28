/**
 * Fungsi tulen status, susunan dan tapisan kelas (V2-005).
 *
 * Tiada panggilan jaringan di sini: semuanya tulen supaya boleh diuji
 * dengan npx tsx scripts/selftest-kelas-status.ts tanpa pangkalan data.
 *
 * Takrif "tamat": ended_at bukan null ATAU is_archived benar
 * (kelas diarkib dianggap tamat untuk tujuan paparan). Takrif ini
 * sepadan dengan tiket V2-005; status di pangkalan data kekal
 * ended_at dan is_archived, tiada lajur baharu.
 */

/** Medan minimum yang fungsi di fail ini perlukan. */
export type KelasUntukStatus = {
  id: string;
  name: string;
  description: string | null;
  join_code: string;
  ended_at: string | null;
  is_archived: boolean;
  /** Pilihan: susunan mengikut aktiviti dengan kelas dari RPC aktiviti. */
  created_at?: string;
  last_activity_at?: string | null;
};

/** Satu baris daripada RPC qm_my_class_activity(). */
export type AktivitiKelas = {
  class_id: string;
  last_activity_at: string | null;
  pinned: boolean;
};

/** Status paparan kelas: aktif atau tamat. */
export function statusKelas(
  k: Pick<KelasUntukStatus, "ended_at" | "is_archived">,
): "aktif" | "tamat" {
  return k.ended_at != null || k.is_archived === true ? "tamat" : "aktif";
}

/**
 * Susun kelas: pin dahulu, kemudian last_activity_at menurun.
 * Kelas tanpa tarikh aktiviti diletakkan selepas yang bertarikh,
 * menggunakan created_at sebagai sandaran jika ada.
 * Senarai asal tidak diubah.
 */
export function susunKelas<T extends KelasUntukStatus>(
  senarai: T[],
  aktiviti: AktivitiKelas[] = [],
): T[] {
  const dipin = new Set(
    aktiviti.filter((a) => a.pinned).map((a) => a.class_id),
  );
  const masaAktiviti = new Map(
    aktiviti
      .filter((a) => a.last_activity_at != null)
      .map((a) => [a.class_id, a.last_activity_at as string]),
  );
  const masa = (k: T): string | null =>
    masaAktiviti.get(k.id) ?? k.last_activity_at ?? k.created_at ?? null;

  return [...senarai].sort((a, b) => {
    const pinA = dipin.has(a.id);
    const pinB = dipin.has(b.id);
    if (pinA !== pinB) return pinA ? -1 : 1;
    const tA = masa(a);
    const tB = masa(b);
    // Tiada tarikh diletakkan di hujung, kekal susunan asal di antara mereka.
    if (tA == null && tB == null) return 0;
    if (tA == null) return 1;
    if (tB == null) return -1;
    return tB.localeCompare(tA); // menurun; ISO 8601 boleh dibanding rentetan
  });
}

/**
 * Tapis kelas mengikut pertanyaan carian: padan nama, deskripsi dan
 * join_code, tidak peka huruf, jarak di hujung diabaikan.
 * Pertanyaan kosong memulangkan salinan senarai asal.
 */
export function tapisKelas<T extends KelasUntukStatus>(
  senarai: T[],
  q: string,
): T[] {
  const cq = (q ?? "").trim().toLowerCase();
  if (!cq) return [...senarai];
  return senarai.filter(
    (k) =>
      (k.name ?? "").toLowerCase().includes(cq) ||
      (k.description ?? "").toLowerCase().includes(cq) ||
      (k.join_code ?? "").toLowerCase().includes(cq),
  );
}