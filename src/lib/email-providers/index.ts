/**
 * Antara muka penyesuai penyedia e-mel.
 *
 * Prinsip reka bentuk KZ-005: satu penyedia, dibuat sempurna. Encharge
 * sahaja buat masa ini, tetapi kontrak di sini sengaja generik supaya
 * penyedia lain (Brevo, Mailchimp) kemudian cuma perlu fail baharu yang
 * melaksanakan EmailProvider dan satu baris dalam PROVIDERS.
 *
 * Peraturan keselamatan untuk semua pelaksanaan:
 * 1. URL penyedia mesti tetap dalam kod, TIDAK pernah daripada input,
 *    supaya kunci API tidak dihantar ke pelayan yang dikawal penyerang.
 * 2. Kunci tidak pernah dilog dan tidak pernah muncul dalam mesej ralat
 *    atau nilai pulangan.
 */

/** Kenalan yang dihantar kepada penyedia. */
export type EmailProviderContact = {
  email: string;
  firstName: string;
  lastName: string;
  /** Tag penyedia; pelaksanaan boleh menyertai dengan pemisah sendiri. */
  tags: string[];
};

/** Hasil pengesahan kunci: status HTTP mentah supaya pemanggil boleh membezakan "tidak sah" daripada "penyedia bermasalah". */
export type KeyValidation = { ok: boolean; status: number };

/** Hasil penghantaran sekumpulan kenalan. */
export type UpsertResult = { sent: number; failed: number; errors: string[] };

export interface EmailProvider {
  id: string;
  label: string;
  /** Semak sama ada kunci sah. 200 = sah; 401/403 = tidak sah; lain-lain = ralat penyedia. */
  validateKey(key: string): Promise<KeyValidation>;
  /** Cipta/kemas kini kenalan. Mesej ralat TIDAK boleh mengandungi e-mel penuh mahupun kunci. */
  upsertContacts(key: string, contacts: EmailProviderContact[]): Promise<UpsertResult>;
}

import { encharge } from "./encharge";

export { encharge };

/** Penyedia yang dikenali, dikunci mengikut id. */
export const PROVIDERS: Record<string, EmailProvider> = { encharge };

/**
 * Pecah nama penuh kepada firstName / lastName untuk Encharge:
 * perkataan pertama jadi firstName, baki jadi lastName.
 */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Tukar teks kepada slug: huruf kecil, a-z 0-9 dan sengkang sahaja. */
export function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Tag kelas untuk eksport: "kuizen" dan "kuizen-<slug nama kelas>".
 * Panjang setiap tag dihadkan kepada 40 aksara mengikut spesifikasi.
 */
export function classTags(namaKelas: string): string[] {
  const slug = slugify(namaKelas);
  const tagKelas = ("kuizen-" + slug).replace(/-+$/g, "").slice(0, 40);
  return slug ? ["kuizen", tagKelas] : ["kuizen"];
}
