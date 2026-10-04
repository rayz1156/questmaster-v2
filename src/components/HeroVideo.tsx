'use client';
import { useState } from 'react';
import HeroPreview from '@/components/HeroPreview';
import { VIDEO_PENGENALAN, type BahasaVideo } from '@/lib/video-kuizen';

/**
 * Blok media pada halaman utama.
 *
 * Video hanya dimuatkan selepas butang main ditekan. Sebelum itu yang
 * dipaparkan ialah HeroPreview, pratonton produk dalam HTML dan CSS yang
 * boleh dibaca enjin carian dan tidak menarik apa apa bait video.
 *
 * Bahasa video mengikut bahasa halaman: halaman BM memainkan video
 * pengenalan penuh BM, halaman Inggeris memainkan versi Inggeris.
 */

const TEKS: Record<BahasaVideo, { tajuk: string; main: string; sedang: string; label: string }> = {
  ms: {
    tajuk: 'Lihat Kuizen dalam aksi',
    main: 'Tekan untuk main video pengenalan',
    sedang: 'Video pengenalan',
    label: 'Main video pengenalan Kuizen',
  },
  en: {
    tajuk: 'See Kuizen in action',
    main: 'Press play to watch the intro video',
    sedang: 'Intro video',
    label: 'Play the Kuizen intro video',
  },
};

export default function HeroVideo({ bahasa = 'ms' }: { bahasa?: BahasaVideo }) {
  const [main, setMain] = useState(false);
  const video = VIDEO_PENGENALAN[bahasa];
  const t = TEKS[bahasa];

  return (
    <div className="rounded-[22px] bg-[#EFEAFB] p-4 sm:p-8">
      <div className="relative">
        {main ? (
          <div className="rounded-[18px] overflow-hidden bg-black aspect-video">
            <video
              src={video.src}
              poster={video.poster}
              controls
              autoPlay
              playsInline
              preload="auto"
              className="w-full h-full"
              aria-label={t.sedang}
            >
              <track kind="subtitles" src={video.sarikata} srcLang={bahasa} label={bahasa === 'ms' ? 'Bahasa Melayu' : 'English'} />
            </video>
          </div>
        ) : (
          <>
            <HeroPreview bahasa={bahasa} />
            <button
              type="button"
              onClick={() => setMain(true)}
              aria-label={t.label}
              className="absolute inset-0 flex items-center justify-center group rounded-[18px] bg-ink/0 transition hover:bg-ink/10"
            >
              <span className="w-16 h-16 rounded-full bg-brand-purple text-white flex items-center justify-center shadow-lg transition group-hover:scale-105">
                <svg width="20" height="22" viewBox="0 0 20 22" fill="currentColor" aria-hidden="true">
                  <path d="M19 9.27a2 2 0 0 1 0 3.46L3 21.99a2 2 0 0 1-3-1.73V1.74A2 2 0 0 1 3 .01l16 9.26Z" />
                </svg>
              </span>
            </button>
          </>
        )}
      </div>

      <div className="mt-6 text-center">
        <p className="text-[17px] text-ink">{t.tajuk}</p>
        <p className="text-[13px] text-ink-faint mt-1">{main ? t.sedang : t.main}</p>
      </div>
    </div>
  );
}
