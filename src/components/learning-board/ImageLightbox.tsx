'use client';
import { useEffect } from 'react';

/**
 * Full-screen lightbox that shows a large version of an image card.
 * Click outside or press Escape to close.
 */
export default function ImageLightbox({
  src,
  title,
  onClose,
}: {
  src: string;
  title?: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute top-3 right-3 z-10 rounded-full bg-black/60 hover:bg-black/80 text-white w-9 h-9 flex items-center justify-center"
      >
        ✕
      </button>
      {title && (
        <div className="absolute top-3 left-3 right-14 z-10 truncate text-white text-sm font-medium drop-shadow">
          {title}
        </div>
      )}
      <div
        className="relative max-w-[95vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={title || ''}
          className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        />
      </div>
    </div>
  );
}
