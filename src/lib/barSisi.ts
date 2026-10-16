"use client";

/**
 * Keadaan bar sisi desktop: penuh atau dikecilkan kepada lajur ikon,
 * seperti ChatGPT/Claude. Disimpan dalam storan pelayar penonton sahaja;
 * jika storan disekat, bar sisi kembali penuh tanpa ralat.
 */

import { useCallback, useEffect, useState } from "react";

/** Kunci storan pelayar untuk keadaan bar sisi desktop. */
export const KUNCI_BAR_SISI = "kz-bar-sisi-kecil";

/** Tafsir nilai storan: hanya "1" bermaksud bar sisi dikecilkan. */
export function tafsirKecil(nilai: string | null | undefined): boolean {
  return nilai === "1";
}

/** Nilai yang disimpan untuk satu keadaan. */
export function nilaiSimpan(kecil: boolean): string {
  return kecil ? "1" : "0";
}

export function useBarSisiKecil(): [boolean, () => void] {
  const [kecil, setKecil] = useState(false);

  useEffect(() => {
    try {
      setKecil(tafsirKecil(window.localStorage.getItem(KUNCI_BAR_SISI)));
    } catch {
      /* storan disekat: kekal penuh */
    }
  }, []);

  const togol = useCallback(() => {
    setKecil((k) => {
      const baru = !k;
      try {
        window.localStorage.setItem(KUNCI_BAR_SISI, nilaiSimpan(baru));
      } catch {
        /* storan disekat: keadaan hanya untuk sesi ini */
      }
      return baru;
    });
  }, []);

  return [kecil, togol];
}
