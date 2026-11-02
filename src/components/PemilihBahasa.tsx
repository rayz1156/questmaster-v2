'use client';

/**
 * Pemilih bahasa (KZ-040): butang kecil "EN | BM".
 *
 * Bahasa semasa ditonjolkan (tebal), bahasa satu lagi boleh diklik. Satu
 * klik melengkapkan penukaran, tiada menu lanjutan, supaya pengguna boleh
 * bertukar dalam satu ketukan pada telefon.
 *
 * `aria-label` ditulis dalam bahasa semasa supaya pembaca skrin mengumumkan
 * tujuan butang dalam bahasa yang sama dengan paparan skrin.
 */

import { useBahasa } from '@/lib/i18n/BahasaProvider';
import type { Bahasa } from '@/lib/i18n';

export default function PemilihBahasa({ className = '' }: { className?: string }) {
  const { bahasa, tukarBahasa, t } = useBahasa();
  const akan: Bahasa = bahasa === 'en' ? 'ms' : 'en';

  const gayaSisi = (aktif: boolean) =>
    aktif ? 'font-bold text-ink' : 'font-medium text-ink-faint hover:text-ink';

  return (
    <button
      type="button"
      onClick={() => tukarBahasa(akan)}
      aria-label={t('nav.tukarBahasa')}
      title={bahasa === 'en' ? 'Bahasa Melayu' : 'English'}
      className={`inline-flex select-none items-center gap-1 rounded-md px-2 py-1 text-[13px] transition hover:bg-canvas ${className}`}
    >
      <span className={gayaSisi(bahasa === 'en')}>EN</span>
      <span aria-hidden="true" className="text-ink-faint">|</span>
      <span className={gayaSisi(bahasa === 'ms')}>BM</span>
    </button>
  );
}