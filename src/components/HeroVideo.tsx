'use client';
import { useState } from 'react';
import HeroPreview from '@/components/HeroPreview';

/**
 * Blok media pada halaman utama.
 *
 * Iframe hanya dimuatkan selepas butang main ditekan. Corak itu
 * disengajakan: iframe pihak ketiga yang dimuatkan terus menarik beratus
 * kilobait dan membuat permintaan rangkaian sebelum pelawat meminta apa apa,
 * dan halaman utama ialah kesan pertama yang paling mahal untuk dilambatkan.
 *
 * Sebelum ditekan, yang dipaparkan ialah HeroPreview, iaitu pratonton produk
 * yang dibina dengan HTML dan CSS. Teks di dalamnya boleh dibaca enjin
 * carian, tidak seperti bingkai video.
 *
 * Nota tentang autoplay: Livid membaca parameter carian `autoplay` pada URL
 * embed. Ini sudah disahkan. Tanpa parameter itu pelawat terpaksa menekan
 * main dua kali, sekali pada muka depan kita dan sekali lagi dalam pemain.
 */

/** Embed Livid. Nisbah asal video ialah 1280 x 632. */
const VIDEO_EMBED_URL: string | null = 'https://livid.com/embed/v_fx4XKkYoaX';

/** Nisbah bingkai video, diambil daripada kod embed asal. */
const NISBAH = '1280 / 632';

export default function HeroVideo() {
  const [main, setMain] = useState(false);

  return (
    <div className="rounded-[22px] bg-[#EFEAFB] p-4 sm:p-8">
      <div className="relative">
        {main && VIDEO_EMBED_URL ? (
          <div
            className="rounded-[18px] overflow-hidden bg-black"
            style={{ aspectRatio: NISBAH }}
          >
            <iframe
              src={VIDEO_EMBED_URL + (VIDEO_EMBED_URL.includes('?') ? '&' : '?') + 'autoplay=1'}
              title="Video pengenalan Kuizen"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="w-full h-full border-0"
            />
          </div>
        ) : (
          <>
            <HeroPreview />
            {VIDEO_EMBED_URL && (
              <button
                type="button"
                onClick={() => setMain(true)}
                aria-label="Main video pengenalan Kuizen"
                className="absolute inset-0 flex items-center justify-center group rounded-[18px] bg-ink/0 transition hover:bg-ink/10"
              >
                <span className="w-16 h-16 rounded-full bg-brand-purple text-white flex items-center justify-center shadow-lg transition group-hover:scale-105">
                  <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
                    <path d="M19 9.27a2 2 0 0 1 0 3.46L3 21.99a2 2 0 0 1-3-1.73V1.74A2 2 0 0 1 3 .01l16 9.26Z" />
                  </svg>
                </span>
              </button>
            )}
          </>
        )}
      </div>

      <div className="mt-6 text-center">
        <p className="text-[17px] text-ink">Lihat Kuizen dalam aksi</p>
        <p className="text-[13px] text-ink-faint mt-1">
          {main ? 'Video pengenalan' : 'Tekan untuk main video pengenalan'}
        </p>
      </div>
    </div>
  );
}
