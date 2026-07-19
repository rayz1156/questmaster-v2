'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { Download, Edit2, Trash2, Plus, Lock, Unlock, Eye, EyeOff, Users, X, FileText, Image as ImageIcon, Video, Link as LinkIcon, Paperclip } from 'lucide-react';
import { buildVideoEmbedUrl, parseYouTubeId, type VideoProvider } from '@/lib/video-embed';
import { useCapabilities } from '@/lib/useCapabilities';
import { uploadToBunny } from '@/lib/bunny-upload';
import type { SubmissionBoard, SubmissionBoardColumn, SubmissionBoardItem, SubmissionItemType, SubmissionVisibility } from '@/lib/submission-boards';

import { supabase } from '@/lib/supabase';
import { ConfirmDialog } from '@/components/ui/PromptDialog';

/** Wrap fetch() to attach the Supabase access token so /api/* routes can auth. */
async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}


interface Props {
  huntId: string;
  classId: string;
  initialBoard: SubmissionBoard | null;
  initialItems: SubmissionBoardItem[];
  initialColumns?: SubmissionBoardColumn[];
  myRole: 'educator' | 'student' | 'admin';
  myId: string;
}

type TabType = SubmissionItemType | 'youtube';

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

export default function SubmissionBoardView({ huntId, classId, initialBoard, initialItems, myRole, myId, initialColumns = []}: Props) {
  const [board, setBoard] = useState<SubmissionBoard | null>(initialBoard);
  const [items, setItems] = useState<SubmissionBoardItem[]>(initialItems);
  const [columns, setColumns] = useState<SubmissionBoardColumn[]>(initialColumns);
  const [newColTitle, setNewColTitle] = useState<string>('');
  const [addingCol, setAddingCol] = useState<boolean>(false);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [editingColId, setEditingColId] = useState<string | null>(null);
  const [editingColTitle, setEditingColTitle] = useState<string>('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [editingItem, setEditingItem] = useState<SubmissionBoardItem | null>(null);
  const [pendingColumnId, setPendingColumnId] = useState<string | null>(null);
  const [savingBoard, setSavingBoard] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{ title: string; description?: string; confirmLabel?: string; tone?: 'danger' | 'default'; onConfirm: () => void } | null>(null);

  const apiBase = `/api/submission-boards/${huntId}/${classId}`;
  const isEducator = myRole === 'educator' || myRole === 'admin';

  async function refresh() {
    const r = await authedFetch(apiBase, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      setBoard(j.board);
      setItems(j.items || []);
      setColumns(j.columns || []);
    }
  }

  async function createBoard() {
    setSavingBoard(true);
    setErr(null);
    const r = await authedFetch(apiBase, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Submission Board' }) });
    if (!r.ok) { setErr((await r.json()).error || 'Failed to create board'); }
    else { await refresh(); }
    setSavingBoard(false);
  }

  async function updateBoard(patch: Partial<SubmissionBoard>) {
    setSavingBoard(true);
    const r = await authedFetch(apiBase, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
    if (r.ok) { const j = await r.json(); setBoard(j.board); }
    setSavingBoard(false);
  }

  // ============================================================
  // Columns + layout
  // ============================================================
  const layoutMode: 'columns' | 'mood' = (board?.view_mode === 'mood') ? 'mood' : 'columns';

  async function changeLayout(mode: 'columns' | 'mood') {
    if (!board || layoutMode === mode) return;
    setBoard({ ...board, view_mode: mode });
    await updateBoard({ view_mode: mode } as any);
  }

  async function createColumn() {
    const t = newColTitle.trim();
    if (!t) return;
    setAddingCol(true);
    setErr(null);
    try {
      const r = await authedFetch(apiBase + '/columns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to create column');
      setColumns([...columns, j.column]);
      setNewColTitle('');
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setAddingCol(false);
    }
  }

  async function renameColumn(columnId: string, title: string) {
    const t = title.trim();
    if (!t) return;
    const prev = columns;
    setColumns(columns.map((c) => c.id === columnId ? { ...c, title: t } : c));
    setEditingColId(null);
    try {
      const r = await authedFetch(apiBase + '/columns/' + columnId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: t })
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to rename');
      }
    } catch (e: any) {
      setErr(e.message || String(e));
      setColumns(prev);
    }
  }

  async function deleteColumn(columnId: string) {
    const col = columns.find((c) => c.id === columnId);
    if (!col) return;
    const itemsHere = items.filter((i) => i.column_id === columnId);
    if (itemsHere.length > 0 && !isEducator) {
      setErr('Column has ' + itemsHere.length + ' item' + (itemsHere.length === 1 ? '' : 's') + '. Move them first, or ask your educator to delete.');
      return;
    }
    const desc = itemsHere.length > 0 ? `${itemsHere.length} item(s) inside will be detached.` : 'This action cannot be undone.';
    setConfirmState({
      title: `Delete column "${col.title}"?`,
      description: desc,
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        const prevCols = columns;
        setColumns(columns.filter((c) => c.id !== columnId));
        try {
          const r = await authedFetch(apiBase + '/columns/' + columnId, { method: 'DELETE' });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || 'Failed to delete column');
          }
          // Items in this column had column_id set to NULL via ON DELETE SET NULL
          setItems(items.map((i) => i.column_id === columnId ? { ...i, column_id: null } : i));
        } catch (e: any) {
          setErr(e.message || String(e));
          setColumns(prevCols);
        }
      },
    });
  }

  async function moveItemToColumn(itemId: string, columnId: string | null) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    if (item.column_id === columnId) return;
    const prev = items;
    setItems(items.map((i) => i.id === itemId ? { ...i, column_id: columnId } : i));
    try {
      const r = await authedFetch(apiBase + '/items/' + itemId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ columnId })
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to move card');
      }
    } catch (e: any) {
      setErr(e.message || String(e));
      setItems(prev);
    }
  }

  async function deleteItem(id: string) {
    setConfirmState({
      title: 'Delete this submission?',
      description: 'This action cannot be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        const r = await authedFetch(`${apiBase}/items/${id}`, { method: 'DELETE' });
        if (r.ok) setItems(items.filter((i) => i.id !== id));
        else setErr((await r.json()).error || 'Delete failed');
      },
    });
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

      {/* Layout toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600">View:</span>
        <div className="inline-flex rounded-md overflow-hidden border border-gray-200">
          <button
            type="button"
            onClick={() => changeLayout('columns')}
            disabled={savingBoard}
            className={`px-3 py-1.5 transition ${layoutMode === 'columns' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title="Display submissions side by side in columns"
          >Columns</button>
          <button
            type="button"
            onClick={() => changeLayout('mood')}
            disabled={savingBoard}
            className={`px-3 py-1.5 transition ${layoutMode === 'mood' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title="Display submissions as a free mood-board grid"
          >Mood board</button>
        </div>
        <span className="text-gray-400">·</span>
        <span className="text-gray-500">{items.length} item{items.length === 1 ? '' : 's'} in {Math.max(1, columns.length)} column{columns.length === 1 ? '' : 's'}</span>
      </div>

      {/* Items renderer */}
      {layoutMode === 'columns' ? (
        <ColumnsView
          items={items}
          columns={columns}
          myId={myId}
          isEducator={isEducator}
          draggingItemId={draggingItemId}
          editingColId={editingColId}
          editingColTitle={editingColTitle}
          newColTitle={newColTitle}
          addingCol={addingCol}
          onSetEditingCol={(id, t) => { setEditingColId(id); setEditingColTitle(t); }}
          onSetEditingColTitle={setEditingColTitle}
          onCommitColTitle={renameColumn}
          onDeleteColumn={deleteColumn}
          onSetNewColTitle={setNewColTitle}
          onRequestAddToColumn={(cid) => { setPendingColumnId(cid); setShowSubmit(true); }}
          onCreateColumn={createColumn}
          onSetDraggingItem={setDraggingItemId}
          onMoveItem={moveItemToColumn}
          onEditItem={(it) => setEditingItem(it)}
          onDeleteItem={(id) => deleteItem(id)}
        />
      ) : (
        items.length === 0 ? (
          <div className="card p-6 text-center text-sm text-gray-500">No submissions yet.</div>
        ) : (
        <div
          className="mx-0 mt-2 mb-8 rounded-3xl px-4 sm:px-6 pt-6 pb-10 min-h-[60vh] shadow-inner relative"
          style={{
            background:
              'radial-gradient(1200px 600px at 20% -10%, rgba(124,58,237,0.18), transparent 60%), radial-gradient(900px 500px at 90% 10%, rgba(14,165,233,0.18), transparent 55%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
          }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map((it) => (
              <div
                key={it.id}
                className="group transition-transform duration-200 hover:-translate-y-0.5 rounded-2xl overflow-hidden shadow-[0_10px_30px_-12px_rgba(0,0,0,0.6)] hover:shadow-[0_18px_40px_-14px_rgba(0,0,0,0.8)] bg-white"
              >
                <ItemCard
                  item={it}
                  myId={myId}
                  isEducator={isEducator}
                  onEdit={() => setEditingItem(it)}
                  onDelete={() => deleteItem(it.id)}
              columns={columns}
              onMoveCol={(cid) => moveItemToColumn(it.id, cid)}
                />
              </div>
            ))}
          </div>
        </div>
        )
      )}

      {showSubmit && (
        <SubmitModal
          apiBase={apiBase}
          isEducator={isEducator}
          columnId={pendingColumnId}
          onClose={() => setShowSubmit(false)}
          onCreated={(item) => { setItems([item, ...items]); setShowSubmit(false); setPendingColumnId(null); }}
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
      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        description={confirmState?.description}
        confirmLabel={confirmState?.confirmLabel ?? 'Confirm'}
        tone={confirmState?.tone ?? 'default'}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}

// ============================================================
// Item card
// ============================================================
// ===================================================================
// Columns view (Kanban-like)
// ===================================================================
interface ColumnsViewProps {
  items: SubmissionBoardItem[];
  columns: SubmissionBoardColumn[];
  myId: string;
  isEducator: boolean;
  draggingItemId: string | null;
  editingColId: string | null;
  editingColTitle: string;
  newColTitle: string;
  addingCol: boolean;
  onSetEditingCol: (id: string | null, title: string) => void;
  onSetEditingColTitle: (s: string) => void;
  onCommitColTitle: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  onSetNewColTitle: (s: string) => void;
  onRequestAddToColumn: (columnId: string | null) => void;
  onCreateColumn: () => void;
  onSetDraggingItem: (id: string | null) => void;
  onMoveItem: (itemId: string, columnId: string | null) => void;
  onEditItem: (it: SubmissionBoardItem) => void;
  onDeleteItem: (id: string) => void;
}

function ColumnsView(props: ColumnsViewProps) {
  const { items, columns, myId, isEducator, draggingItemId, editingColId, editingColTitle, newColTitle, addingCol,
          onSetEditingCol, onSetEditingColTitle, onCommitColTitle, onDeleteColumn, onSetNewColTitle, onCreateColumn, onRequestAddToColumn,
          onSetDraggingItem, onMoveItem, onEditItem, onDeleteItem } = props;

  const orphanItems = items.filter((i) => !i.column_id || !columns.find((c) => c.id === i.column_id));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 items-start">
      {columns.map((col) => {
        const colItems = items.filter((i) => i.column_id === col.id);
        return (
          <div
            key={col.id}
            className="flex-shrink-0 w-72 bg-gray-50 rounded-lg p-2 flex flex-col gap-2"
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingItemId) {
                onMoveItem(draggingItemId, col.id);
                onSetDraggingItem(null);
              }
            }}
          >
            <div className="flex items-center justify-between gap-2 px-1">
              {editingColId === col.id ? (
                <input
                  value={editingColTitle}
                  onChange={(e) => onSetEditingColTitle(e.target.value)}
                  onBlur={() => onCommitColTitle(col.id, editingColTitle)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onCommitColTitle(col.id, editingColTitle);
                    if (e.key === 'Escape') onSetEditingCol(null, '');
                  }}
                  autoFocus
                  className="flex-1 min-w-0 px-2 py-1 text-sm font-semibold rounded border border-indigo-400 outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => onSetEditingCol(col.id, col.title)}
                  className="flex-1 min-w-0 truncate text-left text-sm font-semibold text-gray-800 hover:text-indigo-700"
                  title="Click to rename"
                >{col.title}</button>
              )}
              <span className="text-xs text-gray-500">{colItems.length}</span>
              <button
                type="button"
                onClick={() => onDeleteColumn(col.id)}
                className="text-xs text-gray-400 hover:text-red-600 px-1"
                title={colItems.length > 0 && !isEducator ? 'Column not empty (educator can still delete)' : 'Delete column'}
              >✕</button>
            </div>
            <div className="flex flex-col gap-2 min-h-[40px] max-h-[60vh] overflow-y-auto pr-1 -mr-1">
              {colItems.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded">Drop here</div>
              ) : colItems.map((it) => (
                <div
                  key={it.id}
                  draggable
                  onDragStart={() => onSetDraggingItem(it.id)}
                  onDragEnd={() => onSetDraggingItem(null)}
                  className={`cursor-grab active:cursor-grabbing select-none ${draggingItemId === it.id ? 'opacity-50' : ''}`}
                >
                  <ItemCard
                    item={it}
                    myId={myId}
                    isEducator={isEducator}
                    onEdit={() => onEditItem(it)}
                    onDelete={() => onDeleteItem(it.id)}
              columns={columns}
              onMoveCol={(cid) => onMoveItem(it.id, cid)}
                  />
                </div>
              ))}
          <button type="button" onClick={() => onRequestAddToColumn(col.id)} className="text-xs text-gray-500 hover:text-indigo-700 border border-dashed border-gray-300 hover:border-indigo-400 rounded py-1.5 mt-1" title="Add submission to this column">+ Upload here</button>
            </div>
          </div>
        );
      })}

      {/* Orphan items (no column) */}
      {orphanItems.length > 0 && (
        <div
          className="flex-shrink-0 w-72 bg-yellow-50 rounded-lg p-2 flex flex-col gap-2 border border-yellow-200"
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            if (draggingItemId) {
              onMoveItem(draggingItemId, null);
              onSetDraggingItem(null);
            }
          }}
        >
          <div className="text-sm font-semibold text-yellow-800 px-1">Uncategorised ({orphanItems.length})</div>
          <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1 -mr-1">
            {orphanItems.map((it) => (
              <div
                key={it.id}
                draggable
                onDragStart={() => onSetDraggingItem(it.id)}
                onDragEnd={() => onSetDraggingItem(null)}
                className={`cursor-grab active:cursor-grabbing select-none ${draggingItemId === it.id ? 'opacity-50' : ''}`}
              >
                <ItemCard
                  item={it}
                  myId={myId}
                  isEducator={isEducator}
                  onEdit={() => onEditItem(it)}
                  onDelete={() => onDeleteItem(it.id)}
              columns={columns}
              onMoveCol={(cid) => onMoveItem(it.id, cid)}
                />
              </div>
            ))}
        <button type="button" onClick={() => onRequestAddToColumn(null)} className="text-xs text-yellow-700 hover:text-yellow-900 border border-dashed border-yellow-300 hover:border-yellow-500 rounded py-1.5 mt-1" title="Add new submission (uncategorised)">+ Upload</button>
          </div>
        </div>
      )}

      {/* Add column */}
      <div className="flex-shrink-0 w-72">
        <div className="bg-white rounded-lg p-2 border border-dashed border-gray-300">
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder="+ New column title…"
              value={newColTitle}
              onChange={(e) => onSetNewColTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onCreateColumn(); }}
              maxLength={80}
              className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 rounded outline-none focus:border-indigo-400"
            />
            <button
              type="button"
              onClick={onCreateColumn}
              disabled={addingCol || !newColTitle.trim()}
              className="px-2 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, myId, isEducator, onEdit, onDelete, columns, onMoveCol }: { item: SubmissionBoardItem; myId: string; isEducator: boolean; onEdit: () => void; onDelete: () => void; columns: SubmissionBoardColumn[]; onMoveCol: (colId: string | null) => void }) {
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
      {item.item_type === 'video' && (() => {
        const vId = (item as any).video_provider_id || item.adilo_file_id;
        if (!vId) return null;
        const vProv = (((item as any).video_provider as VideoProvider) || 'adilo');
        const vSrc = buildVideoEmbedUrl(vProv, vId);
        return (
          <div className="relative w-full bg-black rounded overflow-hidden group" style={{aspectRatio: '16/9'}}>
            <iframe src={vSrc} className="absolute inset-0 w-full h-full" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
            <a href={vSrc} target="_blank" rel="noopener noreferrer" title="Open video in new tab (better for portrait videos)" className="absolute top-1 right-1 z-10 bg-black/70 hover:bg-black/90 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-md transition">⤢ Enlarge</a>
          </div>
        );
      })()}
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
      {item.item_type === 'chatbot' && item.chatbot_url && (
        <a href={item.chatbot_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded bg-indigo-50 hover:bg-indigo-100 text-xs">
          <span className="w-8 h-8 rounded flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold">AI</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold truncate text-indigo-700">{item.title || 'Learning Assistant'}</span>
            <span className="block text-indigo-500">Open assistant</span>
          </span>
        </a>
      )}
      {item.description && <p className="text-xs text-gray-700 whitespace-pre-wrap break-words line-clamp-4 max-h-24 overflow-hidden">{item.description}</p>}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 text-xs text-gray-500">
        <span title={new Date(item.created_at).toLocaleString()}>{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-2">
          {(item.item_type === 'file' || item.item_type === 'image') && (item.file_url || item.image_url) && (
            <a href={item.file_url || item.image_url!} download className="hover:text-gray-900" title="Download"><Download className="w-4 h-4" /></a>
          )}
          {(canEdit || isEducator) && columns.length > 0 && (() => { const idx = columns.findIndex(c => c.id === item.column_id); const prev = idx > 0 ? columns[idx-1] : null; const next = idx >= 0 && idx < columns.length-1 ? columns[idx+1] : null; return (<><button type="button" onClick={() => onMoveCol(prev ? prev.id : null)} disabled={idx === 0 && !item.column_id} className="hover:text-indigo-700 disabled:opacity-30 px-1" title={prev ? `Move to ${prev.title}` : "Move to Uncategorised"}>←</button><button type="button" onClick={() => onMoveCol(next ? next.id : (columns[0]?.id || null))} className="hover:text-indigo-700 px-1" title={next ? `Move to ${next.title}` : (columns[0] ? `Move to ${columns[0].title}` : "Move")}>→</button></>); })()}
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
    chatbot: { icon: <LinkIcon className="w-4 h-4" />, color: 'bg-indigo-100 text-indigo-700' },
  } as const;
  const m = map[type];
  return <span className={`p-1.5 rounded ${m.color}`}>{m.icon}</span>;
}

// ============================================================
// Submit modal
// ============================================================
function SubmitModal({ apiBase, isEducator, columnId, onClose, onCreated }: { apiBase: string; isEducator: boolean; columnId: string | null; onClose: () => void; onCreated: (item: SubmissionBoardItem) => void }) {
  const [tab, setTab] = useState<TabType>('text');
  const caps = useCapabilities();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // type-specific state
  const [linkUrl, setLinkUrl] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [videoPct, setVideoPct] = useState(0);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const baseBody: any = { itemType: tab === 'youtube' ? 'video' : tab, title: title || null, description: description || null, columnId: columnId || null };

      if (tab === 'text') {
        if (!title && !description) throw new Error('Title or description required');
    } else if (tab === 'chatbot') {
      if (!linkUrl) throw new Error('Assistant embed URL required');
      try { if (new URL(linkUrl).protocol !== 'https:') throw 0; } catch { throw new Error('URL must be a valid https link'); }
      baseBody.chatbotUrl = linkUrl;
      } else if (tab === 'link') {
        if (!linkUrl) throw new Error('Link URL required');
        baseBody.linkUrl = linkUrl;
      // Try to unfurl OpenGraph metadata (best-effort; failures are non-fatal)
      try {
        const pr = await authedFetch(`/api/learning-boards/link-preview?url=${encodeURIComponent(linkUrl)}`);
        if (pr.ok) {
          const pj = await pr.json();
          if (pj.title) baseBody.linkTitle = pj.title;
          if (pj.description) baseBody.linkDescription = pj.description;
          if (pj.image) baseBody.linkImageUrl = pj.image;
        }
      } catch { /* non-fatal */ }
      } else if (tab === 'image' || tab === 'file') {
        if (!file) throw new Error('Please choose a file');
        const fd = new FormData();
        fd.append('file', file);
        const ur = await authedFetch(`${apiBase}/upload-file`, { method: 'POST', body: fd });
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
      } else if (tab === 'youtube') {
        const raw = ytUrl.trim();
        if (!raw) throw new Error('Please paste a YouTube link');
        if (!parseYouTubeId(raw)) throw new Error("That doesn't look like a valid YouTube link");
        baseBody.videoProvider = 'youtube';
        baseBody.youtubeUrl = raw;
      } else if (tab === 'video') {
        if (!caps.canUploadVideos) throw new Error('Video upload is not enabled for your account by the admin. Use the YouTube tab instead.');
        if (!file) throw new Error('Please choose a video');
        if (!file.type.startsWith('video/')) throw new Error('Only video files allowed');
        // 1) start Bunny upload (mints video + presigned TUS auth)
        const startRes = await authedFetch(`${apiBase}/video/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, sizeBytes: file.size }),
        });
        if (!startRes.ok) throw new Error((await startRes.json()).error || 'Video upload start failed');
        const startJ = await startRes.json();
        // 2) resumable direct upload to Bunny
        await uploadToBunny(file, startJ.tus, { onProgress: setVideoPct });
        // 3) complete
        const compRes = await authedFetch(`${apiBase}/video/complete`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ videoGuid: startJ.videoGuid }),
        });
        if (!compRes.ok) throw new Error((await compRes.json()).error || 'Video complete failed');
        const compJ = await compRes.json();
        baseBody.videoProvider = compJ.videoProvider;
        baseBody.videoProviderId = compJ.videoProviderId;
        baseBody.videoThumbnailUrl = compJ.videoThumbnailUrl;
        baseBody.videoDurationSeconds = compJ.videoDurationSeconds;
      }

      const r = await authedFetch(`${apiBase}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(baseBody) });
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
            {(['text', 'image', 'youtube', 'video', 'link', 'file', 'chatbot'] as TabType[]).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded text-xs ${tab === t ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{t}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" className="input w-full" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" className="input w-full" rows={3} />
          {(tab === 'link' || tab === 'chatbot') && <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="input w-full" />}
          {tab === 'youtube' && (
            <div className="space-y-1">
              <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="input w-full" />
              <p className="text-xs text-gray-500">Paste any YouTube link (unlisted is fine). It will play right on the board.</p>
            </div>
          )}
          {tab === 'image' && (
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input w-full" />
          )}
          {tab === 'file' && (
            caps.canUploadFiles
              ? <input type="file" accept="*/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input w-full" />
              : <div className="text-sm rounded-lg bg-violet-50 border border-violet-200 text-violet-800 px-3 py-2">File upload isn&apos;t enabled for your account yet. Ask your admin to turn it on, or share a Link instead.</div>
          )}
          {tab === 'video' && (
            caps.canUploadVideos
              ? <>
                  <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input w-full" />
                  {busy && videoPct > 0 && (
                    <div className="w-full bg-gray-200 rounded h-1.5 overflow-hidden mt-2"><div className="bg-purple-500 h-full transition-all" style={{ width: `${videoPct}%` }} /></div>
                  )}
                </>
              : <div className="text-sm rounded-lg bg-violet-50 border border-violet-200 text-violet-800 px-3 py-2">Video upload isn&apos;t enabled for your account yet. Ask your admin to turn it on, or use the <button type="button" className="underline font-semibold" onClick={() => setTab('youtube')}>YouTube</button> tab instead.</div>
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

// EDIT_MODAL_V2 ============================================
// Type-aware edit modal: edits title/description always, and
// allows replacing the content of file/image/video/link items.
// =============================================================
function EditModal({ apiBase, item, onClose, onSaved }: { apiBase: string; item: SubmissionBoardItem; onClose: () => void; onSaved: (it: SubmissionBoardItem) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title || '');
  const [description, setDescription] = useState(item.description || '');
  // Link-type editable state
  const [linkUrl, setLinkUrl] = useState(item.link_url || '');
  // Replacement file (for file/image/video)
  const [newFile, setNewFile] = useState<File | null>(null);

  const isLink = item.item_type === 'link';
  const isNote = item.item_type === 'text';
  const isFile = item.item_type === 'file';
  const isImage = item.item_type === 'image';
  const isVideo = item.item_type === 'video';

  async function save() {
    setBusy(true); setErr(null);
    try {
      const patch: any = { title: title || null, description: description || null };
      if (isLink) {
        if (!linkUrl) throw new Error('Link URL required');
        patch.linkUrl = linkUrl;
        // If link changed, re-unfurl OpenGraph metadata
        if (linkUrl !== item.link_url) {
          try {
            const pr = await authedFetch(`/api/learning-boards/link-preview?url=${encodeURIComponent(linkUrl)}`);
            if (pr.ok) {
              const pj = await pr.json();
              patch.linkTitle = pj.title || '';
              patch.linkDescription = pj.description || '';
              patch.linkImageUrl = pj.image || '';
            }
          } catch { /* non-fatal */ }
        }
      }

      // If user picked a replacement file, upload it and merge URL/IDs into patch.
      if ((isFile || isImage) && newFile) {
        const fd = new FormData();
        fd.append('file', newFile);
        const ur = await authedFetch(`${apiBase}/upload-file`, { method: 'POST', body: fd });
        if (!ur.ok) throw new Error((await ur.json()).error || 'Upload failed');
        const uj = await ur.json();
        if (isImage) {
          patch.imageUrl = uj.fileluFileUrl;
        } else {
          // For files we cannot fully replace via PATCH (need to re-create the row).
          // Strategy: send fileluFileCode + size via the dedicated POST + DELETE flow.
          // Simpler approach: delete current, post a new item, return early.
          const delRes = await authedFetch(`${apiBase}/items/${item.id}`, { method: 'DELETE' });
          if (!delRes.ok) throw new Error('Delete during replace failed');
          const newRes = await authedFetch(`${apiBase}/items`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              itemType: 'file', title: title || null, description: description || null,
              fileluFileCode: uj.fileCode, fileName: uj.fileName, fileSizeBytes: uj.sizeBytes, mimeType: uj.mimeType,
            }),
          });
          if (!newRes.ok) throw new Error((await newRes.json()).error || 'Replace failed');
          const nj = await newRes.json();
          onSaved(nj.item);
          return;
        }
      }
      if (isVideo && newFile) {
        // Video replace: delete then re-add via SubmitModal-like flow is complex.
        // For now require the user to delete + resubmit videos manually.
        throw new Error('To replace a video, please delete this submission and submit a new one.');
      }

      const r = await authedFetch(`${apiBase}/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      if (!r.ok) { setErr((await r.json()).error || 'Save failed'); return; }
      const j = await r.json();
      onSaved(j.item);
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b flex items-center justify-between"><h3 className="font-bold">Edit Submission</h3><button onClick={onClose}><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.item_type}</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="input w-full" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="input w-full" rows={3} />
          {isLink && (
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="input w-full" />
          )}
          {(isFile || isImage) && (
            <div>
              <label className="text-xs text-slate-600 block mb-1">Replace {item.item_type} (optional)</label>
              <input type="file" accept={isImage ? 'image/*' : '*/*'} onChange={(e) => setNewFile(e.target.files?.[0] || null)} className="input w-full" />
            </div>
          )}
          {isVideo && (
            <p className="text-xs text-slate-500">To replace the video, please delete this submission and submit a new one.</p>
          )}
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
