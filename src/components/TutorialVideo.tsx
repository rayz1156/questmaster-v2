'use client';
import { useRef, useState } from 'react';
import { VIDEO_TUTORIAL, formatMasa, type BahasaVideo } from '@/lib/video-kuizen';

/**
 * Video tutorial penuh Kuizen dengan pilihan dua bahasa dan senarai bab.
 * Bahasa lalai mengikut bahasa halaman yang memaparkannya. Menekan bab
 * melompat terus ke masa itu dalam video.
 */

const TEKS: Record<BahasaVideo, { tajuk: string; sub: string; bab: string }> = {
  ms: {
    tajuk: 'Video tutorial',
    sub: 'Panduan lengkap Kuizen dalam kira kira empat minit.',
    bab: 'Bab',
  },
  en: {
    tajuk: 'Video tutorial',
    sub: 'A complete walkthrough of Kuizen in about four minutes.',
    bab: 'Chapters',
  },
};

export default function TutorialVideo({ bahasaAwal = 'en' }: { bahasaAwal?: BahasaVideo }) {
  const [bahasa, setBahasa] = useState<BahasaVideo>(bahasaAwal);
  const ref = useRef<HTMLVideoElement>(null);
  const v = VIDEO_TUTORIAL[bahasa];
  const t = TEKS[bahasa];

  const lompat = (saat: number) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = saat;
    void el.play().catch(() => {});
  };

  return (
    <section className="rounded-2xl border border-hairline bg-white p-4 sm:p-6" lang={bahasa}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold tracking-tight text-ink">{t.tajuk}</h2>
          <p className="text-sm text-ink-muted mt-0.5">{t.sub}</p>
        </div>
        <div role="tablist" aria-label="Language" className="inline-flex rounded-full border border-hairline p-0.5">
          {(['ms', 'en'] as BahasaVideo[]).map((b) => (
            <button
              key={b}
              role="tab"
              type="button"
              aria-selected={bahasa === b}
              onClick={() => setBahasa(b)}
              className={`text-sm font-medium rounded-full px-3 py-1 transition ${
                bahasa === b ? 'bg-brand-purple text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {b === 'ms' ? 'Bahasa Melayu' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl overflow-hidden bg-black aspect-video">
        <video
          key={bahasa}
          ref={ref}
          src={v.src}
          poster={v.poster}
          controls
          playsInline
          preload="none"
          className="w-full h-full"
        >
          <track kind="subtitles" src={v.sarikata} srcLang={bahasa} label={bahasa === 'ms' ? 'Bahasa Melayu' : 'English'} />
        </video>
      </div>

      <details className="mt-4 group">
        <summary className="cursor-pointer text-sm font-medium text-ink select-none">
          {t.bab} ({v.bab.length})
        </summary>
        <ol className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1">
          {v.bab.map((b) => (
            <li key={b.masa}>
              <button
                type="button"
                onClick={() => lompat(b.masa)}
                className="w-full flex items-baseline gap-3 text-left text-sm py-1 rounded-lg hover:bg-[#F4F2FD] px-2"
              >
                <span className="tabular-nums text-brand-purple w-10 shrink-0">{formatMasa(b.masa)}</span>
                <span className="text-ink-muted">{b.tajuk}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
