'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { Download, Edit2, Trash2, Plus, Lock, Unlock, Eye, EyeOff, Users, X, FileText, Image as ImageIcon, Video, Link as LinkIcon, Paperclip } from 'lucide-react';
import { buildAdiloEmbedUrl } from '@/lib/adilo';
import type { SubmissionBoard, SubmissionBoardItem, SubmissionItemType, SubmissionVisibility } from '@/lib/submission-boards';

interface Props {
  huntId: string;
  classId: string;
  initialBoard: SubmissionBoard | null;
  initialItems: SubmissionBoardItem[];
  myRole: 'educator' | 'student' | 'admin';
  myId: string;
}

type TabType = SubmissionItemType;

function formatBytes(n?: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function visibilityLabel(v: SubmissionVisibility) {
  if (v === 'public') return 'Public (all in class)';
  if (v === 'private') return 'Private (only submitter + educator)';
  return 'Class-scoped';
}

export default function SubmissionBoardView({ huntId, classId, initialBoard, initialItems, myRole, myId }: Props) {
  const [board, setBoard] = useState<SubmissionBoard | null>(initialBoard);
  const [items, setItems] = useState<SubmissionBoardItem[]>(initialItems);
  const [showSubmit, setShowSubmit] = useState(false);
  const [editingItem, setEditingItem] = useState<SubmissionBoardItem | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apiBase = `/api/submission-boards/${huntId}/${classId}`;
  const isEducator = myRole === 'educator' || myRole === 'admin';

  async function refresh() {
    const r = await fetch(apiBase, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setBoard(j.board);
      setItems(j.items || []);
    }
  }

  async function createBoard() {
    setSavingBoard(true);
    setErr(null);
    const r = await fetch(apiBase, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Submission Board' }) });
    if (!r.ok) { setErr((await r.json()).error || 'Failed to create board'); }
    else { await refresh(); }
    setSavingBoard(false);
  }

  async function updateBoard(patch: Partial<SubmissionBoard>) {
    setSavingBoard(true);
    const r = await fetch(apiBase, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    if (r.ok) { const j = await r.json(); setBoard(j.board); }
    setSavingBoard(false);
  }

  async function deleteItem(id: string) {
    if (!confirm('Delete this submission? This cannot be undone.')) return;
    const r = await fetch(`${apiBase}/items/${id}`, { method: 'DELETE' });
    if (r.ok) setItems(items.filter((i) => i.id !== id));
    else alert((await r.json()).error || 'Delete failed');
  }

  if (!board) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-gray-600 mb-3">No submission board for this activity in this class yet.</p>
        {isEducator ? (
          <button onClick={createBoard} disabled={savingBoard} className="btn-primary inline-flex items-center gap-2 px-4 py-2">
            <Plus className="w-4 h-4" /> Create Submission Board
          </button>
        ) : (
          <p className="text-xs text-gray-500">Ask your educator to create one.</p>
        )}
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Board header */}
      <div className="card p-4 flex flex-wrap items-center gap-3 justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold truncate">{board.title}</h2>
          {board.description && <p className="text-sm text-gray-600 mt-1">{board.description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-gray-100 inline-flex items-center gap-1">
              {board.visibility === 'private' ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {visibilityLabel(board.visibility)}
            </span>
            <span className={`px-2 py-0.5 rounded inline-flex items-center gap-1 ${board.is_open ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-700'}`}>
              {board.is_open ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
              {board.is_open ? 'Open' : 'Closed'}
            </span>
            <span className="text-gray-500 inline-flex items-center gap-1"><Users className="w-3 h-3" /> {items.length} submission{items.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEducator && (
            <>
              <select
                className="input text-xs"
                value={board.visibility}
                onChange={(e) => updateBoard({ visibility: e.target.value as SubmissionVisibility })}
                disabled={savingBoard}
              >
                <option value="class_scoped">Class-scoped</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <button onClick={() => updateBoard({ is_open: !board.is_open })} disabled={savingBoard} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                {board.is_open ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {board.is_open ? 'Close' : 'Open'}
              </button>
            </>
          )}
          {board.is_open && (
            <button onClick={() => setShowSubmit(true)} className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-sm">
              <Plus className="w-4 h-4" /> New Submission
            </button>
          )}
        </div>
      </div>

      {/* Items grid */}
      {items.length === 0 ? (
        <div className="card p-6 text-center text-sm text-gray-500">No submissions yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              myId={myId}
              isEducator={isEducator}
              onEdit={() => setEditingItem(it)}
              onDelete={() => deleteItem(it.id)}
            />
          ))}
        </div>
      )}

      {showSubmit && (
        <SubmitModal
          apiBase={apiBase}
          onClose={() => setShowSubmit(false)}
          onCreated={(item) => { setItems([item, ...items]); setShowSubmit(false); }}
        />
      )}
      {editingItem && (
        <EditModal
          apiBase={apiBase}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={(updated) => {
            setItems(items.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
            setEditingItem(null);
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Item card
// ============================================================
function ItemCard({ item, myId, isEducator, onEdit, onDelete }: { item: SubmissionBoardItem; myId: string; isEducator: boolean; onEdit: () => void; onDelete: () => void }) {
  const isOwner = item.submitted_by === myId;
  const canEdit = isOwner || isEducator;

  return (
    <div className="card p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <ItemTypeBadge type={item.item_type} />
        <div className="min-w-0 flex-1">
          {item.title && <p className="text-sm font-semibold truncate">{item.title}</p>}
          {item.submitter && <p className="text-xs text-gray-500 truncate">{item.submitter.display_name || 'Student'}</p>}
        </div>
      </div>

      {item.item_type === 'image' && item.image_url && (
        <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="block">
          <img src={item.image_url} alt={item.title || 'Submission image'} className="w-full h-40 object-cover rounded" />
        </a>
      )}
      {item.item_type === 'video' && item.adilo_file_id && (
        <div className="relative w-full aspect-video bg-black rounded overflow-hidden">
          <iframe src={buildAdiloEmbedUrl(item.adilo_file_id)} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
        </div>
      )}
      {item.item_type === 'link' && item.link_url && (
        <a href={item.link_url} target="_blank" rel="noopener noreferrer" className="flex gap-2 p-2 rounded bg-gray-50 hover:bg-gray-100 text-xs">
          {item.link_image_url && <img src={item.link_image_url} alt="" className="w-16 h-16 object-cover rounded" />}
          <div className="min-w-0">
            <p className="font-semibold truncate">{item.link_title || item.link_url}</p>
            {item.link_description && <p className="text-gray-600 line-clamp-2">{item.link_description}</p>}
            {item.link_site_name && <p className="text-gray-500 truncate">{item.link_site_name}</p>}
          </div>
        </a>
      )}
      {item.item_type === 'file' && item.file_url && (
        <a href={item.file_url} download={item.file_name || true} className="flex items-center gap-2 p-2 rounded bg-gray-50 hover:bg-gray-100 text-xs">
          <Paperclip className="w-4 h-4" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{item.file_name || 'Download'}</p>
            <p className="text-gray-500">{item.file_mime_type} · {formatBytes(item.file_size_bytes)}</p>
          </div>
          <Download className="w-4 h-4" />
        </a>
      )}
      {item.description && <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{item.description}</p>}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 text-xs text-gray-500">
        <span>{new Date(item.created_at).toLocaleDateString()}</span>
        <div className="flex items-center gap-2">
          {(item.item_type === 'file' || item.item_type === 'image') && (item.file_url || item.image_url) && (
            <a href={item.file_url || item.image_url!} download className="hover:text-gray-900" title="Download"><Download className="w-4 h-4" /></a>
          )}
          {canEdit && <button onClick={onEdit} className="hover:text-gray-900" title="Edit"><Edit2 className="w-4 h-4" /></button>}
          {canEdit && <button onClick={onDelete} className="hover:text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>
    </div>
  );
}

function ItemTypeBadge({ type }: { type: SubmissionItemType }) {
  const map = {
    text: { icon: <FileText className="w-4 h-4" />, color: 'bg-gray-100 text-gray-700' },
    image: { icon: <ImageIcon className="w-4 h-4" />, color: 'bg-blue-100 text-blue-700' },
    video: { icon: <Video className="w-4 h-4" />, color: 'bg-purple-100 text-purple-700' },
    link: { icon: <LinkIcon className="w-4 h-4" />, color: 'bg-emerald-100 text-emerald-700' },
    file: { icon: <Paperclip className="w-4 h-4" />, color: 'bg-amber-100 text-amber-700' },
  } as const;
  const m = map[type];
  return <span className={`p-1.5 rounded ${m.color}`}>{m.icon}</span>;
}

// ============================================================
// Submit modal
// ============================================================
function SubmitModal({ apiBase, onClose, onCreated }: { apiBase: string; onClose: () => void; onCreated: (item: SubmissionBoardItem) => void }) {
  const [tab, setTab] = useState<TabType>('text');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // type-specific state
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const baseBody: any = { itemType: tab, title: title || null, description: description || null };

      if (tab === 'text') {
        if (!title && !description) throw new Error('Title or description required');
      } else if (tab === 'link') {
        if (!linkUrl) throw new Error('Link URL required');
        baseBody.linkUrl = linkUrl;
      } else if (tab === 'image' || tab === 'file') {
        if (!file) throw new Error('Please choose a file');
        const fd = new FormData();
        fd.append('file', file);
        const ur = await fetch(`${apiBase}/upload-file`, { method: 'POST', body: fd });
        if (!ur.ok) throw new Error((await ur.json()).error || 'Upload failed');
        const uj = await ur.json();
        if (tab === 'image') {
          baseBody.imageUrl = uj.fileluFileUrl;
          baseBody.imagePath = uj.fileluFileUrl;
          baseBody.fileluFileCode = uj.fileCode;
        } else {
          baseBody.fileUrl = uj.fileluFileUrl;
          baseBody.filePath = uj.fileluFileUrl;
          baseBody.fileName = uj.fileName;
          baseBody.fileMimeType = uj.fileMimeType;
          baseBody.fileSizeBytes = uj.fileSizeBytes;
          baseBody.fileExtension = uj.fileExtension;
          baseBody.fileluFileCode = uj.fileCode;
        }
      } else if (tab === 'video') {
        if (!file) throw new Error('Please choose a video');
        if (!file.type.startsWith('video/')) throw new Error('Only video files allowed');
        // 1) start Adilo upload
        const startRes = await fetch(`${apiBase}/video/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        if (!startRes.ok) throw new Error((await startRes.json()).error || 'Video upload start failed');
        const startJ = await startRes.json();
        // 2) upload to signed URL
        const putRes = await fetch(startJ.signedUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
        if (!putRes.ok) throw new Error('Direct upload to Adilo failed');
        const etag = putRes.headers.get('etag') || putRes.headers.get('ETag') || '';
        // 3) complete
        const compRes = await fetch(`${apiBase}/video/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            uploadId: startJ.uploadId,
            key: startJ.key,
            projectId: startJ.projectId,
            parts: [{ ETag: etag.replace(/"/g, ''), PartNumber: 1 }],
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });
        if (!compRes.ok) throw new Error((await compRes.json()).error || 'Video complete failed');
        const compJ = await compRes.json();
        baseBody.adiloFileId = compJ.adiloFileId;
        baseBody.adiloProjectId = compJ.adiloProjectId;
        baseBody.videoThumbnailUrl = compJ.videoThumbnailUrl;
        baseBody.videoDurationSeconds = compJ.videoDurationSeconds;
      }

      const r = await fetch(`${apiBase}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(baseBody) });
      if (!r.ok) throw new Error((await r.json()).error || 'Create failed');
      const j = await r.json();
      onCreated(j.item);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold">New Submission</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-1 flex-wrap">
            {(['text', 'image', 'video', 'link', 'file'] as TabType[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded text-xs ${tab === t ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{t}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="input w-full" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="input w-full" rows={3} />
          {tab === 'link' && <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="input w-full" />}
          {(tab === 'image' || tab === 'file' || tab === 'video') && (
            <input type="file" accept={tab === 'image' ? 'image/*' : tab === 'video' ? 'video/*' : '*/*'} onChange={(e) => setFile(e.target.files?.[0] || null)} className="input w-full" />
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">{busy ? 'Submitting...' : 'Submit'}</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Edit modal (title + description only)
// ============================================================
function EditModal({ apiBase, item, onClose, onSaved }: { apiBase: string; item: SubmissionBoardItem; onClose: () => void; onSaved: (it: SubmissionBoardItem) => void }) {
  const [title, setTitle] = useState(item.title || '');
  const [description, setDescription] = useState(item.description || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    const r = await fetch(`${apiBase}/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title, description }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json()).error || 'Save failed'); return; }
    const j = await r.json();
    onSaved(j.item);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between"><h3 className="font-bold">Edit Submission</h3><button onClick={onClose}><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input w-full" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input w-full" rows={4} />
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm">Cancel</button>
          <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
