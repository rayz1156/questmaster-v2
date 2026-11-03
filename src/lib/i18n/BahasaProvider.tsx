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

/**
 * KZ-043 A3: hantar pilihan bahasa ke profil pengguna jika ada sesi.
 * Fire-and-forget: kegagalan rangkaian atau auth tidak boleh menghalang
 * pertukaran bahasa di pelayar, jadi ralat ditelan sepenuhnya.
 */
async function segerakBahasaProfil(bersih: Bahasa): Promise<void> {
  try {
    // Import dinamik supaya pembekal bahasa tidak menambah beban supabase-js
    // ke setiap bundel klien; ia hanya diperlukan semasa pertukaran bahasa.
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    await fetch('/api/profile/language', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bahasa: bersih }),
    });
  } catch {
    /* segerak profil gagal: kuki tempatan tetap cukup (KZ-043 A3) */
  }
}

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
      tulisKukiBahasa(bersih);
      // Segerak ke profil (KZ-043 A3): fire-and-forget, gagal pun tak apa.
      void segerakBahasaProfil(bersih).catch(() => {});
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

/**
 * KZ-043 A4: tulis kuki `kz_lang` dan salinan localStorage.
 * Dieksport supaya halaman log masuk boleh menulis kuki daripada nilai
 * profil tanpa menyalin logik kuki (dan atributnya) ke tempat lain.
 * Selamat dipanggil di pelayar sahaja; tiada kesan di pelayan.
 */
export function tulisKukiBahasa(bersih: Bahasa): void {
  const sah = sahBahasa(bersih);
  if (typeof document !== 'undefined') {
    document.cookie = `${NAMA_KUKI}=${sah}; path=/; max-age=${TAHUN_SAAT}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(NAMA_STORAN, sah);
    } catch {
      /* storan disekat: kuki tetap cukup */
    }
  }
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