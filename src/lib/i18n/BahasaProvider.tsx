'use client';

/**
 * Penyedia bahasa untuk komponen klien (KZ-040).
 *
 * Layout akar membaca bahasa awal daripada kuki di pelayan menerusi
 * `bahasaPelayan()` dan menghantarnya sebagai `bahasaAwal`, jadi HTML pertama
 * sudah betul tanpa kelipan English. Di pelayar, `tukarBahasa` menulis kuki
 * `kz_lang` (path /, satu tahun, SameSite=Lax) dan `localStorage`, kemudian
 * `router.refresh()` supaya komponen pelayan (metadata, `lang`) ikut bahasa
 * baharu serta-merta.
 */

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { terjemah, BAHASA_LALAI, NAMA_KUKI, NAMA_STORAN, sahBahasa, type Bahasa, type KunciKamus } from './index';

export type FungsiT = (kunci: KunciKamus, pembolehubah?: Record<string, string | number>) => string;

type KonteksBahasa = {
  bahasa: Bahasa;
  tukarBahasa: (b: Bahasa) => void;
  t: FungsiT;
};

const Ctx = createContext<KonteksBahasa | null>(null);

/** Tahun saat: kuki bahasa kekal selama setahun penuh. */
const TAHUN_SAAT = 365 * 24 * 60 * 60;

export function BahasaProvider({
  children,
  bahasaAwal = BAHASA_LALAI,
}: {
  children: ReactNode;
  /** Bahasa dari kuki, dibaca layout akar di pelayan. */
  bahasaAwal?: Bahasa;
}) {
  const router = useRouter();
  // `bahasa` kekal dalam keadaan React (bukan dibaca semasa render) supaya
  // pertukaran bahasa tidak mengganggu pertengahan navigasi pelayar.
  const bahasa = sahBahasiValid(bahasaAwal);

  const tukarBahasa = useCallback(
    (b: Bahasa) => {
      const bersih = sahBahasa(b);
      if (typeof document !== 'undefined') {
        document.cookie = `${NAMA_KUKI}=${bersih}; path=/; max-age=${TAHUN_SAAT}; SameSite=Lax`;
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(NAMA_STORAN, bersih);
        } catch {
          /* storan disekat: kuki tetap cukup */
        }
      }
      // Refresh supaya komponen pelayan (html lang, metadata) ikut bahasa baharu.
      router.refresh();
    },
    [router]
  );

  const t = useCallback<FungsiT>(
    (kunci, pembolehubah) => terjemah(bahasa, kunci, pembolehubah),
    [bahasa]
  );

  const nilai = useMemo<KonteksBahasa>(() => ({ bahasa, tukarBahasa, t }), [bahasa, tukarBahasa, t]);

  return <Ctx.Provider value={nilai}>{children}</Ctx.Provider>;
}

/** Pastikan bahasa awal sentiasa 'en' atau 'ms'. */
function sahBahasiValid(b: unknown): Bahasa {
  return sahBahasa(b);
}

/** Hook bahasa untuk komponen klien. Jatuh ke English jika tiada penyedia. */
export function useBahasa(): KonteksBahasa {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // Fallback defensif (sepatutnya tidak berlaku: layout akar sentiasa membalut).
  const t = ((kunci: KunciKamus, pembolehubah?: Record<string, string | number>) =>
    terjemah(BAHASA_LALAI, kunci, pembolehubah)) as FungsiT;
  return { bahasa: BAHASA_LALAI, tukarBahasa: () => {}, t };
}