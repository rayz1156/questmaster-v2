'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, hostnameFromUrl, type LearningCard, type LearningCardType, type LearningColumn } from '@/lib/learning-boards';
import VideoLightbox from './VideoLightbox';
import { supabase } from '@/lib/supabase';


/** Wrap fetch() to attach the Supabase access token from localStorage so
 *  our /api/learning-boards/* routes can authenticate the request. */
async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

type Snapshot = {
  board: { id: string; title: string; description: string | null; adilo_project_id: string | null } | null;
  columns: Array<LearningColumn & { cards: LearningCard[] }>;
};

export default function LearningBoardView({ classId, isEditor }: { classId: string; isEditor: boolean }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingFileId, setPlayingFileId] = useState<{ fileId: string; title: string | null } | null>(null);
  const [addCardForColumn, setAddCardForColumn] = useState<string | null>(null);
  const [openMenuColumnId, setOpenMenuColumnId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await authedFetch(`/api/learning-boards/${classId}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to load');
      setSnap(data);
      setError(null);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (loading && !snap) return <div className="text-gray-600 p-8">Loading…</div>;
  if (error) return <div className="text-red-400 p-8">Error: {error}</div>;
  if (!snap || !snap.board) {
    return (
      <div className="text-gray-600 p-8">
        {isEditor ? 'No learning board yet. It will be created automatically.' : 'No learning board has been set up for this class yet.'}
      </div>
    );
  }

  return (
    <div className="h-full">
      {playingFileId && (
        <VideoLightbox
          classId={classId}
          fileId={playingFileId.fileId}
          title={playingFileId.title}
          onClose={() => setPlayingFileId(null)}
        />
      )}

      <div
        className="flex gap-4 overflow-x-auto p-4 pb-8 min-h-[60vh]"
        onClick={() => setOpenMenuColumnId(null)}
      >
        {snap.columns.map((col) => (
          <ColumnCard
            key={col.id}
            classId={classId}
            column={col}
            isEditor={isEditor}
            onPlayVideo={(fileId, title) => setPlayingFileId({ fileId, title })}
            onAddCard={() => setAddCardForColumn(col.id)}
            onChanged={refresh}
            menuOpen={openMenuColumnId === col.id}
            onToggleMenu={(open) => setOpenMenuColumnId(open ? col.id : null)}
          />
        ))}

        {isEditor && (
          <NewColumnButton classId={classId} onCreated={refresh} />
        )}
      </div>

      {addCardForColumn && (
        <AddCardModal
          classId={classId}
          columnId={addCardForColumn}
          onClose={() => setAddCardForColumn(null)}
          onCreated={() => { setAddCardForColumn(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ColumnCard({
  classId,
  column,
  isEditor,
  onPlayVideo,
  onAddCard,
  onChanged,
  menuOpen,
  onToggleMenu,
}: {
  classId: string;
  column: LearningColumn & { cards: LearningCard[] };
  isEditor: boolean;
  onPlayVideo: (fileId: string, title: string | null) => void;
  onAddCard: () => void;
  onChanged: () => void;
  menuOpen: boolean;
  onToggleMenu: (open: boolean) => void;
}) {
  const renameColumn = async () => {
    const next = window.prompt('Rename column', column.title);
    if (!next || next === column.title) return;
    await authedFetch(`/api/learning-boards/${classId}/columns/${column.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next }),
    });
    onToggleMenu(false);
    onChanged();
  };
  const deleteColumn = async () => {
    if (!window.confirm(`Delete column "${column.title}" and all its cards? This cannot be undone.`)) return;
    await authedFetch(`/api/learning-boards/${classId}/columns/${column.id}`, { method: 'DELETE' });
    onToggleMenu(false);
    onChanged();
  };

  return (
    <div className="flex-shrink-0 w-72 bg-white rounded-xl border border-slate-300 shadow-md hover:shadow-lg transition-shadow flex flex-col max-h-[80vh]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200">
        <span className="text-gray-600 select-none" aria-hidden>≡</span>
        <h3 className="flex-1 text-gray-900 font-semibold truncate text-sm">{column.title}</h3>
        {isEditor && (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-gray-600 hover:text-gray-900 px-1"
              aria-label="Column menu"
              onClick={() => onToggleMenu(!menuOpen)}
            >…</button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-md shadow-lg w-36 text-sm">
                <button onClick={renameColumn} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700">Rename</button>
                <button onClick={deleteColumn} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-400">Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditor && (
        <button
          onClick={onAddCard}
          className="mx-3 my-3 flex items-center justify-center w-10 h-10 self-center rounded-full border border-dashed border-gray-300 text-gray-600 hover:text-gray-900 hover:border-indigo-400 transition"
          aria-label="Add card"
        >+</button>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">
        {column.cards.length === 0 && !isEditor && (
          <div className="text-gray-500 text-xs text-center py-6">No items yet.</div>
        )}
        {column.cards.map((card) => (
          <CardRenderer
            key={card.id}
            classId={classId}
            card={card}
            isEditor={isEditor}
            onPlayVideo={onPlayVideo}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

function NewColumnButton({ classId, onCreated }: { classId: string; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const title = window.prompt('New column title (e.g. "Modul 4")');
    if (!title) return;
    setBusy(true);
    try {
      await authedFetch(`/api/learning-boards/${classId}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      onCreated();
    } finally { setBusy(false); }
  };
  return (
    <button
      onClick={create}
      disabled={busy}
      className="flex-shrink-0 w-72 bg-white hover:bg-slate-50 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl text-slate-600 hover:text-indigo-600 text-sm py-3 self-start transition shadow-sm hover:shadow-md"
    >+ Add column</button>
  );
}

function CardRenderer({
  classId,
  card,
  isEditor,
  onPlayVideo,
  onChanged,
}: {
  classId: string;
  card: LearningCard;
  isEditor: boolean;
  onPlayVideo: (fileId: string, title: string | null) => void;
  onChanged: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('Delete this card?')) return;
    await authedFetch(`/api/learning-boards/${classId}/cards/${card.id}`, { method: 'DELETE' });
    onChanged();
  };

  const Body = () => {
    if (card.card_type === 'video') {
      return (
        <button
          className="block w-full text-left"
          onClick={() => card.adilo_file_id && onPlayVideo(card.adilo_file_id, card.title)}
        >
          <div className="relative aspect-video bg-white rounded-md overflow-hidden">
            {card.video_thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.video_thumbnail_url} alt={card.title || ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">Processing…</div>
            )}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/60 rounded-full w-12 h-12 flex items-center justify-center text-white">▶</div>
            </div>
            {card.video_duration_seconds ? (
              <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">
                {formatDuration(card.video_duration_seconds)}
              </div>
            ) : null}
          </div>
        </button>
      );
    }
    if (card.card_type === 'link' && card.link_url) {
      return (
        <a href={card.link_url} target="_blank" rel="noopener noreferrer" className="block">
          {card.link_image_url && (
            <div className="aspect-video bg-white rounded-md overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.link_image_url} alt={card.link_title || ''} className="w-full h-full object-cover" />
            </div>
          )}
        </a>
      );
    }
    if (card.card_type === 'image' && card.image_url) {
      return (
        <div className="rounded-md overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={card.image_url} alt={card.title || ''} className="w-full object-cover" />
        </div>
      );
    }
    return null;
  };

  const SiteHeader = () => {
    if (card.card_type !== 'link') return null;
    const host = card.link_site_name || (card.link_url ? hostnameFromUrl(card.link_url) : '');
    if (!host) return null;
    return (
      <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-600">
        {card.link_favicon_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.link_favicon_url} alt="" className="w-4 h-4 rounded" />
        ) : (
          <span aria-hidden>🔗</span>
        )}
        <span className="truncate">{host}</span>
      </div>
    );
  };

  const title = card.card_type === 'link' ? (card.link_title || card.title) : card.title;
  const desc = card.card_type === 'link' ? (card.link_description || card.description) : card.description;

  return (
    <div className="bg-white border border-slate-300 rounded-lg p-3 relative shadow-sm hover:shadow-md hover:border-slate-400 transition-shadow">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-gray-500 select-none flex-shrink-0" aria-hidden>≡</span>
        <div className="flex-1" />
        {isEditor && (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-gray-600 hover:text-gray-900 px-1"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Card menu"
            >…</button>
            {menuOpen && (
              <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-md shadow-lg w-32 text-sm">
                <button onClick={handleDelete} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-400">Delete</button>
              </div>
            )}
          </div>
        )}
      </div>
      <SiteHeader />
      <Body />
      {(title || desc) && (
        <div className="mt-2">
          {title && <div className="text-gray-900 text-sm font-semibold leading-snug mb-1 line-clamp-2">{title}</div>}
          {desc && <div className="text-gray-600 text-xs leading-snug line-clamp-4">{desc}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Card Modal
// ---------------------------------------------------------------------------

function AddCardModal({
  classId,
  columnId,
  onClose,
  onCreated,
}: {
  classId: string;
  columnId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tab, setTab] = useState<LearningCardType>('link');
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-xl w-full max-w-lg p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">Add card</h3>
          <button onClick={onClose} className="text-gray-600 hover:text-gray-900">✕</button>
        </div>
        <div className="flex gap-1 mb-5 bg-white p-1 rounded-lg">
          {(['link', 'text', 'image', 'video'] as LearningCardType[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >{t}</button>
          ))}
        </div>
        {tab === 'video' && <VideoForm classId={classId} columnId={columnId} onCreated={onCreated} />}
        {tab === 'link'  && <LinkForm  classId={classId} columnId={columnId} onCreated={onCreated} />}
        {tab === 'image' && <ImageForm classId={classId} columnId={columnId} onCreated={onCreated} />}
        {tab === 'text'  && <TextForm  classId={classId} columnId={columnId} onCreated={onCreated} />}
      </div>
    </div>
  );
}

function VideoForm({ classId, columnId, onCreated }: { classId: string; columnId: string; onCreated: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'idle' | 'init' | 'uploading' | 'finalizing' | 'done' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const probeDuration = (f: File): Promise<number | undefined> =>
    new Promise((resolve) => {
      try {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.onloadedmetadata = () => resolve(Math.round(v.duration || 0));
        v.onerror = () => resolve(undefined);
        v.src = URL.createObjectURL(f);
      } catch { resolve(undefined); }
    });

  const upload = async () => {
    if (!file) return;
    setErrMsg(null);
    setStage('init');
    setProgress(0);
    const durationSeconds = await probeDuration(file);

    let initData: any;
    try {
      const initRes = await authedFetch(`/api/learning-boards/${classId}/upload/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          filename: file.name,
          mimeType: file.type || 'video/mp4',
          sizeBytes: file.size,
          durationSeconds,
        }),
      });
      initData = await initRes.json();
      if (!initRes.ok) throw new Error(initData.error || 'Init failed');
    } catch (e: any) {
      setStage('error'); setErrMsg(e.message); return;
    }

    setStage('uploading');
    let eTag = '';
    try {
      eTag = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('PUT', initData.signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const tag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '';
            resolve(tag.replace(/"/g, ''));
          } else reject(new Error(`Upload failed: HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });
    } catch (e: any) {
      setStage('error'); setErrMsg(e.message); return;
    }

    setStage('finalizing');
    try {
      const r = await authedFetch(`/api/learning-boards/${classId}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          uploadId: initData.uploadId,
          eTag,
          projectId: initData.projectId,
          filename: file.name,
          mimeType: file.type || 'video/mp4',
          sizeBytes: file.size,
          durationSeconds,
          title: title || file.name,
          description,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Finalize failed');
      setStage('done');
      onCreated();
    } catch (e: any) {
      setStage('error'); setErrMsg(e.message);
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white file:cursor-pointer hover:file:bg-indigo-500"
      />
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      <textarea
        value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      {stage !== 'idle' && stage !== 'done' && stage !== 'error' && (
        <div>
          <div className="text-xs text-gray-600 mb-1 capitalize">{stage}… {progress > 0 && `${progress}%`}</div>
          <div className="w-full bg-white rounded-full h-1.5 overflow-hidden">
            <div className="bg-indigo-500 h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {errMsg && <div className="text-red-400 text-xs">{errMsg}</div>}
      <button
        onClick={upload}
        disabled={!file || (stage !== 'idle' && stage !== 'error')}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-md py-2 text-sm"
      >Upload video</button>
    </div>
  );
}

function LinkForm({ classId, columnId, onCreated }: { classId: string; columnId: string; onCreated: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!url) return;
    setBusy(true); setErr(null);
    try {
      const pres = await authedFetch(`/api/learning-boards/link-preview?url=${encodeURIComponent(url)}`);
      const meta = await pres.json();
      const r = await authedFetch(`/api/learning-boards/${classId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          cardType: 'link',
          linkUrl: url,
          linkTitle: meta.title || null,
          linkDescription: meta.description || null,
          linkImageUrl: meta.image || null,
          linkSiteName: meta.siteName || null,
          linkFaviconUrl: meta.favicon || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <input
        value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="https://..."
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <button
        onClick={submit}
        disabled={!url || busy}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md py-2 text-sm"
      >{busy ? 'Adding…' : 'Add link'}</button>
    </div>
  );
}

function ImageForm({ classId, columnId, onCreated }: { classId: string; columnId: string; onCreated: () => void }) {
  // For Phase 1, accept an image URL the user pastes. (Direct upload to Supabase
  // Storage 'learning-cards' bucket is wired up in the bucket but a polished
  // uploader UI is Phase 2.)
  const [imageUrl, setImageUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/learning-boards/${classId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, cardType: 'image', imageUrl, title: title || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <input
        value={imageUrl} onChange={(e) => setImageUrl(e.target.value)}
        placeholder="Image URL (https://...)"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Caption (optional)"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <button
        onClick={submit}
        disabled={!imageUrl || busy}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md py-2 text-sm"
      >{busy ? 'Adding…' : 'Add image'}</button>
    </div>
  );
}

function TextForm({ classId, columnId, onCreated }: { classId: string; columnId: string; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!title && !description) { setErr('Add a title or description'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/learning-boards/${classId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, cardType: 'text', title: title || null, description: description || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      onCreated();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3">
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      <textarea
        value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Note text"
        rows={5}
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <button
        onClick={submit}
        disabled={busy}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md py-2 text-sm"
      >{busy ? 'Adding…' : 'Add note'}</button>
    </div>
  );
}
