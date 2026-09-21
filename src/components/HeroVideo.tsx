'use client';
import { useState } from 'react';
import HeroPreview from '@/components/HeroPreview';

/**
 * Blok media pada halaman utama.
 *
 * Pautan embed video belum diberikan. Sehingga ia ada, blok ini memaparkan
 * pratonton produk sahaja, tanpa butang main. Butang main yang tidak
 * memainkan apa apa lebih buruk daripada tiada butang langsung.
 *
 * Apabila pautan itu dimasukkan ke dalam VIDEO_EMBED_URL di bawah, butang
 * main muncul dan iframe hanya dimuatkan selepas ditekan. Corak itu
 * disengajakan: iframe YouTube yang dimuatkan terus menarik beratus kilobait
 * dan menanam kuki sebelum pelawat meminta apa apa.
 */

/** Contoh: "https://www.youtube.com/embed/XXXXXXXXXXX" */
const VIDEO_EMBED_URL: string | null = null;

export default function HeroVideo() {
  const [main, setMain] = useState(false);

  return (
    <div className="rounded-[22px] bg-[#EFEAFB] p-4 sm:p-8">
      <div className="relative">
        {main && VIDEO_EMBED_URL ? (
          <div className="rounded-[18px] overflow-hidden bg-black aspect-video">
            <iframe
              src={VIDEO_EMBED_URL + (VIDEO_EMBED_URL.includes('?') ? '&' : '?') + 'autoplay=1'}
              title="Video pengenalan Kuizen"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
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
                className="absolute inset-0 flex items-center justify-center group"
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
          {VIDEO_EMBED_URL ? 'Video pengenalan' : 'Video pengenalan akan menyusul'}
        </p>
      </div>
    </div>
  );
}
