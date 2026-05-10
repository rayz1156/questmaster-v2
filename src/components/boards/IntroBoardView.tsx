'use client';
import { useEffect, useState, useRef } from "react";
import { Plus, Image as ImageIcon, Upload, X, Trash2, Pencil, Loader2, Play, Video as VideoIcon } from "lucide-react";
import {
  Board, IntroPost,
  listIntroPosts, getMyIntroPost, createOrUpdateIntroPost,
  deleteIntroPost,
} from "@/lib/boards";
import { supabase } from "@/lib/supabase";
// VideoLightbox not used here - intro videos use IntroVideoLightbox below
import ImageLightbox from "@/components/learning-board/ImageLightbox";

interface Props {
  board: Board;
  canManage: boolean; // educator/admin
  currentUserId: string | null;
}

async function authedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { ...(init?.headers as any) };
  if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
  return fetch(input, { ...init, headers });
}

export default function IntroBoardView({ board, canManage, currentUserId }: Props) {
  const [posts, setPosts] = useState<IntroPost[]>([]);
  const [mine, setMine] = useState<IntroPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [openImage, setOpenImage] = useState<{ src: string; title: string | null } | null>(null);
  const [playingFile, setPlayingFile] = useState<{ fileId: string; title: string | null } | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([listIntroPosts(board.id), getMyIntroPost(board.id)]);
      setPosts(p);
      setMine(m);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [board.id]);

  const handleDelete = async (p: IntroPost) => {
    if (!confirm("Delete this post?")) return;
    try { await deleteIntroPost(p.id); await reload(); }
    catch (e: any) { alert(e.message || String(e)); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">{board.title}</h2>
          {board.description && <p className="text-sm text-gray-600">{board.description}</p>}
        </div>
        {(
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4" />
            {mine ? "Edit My Introduction" : "Add My Introduction"}
          </button>
        )}
      </div>

      {err && <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{err}</div>}
      {loading && <div className="text-sm text-gray-500">Memuatkan…</div>}

      {!loading && posts.length === 0 && (
        <div className="p-8 rounded-lg border-2 border-dashed border-gray-300 text-center">
          <ImageIcon className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-gray-600">No introductions yet. Be the first!</p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {posts.map(p => {
          const isVideo = (p as any).media_type === 'video';
          const thumb = isVideo ? ((p as any).video_thumbnail_url || null) : p.image_url;
          return (
            <div key={p.id} className="group rounded-xl overflow-hidden border bg-white shadow-sm hover:shadow-md transition relative">
              <button
                type="button"
                onClick={() => {
                  if (isVideo && (p as any).video_adilo_file_id) {
                    setPlayingFile({ fileId: (p as any).video_adilo_file_id, title: p.display_name });
                  } else if (thumb) {
                    setOpenImage({ src: thumb, title: p.display_name });
                  }
                }}
                className="block w-full aspect-square bg-gray-100 cursor-zoom-in"
                aria-label={isVideo ? 'Play video' : 'View photo'}
              >
                {thumb ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={thumb} alt={p.display_name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <VideoIcon className="w-10 h-10" />
                  </div>
                )}
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/60 rounded-full p-3 group-hover:scale-110 transition">
                      <Play className="w-6 h-6 text-white fill-white" />
                    </div>
                  </div>
                )}
              </button>
              <div className="p-3">
                <div className="font-semibold text-sm truncate">{p.author_display_name || p.display_name}</div>
                {(p.author_bio || p.description) && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-words">{p.author_bio || p.description}</div>}
              </div>
              {(canManage || p.author_id === currentUserId) && (
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  {p.author_id === currentUserId && (
                    <button onClick={() => setShowModal(true)} title="Edit" className="p-1.5 bg-white/90 rounded shadow hover:bg-white">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => handleDelete(p)} title="Delete" className="p-1.5 bg-white/90 rounded shadow hover:bg-white text-red-600">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <IntroUploadModal
          boardId={board.id}
          existing={mine}
          onClose={() => setShowModal(false)}
          onSaved={async () => { setShowModal(false); await reload(); }}
        />
      )}

      {openImage && (
        <ImageLightbox src={openImage.src} title={openImage.title} onClose={() => setOpenImage(null)} />
      )}
      {playingFile && (
        <IntroVideoLightbox
          boardId={board.id}
          fileId={playingFile.fileId}
          title={playingFile.title}
          onClose={() => setPlayingFile(null)}
        />
      )}
    </div>
  );
}

// Lightbox for intro videos: same UI as Learning Board's VideoLightbox but using the
// /api/intro-boards/[boardId]/embed/[fileId] endpoint.
function IntroVideoLightbox({ boardId, fileId, title, onClose }: { boardId: string; fileId: string; title: string | null; onClose: () => void }) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await authedFetch(`/api/intro-boards/${boardId}/embed/${fileId}`);
        const data = await r.json();
        if (!alive) return;
        if (!r.ok) setError(data.error || 'Failed to load video');
        else setEmbedUrl(data.embedUrl);
      } catch (e: any) {
        if (alive) setError(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [boardId, fileId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close" onClick={onClose} className="absolute top-2 right-2 z-10 p-1.5 bg-white/10 hover:bg-white/20 rounded-md text-white"><X className="w-5 h-5" /></button>
        {title && <div className="absolute top-2 left-2 z-10 text-white text-sm bg-black/40 px-2 py-1 rounded">{title}</div>}
        {error ? (
          <div className="w-full h-full flex items-center justify-center text-red-200 text-sm p-4 text-center">{error}</div>
        ) : !embedUrl ? (
          <div className="w-full h-full flex items-center justify-center text-white">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        ) : (
          <iframe src={embedUrl} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
        )}
      </div>
    </div>
  );
}

function IntroUploadModal({ boardId, existing, onClose, onSaved }: {
  boardId: string;
  existing: IntroPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialMedia: 'image' | 'video' = ((existing as any)?.media_type === 'video') ? 'video' : 'image';
  const [mediaType, setMediaType] = useState<'image' | 'video'>(initialMedia);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialMedia === 'image' ? (existing?.image_url || null) : null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStage, setVideoStage] = useState<'idle' | 'init' | 'uploading' | 'finalizing' | 'done' | 'error'>('idle');
  const [name, setName] = useState(existing?.display_name || "");
  const [desc, setDesc] = useState(existing?.description || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPickImage = (f: File | null) => {
    setFile(f);
    if (f) {
      const r = new FileReader();
      r.onload = e => setPreviewUrl(e.target?.result as string);
      r.readAsDataURL(f);
    }
  };

  const probeDuration = (f: File): Promise<number | undefined> => new Promise(resolve => {
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => { resolve(Math.round(v.duration || 0) || undefined); URL.revokeObjectURL(v.src); };
      v.onerror = () => resolve(undefined);
      v.src = URL.createObjectURL(f);
    } catch { resolve(undefined); }
  });

  const submitImage = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!previewUrl && !file) { setErr("Please choose an image."); return; }
    setBusy(true);
    try {
      // 1) If a NEW file was chosen, upload it to FileLu first via our intro upload route.
      let imageUrl = existing?.image_url ?? undefined;
      let imagePath = existing?.image_path ?? undefined;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`/api/intro-boards/${boardId}/upload-image`, { method: 'POST', body: fd, credentials: 'include' });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error || `Upload failed (${r.status})`);
        }
        const j = await r.json();
        imageUrl = j.url as string;
        imagePath = j.fileCode as string; // store the FileLu file_code in image_path so we can stream it later
      }
      // 2) Upsert the intro_post row WITHOUT re-uploading (we already pushed to FileLu).
      await createOrUpdateIntroPost({
        boardId,
        displayName: name,
        description: desc,
        imageFile: undefined,
        existingPath: imagePath,
        existingUrl: imageUrl,
      });
      onSaved();
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  const submitVideo = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!videoFile) { setErr("Please choose a video file."); return; }
    setBusy(true); setVideoStage('init'); setVideoProgress(0);
    try {
      const dur = await probeDuration(videoFile);
      // 1) start
      const startRes = await authedFetch(`/api/intro-boards/${boardId}/video/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: videoFile.name, mimeType: videoFile.type || 'video/mp4', sizeBytes: videoFile.size, durationSeconds: dur }),
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData.error || 'Upload init failed');
      // 2) upload via XHR for progress
      setVideoStage('uploading');
      const eTag: string = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', startData.signedUrl, true);
        xhr.upload.onprogress = e => { if (e.lengthComputable) setVideoProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const tag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag') || '';
            resolve(tag.replace(/"/g, ''));
          } else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.setRequestHeader('Content-Type', videoFile.type || 'video/mp4');
        xhr.send(videoFile);
      });
      // 3) complete
      setVideoStage('finalizing');
      const compRes = await authedFetch(`/api/intro-boards/${boardId}/video/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: startData.uploadId, key: startData.key, eTag,
          projectId: startData.projectId,
          filename: videoFile.name, mimeType: videoFile.type || 'video/mp4',
          sizeBytes: videoFile.size, durationSeconds: dur,
          displayName: name, description: desc,
        }),
      });
      const compData = await compRes.json();
      if (!compRes.ok) throw new Error(compData.error || 'Finalize failed');
      setVideoStage('done');
      onSaved();
    } catch (e: any) { setVideoStage('error'); setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{existing ? "Edit Introduction" : "Add Introduction"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          {/* Media-type toggle */}
          <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setMediaType('image')}
              className={`px-3 py-1 rounded ${mediaType === 'image' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >Image</button>
            <button
              type="button"
              onClick={() => setMediaType('video')}
              className={`px-3 py-1 rounded ${mediaType === 'video' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >Video</button>
          </div>

          {mediaType === 'image' && (
            <div
              onClick={() => fileInput.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); onPickImage(e.dataTransfer.files?.[0] || null); }}
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition"
            >
              {previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded" />
              ) : (
                <div className="py-6 text-gray-500">
                  <Upload className="w-8 h-8 mx-auto mb-1" />
                  <p className="text-sm">Click or drop an image here</p>
                  <p className="text-xs">JPG/PNG/WebP/GIF · Max 10MB</p>
                </div>
              )}
              <input ref={fileInput} type="file" accept="image/*" className="hidden"
                onChange={e => onPickImage(e.target.files?.[0] || null)} />
            </div>
          )}

          {mediaType === 'video' && (
            <div className="space-y-2">
              <div
                onClick={() => videoInput.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0] || null; if (f) setVideoFile(f); }}
                className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition"
              >
                {videoFile ? (
                  <div className="py-3 text-gray-700">
                    <VideoIcon className="w-8 h-8 mx-auto mb-1 text-indigo-500" />
                    <p className="text-sm font-medium truncate">{videoFile.name}</p>
                    <p className="text-xs text-gray-500">{(videoFile.size / (1024*1024)).toFixed(1)} MB</p>
                  </div>
                ) : (
                  <div className="py-6 text-gray-500">
                    <Upload className="w-8 h-8 mx-auto mb-1" />
                    <p className="text-sm">Click or drop a video here</p>
                    <p className="text-xs">MP4/MOV/WebM · Hosted on Adilo</p>
                  </div>
                )}
                <input ref={videoInput} type="file" accept="video/*" className="hidden"
                  onChange={e => setVideoFile(e.target.files?.[0] || null)} />
              </div>
              {videoStage !== 'idle' && videoStage !== 'done' && videoStage !== 'error' && (
                <div>
                  <div className="text-xs text-gray-600 capitalize">{videoStage}… {videoProgress > 0 && `${videoProgress}%`}</div>
                  <div className="w-full bg-gray-200 rounded h-1.5 overflow-hidden">
                    <div className="bg-indigo-500 h-full transition-all" style={{ width: `${videoProgress}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">About You</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={4}
              className="w-full px-3 py-2 border rounded-lg" placeholder="Tell us a bit about yourself…" />
          </div>
          {err && <div className="p-2 bg-red-50 text-red-700 text-sm rounded">{err}</div>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border">Cancel</button>
          <button onClick={mediaType === 'image' ? submitImage : submitVideo} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
