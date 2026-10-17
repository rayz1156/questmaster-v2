'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Full-screen lightbox that plays an Adilo-hosted video inside an iframe.
 * The student's URL bar stays at cendekia.airiz.tech — only the iframe
 * content comes from adilo.bigcommand.com.
 */
export default function VideoLightbox({
  classId,
  fileId,
  title,
  onClose,
}: {
  classId: string;
  fileId: string;
  title?: string | null;
  onClose: () => void;
}) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const r = await fetch(`/api/learning-boards/${classId}/embed/${fileId}`, { headers });
        const data = await r.json();
        if (!alive) return;
        if (!r.ok) setError(data.error || 'Failed to load video');
        else setEmbedUrl(data.embedUrl);
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [classId, fileId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
    >
      <div
        className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
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
        {error && (
          <div className="w-full h-full flex items-center justify-center text-red-300 text-sm">
            {error}
          </div>
        )}
        {!error && !embedUrl && (
          <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">
            Loading video…
          </div>
        )}
        {embedUrl && (
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer"
            title={title || 'Video'}
          />
        )}
      </div>
    </div>
  );
}
