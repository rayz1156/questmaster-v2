/**
 * Fon papan pemuka peserta (KZ-018b), ikut pratonton Versi 2:
 * Bricolage Grotesque untuk tajuk, nombor besar dan nombor kedudukan;
 * Plus Jakarta Sans untuk badan.
 *
 * Dimuatkan melalui next/font/google (terbina dalam Next, bukan pakej
 * npm baharu) dan hanya dikenakan pada bekas papan pemuka ini melalui
 * pembolehubah CSS, bukan global (badan aplikasi kekal Inter,
 * lihat src/app/layout.tsx).
 *
 * Dua-dua fon ini berubah-ubah (variable), jadi tiada `weight` diberi:
 * berat dijana melalui `font-weight` pada elemen.
 */

import { Bricolage_Grotesque, Plus_Jakarta_Sans } from "next/font/google";

export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--pp-bricolage",
  display: "swap",
});

export const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--pp-jakarta",
  display: "swap",
});

/** Kelas utiliti fon tajuk/nombor besar (Bricolage Grotesque). */
export const fonTajuk = "font-[family-name:var(--pp-bricolage)]";

/** Kelas utiliti fon badan (Plus Jakarta Sans). */
export const fonBadan = "font-[family-name:var(--pp-jakarta)]";
