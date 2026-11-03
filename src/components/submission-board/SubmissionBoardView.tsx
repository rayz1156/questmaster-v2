'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from 'react';
import { Download, Edit2, Trash2, Plus, Lock, Unlock, Eye, EyeOff, Users, X, FileText, Image as ImageIcon, Video, Link as LinkIcon, Paperclip } from 'lucide-react';
import { buildVideoEmbedUrl, parseYouTubeId, type VideoProvider } from '@/lib/video-embed';
import { useCapabilities } from '@/lib/useCapabilities';
import type { SubmissionBoard, SubmissionBoardColumn, SubmissionBoardItem, SubmissionItemType, SubmissionVisibility } from '@/lib/submission-boards';
import { mampatImej } from '@/lib/mampatImej';

import { supabase } from '@/lib/supabase';
import { ConfirmDialog } from '@/components/ui/PromptDialog';
import { LOKAL, terjemahBilangan } from '@/lib/i18n';
import { useBahasa } from '@/lib/i18n/BahasaProvider';

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

export default function SubmissionBoardView({ huntId, classId, initialBoard, initialItems, myRole, myId, initialColumns = []}: Props) {
  const { t, bahasa } = useBahasa();
  // Dilindung di dalam komponen kerana fungsi terjemahan t tiada pada
  // peringkat modul.
  function visibilityLabel(v: SubmissionVisibility) {
    if (v === 'public') return t('boards.submission.visPublic');
    if (v === 'private') return t('boards.submission.visPrivate');
    return t('boards.submission.visClassScoped');
  }
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
    const r = await authedFetch(apiBase, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: t('boards.submission.createBoardTitle') }) });
    if (!r.ok) { setErr((await r.json()).error || t('boards.submission.createBoardFailed')); }
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
    // Namakan semula supaya tidak bertembung dengan fungsi terjemahan t.
    const tajuk = newColTitle.trim();
    if (!tajuk) return;
    setAddingCol(true);
    setErr(null);
    try {
      const r = await authedFetch(apiBase + '/columns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: tajuk })
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || t('boards.submission.failedCreateColumn'));
      setColumns([...columns, j.column]);
      setNewColTitle('');
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setAddingCol(false);
    }
  }

  async function renameColumn(columnId: string, title: string) {
    // Namakan semula supaya tidak bertembung dengan fungsi terjemahan t.
    const tajuk = title.trim();
    if (!tajuk) return;
    const prev = columns;
    setColumns(columns.map((c) => c.id === columnId ? { ...c, title: tajuk } : c));
    setEditingColId(null);
    try {
      const r = await authedFetch(apiBase + '/columns/' + columnId, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: tajuk })
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || t('boards.submission.failedRename'));
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
      setErr(terjemahBilangan(bahasa, 'boards.submission.colItemsOne', 'boards.submission.colItemsOther', itemsHere.length, { n: itemsHere.length }));
      return;
    }
    const desc = itemsHere.length > 0
      ? terjemahBilangan(bahasa, 'boards.submission.detachedOne', 'boards.submission.detachedOther', itemsHere.length, { n: itemsHere.length })
      : t('boards.submission.actionCannotUndo');
    setConfirmState({
      title: t('boards.submission.deleteColumnTitle', { tajuk: col.title }),
      description: desc,
      confirmLabel: t('boards.submission.deleteLabel'),
      tone: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        const prevCols = columns;
        setColumns(columns.filter((c) => c.id !== columnId));
        try {
          const r = await authedFetch(apiBase + '/columns/' + columnId, { method: 'DELETE' });
          if (!r.ok) {
            const j = await r.json().catch(() => ({}));
            throw new Error(j.error || t('boards.submission.failedDeleteColumn'));
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
        throw new Error(j.error || t('boards.submission.failedMoveCard'));
      }
    } catch (e: any) {
      setErr(e.message || String(e));
      setItems(prev);
    }
  }

  async function deleteItem(id: string) {
    setConfirmState({
      title: t('boards.submission.deleteItemTitle'),
      description: t('boards.submission.actionCannotUndo'),
      confirmLabel: t('boards.submission.deleteLabel'),
      tone: 'danger',
      onConfirm: async () => {
        setConfirmState(null);
        const r = await authedFetch(`${apiBase}/items/${id}`, { method: 'DELETE' });
        if (r.ok) setItems(items.filter((i) => i.id !== id));
        else setErr((await r.json()).error || t('boards.submission.deleteFailed'));
      },
    });
  }

  if (!board) {
    return (
      <div className="card p-6 text-center">
        <p className="text-sm text-gray-600 mb-3">{t('boards.submission.noBoard')}</p>
        {isEducator ? (
          <button onClick={createBoard} disabled={savingBoard} className="btn-primary inline-flex items-center gap-2 px-4 py-2">
            <Plus className="w-4 h-4" /> {t('boards.submission.createBoardBtn')}
          </button>
        ) : (
          <p className="text-xs text-gray-500">{t('boards.submission.askEducator')}</p>
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
              {board.is_open ? t('boards.submission.openLabel') : t('boards.submission.closedLabel')}
            </span>
            <span className="text-gray-500 inline-flex items-center gap-1"><Users className="w-3 h-3" /> {terjemahBilangan(bahasa, 'boards.submission.submissionOne', 'boards.submission.submissionOther', items.length, { n: items.length })}</span>
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
                <option value="class_scoped">{t('boards.submission.visClassScoped')}</option>
                <option value="public">{t('boards.submission.visPublic')}</option>
                <option value="private">{t('boards.submission.visPrivate')}</option>
              </select>
              <button onClick={() => updateBoard({ is_open: !board.is_open })} disabled={savingBoard} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs">
                {board.is_open ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {board.is_open ? t('boards.submission.closeLabel') : t('boards.submission.openLabel')}
              </button>
            </>
          )}
          {board.is_open && (
            <button onClick={() => setShowSubmit(true)} className="btn-primary inline-flex items-center gap-1 px-3 py-1.5 text-sm">
              <Plus className="w-4 h-4" /> {t('boards.submission.newSubmission')}
            </button>
          )}
        </div>
      </div>

      {/* Layout toolbar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-600">{t('boards.submission.viewLabel')}</span>
        <div className="inline-flex rounded-md overflow-hidden border border-gray-200">
          <button
            type="button"
            onClick={() => changeLayout('columns')}
            disabled={savingBoard}
            className={`px-3 py-1.5 transition ${layoutMode === 'columns' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title={t('boards.submission.layoutColumnsTitle')}
          >{t('boards.submission.layoutColumns')}</button>
          <button
            type="button"
            onClick={() => changeLayout('mood')}
            disabled={savingBoard}
            className={`px-3 py-1.5 transition ${layoutMode === 'mood' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title={t('boards.submission.layoutMoodTitle')}
          >{t('boards.submission.layoutMood')}</button>
        </div>
        <span className="text-gray-400">·</span>
        <span className="text-gray-500">{terjemahBilangan(bahasa, 'boards.submission.itemOne', 'boards.submission.itemOther', items.length, { n: items.length })} {t('boards.submission.wordIn')} {terjemahBilangan(bahasa, 'boards.submission.columnOne', 'boards.submission.columnOther', Math.max(1, columns.length), { n: Math.max(1, columns.length) })}</span>
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
          onSetEditingCol={(id, tajuk) => { setEditingColId(id); setEditingColTitle(tajuk); }}
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
          <div className="card p-6 text-center text-sm text-gray-500">{t('boards.submission.noSubmissions')}</div>
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
          classId={classId}
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
        confirmLabel={confirmState?.confirmLabel ?? t('common.confirm')}
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
  const { t } = useBahasa();
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
                  title={t('boards.submission.clickRename')}
                >{col.title}</button>
              )}
              <span className="text-xs text-gray-500">{colItems.length}</span>
              <button
                type="button"
                onClick={() => onDeleteColumn(col.id)}
                className="text-xs text-gray-400 hover:text-red-600 px-1"
                title={colItems.length > 0 && !isEducator ? t('boards.submission.colNotEmptyTitle') : t('boards.submission.deleteColumnLabel')}
              >✕</button>
            </div>
            <div className="flex flex-col gap-2 min-h-[40px] max-h-[60vh] overflow-y-auto pr-1 -mr-1">
              {colItems.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3 border border-dashed border-gray-200 rounded">{t('boards.submission.dropHere')}</div>
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
          <button type="button" onClick={() => onRequestAddToColumn(col.id)} className="text-xs text-gray-500 hover:text-indigo-700 border border-dashed border-gray-300 hover:border-indigo-400 rounded py-1.5 mt-1" title={t('boards.submission.uploadHereTitle')}>{t('boards.submission.uploadHere')}</button>
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
          <div className="text-sm font-semibold text-yellow-800 px-1">{t('boards.submission.uncategorisedCount', { n: orphanItems.length })}</div>
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
        <button type="button" onClick={() => onRequestAddToColumn(null)} className="text-xs text-yellow-700 hover:text-yellow-900 border border-dashed border-yellow-300 hover:border-yellow-500 rounded py-1.5 mt-1" title={t('boards.submission.uploadUncatTitle')}>{t('boards.submission.uploadBtn')}</button>
          </div>
        </div>
      )}

      {/* Add column */}
      <div className="flex-shrink-0 w-72">
        <div className="bg-white rounded-lg p-2 border border-dashed border-gray-300">
          <div className="flex items-center gap-1">
            <input
              type="text"
              placeholder={t('boards.submission.newColPlaceholder')}
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
            >{t('boards.submission.addLabel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, myId, isEducator, onEdit, onDelete, columns, onMoveCol }: { item: SubmissionBoardItem; myId: string; isEducator: boolean; onEdit: () => void; onDelete: () => void; columns: SubmissionBoardColumn[]; onMoveCol: (colId: string | null) => void }) {
  const { t, bahasa } = useBahasa();
  const isOwner = item.submitted_by === myId;
  const canEdit = isOwner || isEducator;

  return (
    <div className="card p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2">
        <ItemTypeBadge type={item.item_type} />
        <div className="min-w-0 flex-1">
          {item.title && <p className="text-sm font-semibold truncate">{item.title}</p>}
          {item.submitter && <p className="text-xs text-gray-500 truncate">{item.submitter.display_name || t('common.student')}</p>}
        </div>
      </div>

      {item.item_type === 'image' && item.image_url && (
        <a href={item.image_url} target="_blank" rel="noopener noreferrer" className="block">
          <img src={item.image_url} alt={item.title || t('boards.submission.submissionImageAlt')} referrerPolicy="no-referrer" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="w-full h-40 object-cover rounded" />
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
            <a href={vSrc} target="_blank" rel="noopener noreferrer" title={t('boards.submission.openVideoTitle')} className="absolute top-1 right-1 z-10 bg-black/70 hover:bg-black/90 text-white text-[10px] font-semibold px-2 py-1 rounded shadow-md transition">{t('boards.submission.enlarge')}</a>
          </div>
        );
      })()}
      {item.item_type === 'link' && item.link_url && (
        <a href={item.link_url} target="_blank" rel="noopener noreferrer" className="flex gap-2 p-2 rounded bg-gray-50 hover:bg-gray-100 text-xs">
          {item.link_image_url && <img src={item.link_image_url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="w-16 h-16 object-cover rounded" />}
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
            <p className="font-semibold truncate">{item.file_name || t('common.download')}</p>
            <p className="text-gray-500">{item.file_mime_type} · {formatBytes(item.file_size_bytes)}</p>
          </div>
          <Download className="w-4 h-4" />
        </a>
      )}
      {item.item_type === 'chatbot' && item.chatbot_url && (
        <a href={item.chatbot_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded bg-indigo-50 hover:bg-indigo-100 text-xs">
          <span className="w-8 h-8 rounded flex items-center justify-center bg-indigo-100 text-indigo-600 font-bold">AI</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold truncate text-indigo-700">{item.title || t('boards.submission.assistantFallback')}</span>
            <span className="block text-indigo-500">{t('boards.submission.openAssistant')}</span>
          </span>
        </a>
      )}
      {item.description && <p className="text-xs text-gray-700 whitespace-pre-wrap break-words line-clamp-4 max-h-24 overflow-hidden">{item.description}</p>}

      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-100 text-xs text-gray-500">
        <span title={new Date(item.created_at).toLocaleString(LOKAL[bahasa])}>{new Date(item.created_at).toLocaleDateString(LOKAL[bahasa])} {new Date(item.created_at).toLocaleTimeString(LOKAL[bahasa], { hour: '2-digit', minute: '2-digit' })}</span>
        <div className="flex items-center gap-2">
          {(item.item_type === 'file' || item.item_type === 'image') && (item.file_url || item.image_url) && (
            <a href={item.file_url || item.image_url!} download className="hover:text-gray-900" title={t('common.download')}><Download className="w-4 h-4" /></a>
          )}
          {(canEdit || isEducator) && columns.length > 0 && (() => { const idx = columns.findIndex(c => c.id === item.column_id); const prev = idx > 0 ? columns[idx-1] : null; const next = idx >= 0 && idx < columns.length-1 ? columns[idx+1] : null; return (<><button type="button" onClick={() => onMoveCol(prev ? prev.id : null)} disabled={idx === 0 && !item.column_id} className="hover:text-indigo-700 disabled:opacity-30 px-1" title={prev ? t('boards.submission.moveWithTitle', { tajuk: prev.title }) : t('boards.submission.moveToUncategorised')}>←</button><button type="button" onClick={() => onMoveCol(next ? next.id : (columns[0]?.id || null))} className="hover:text-indigo-700 px-1" title={next ? t('boards.submission.moveWithTitle', { tajuk: next.title }) : (columns[0] ? t('boards.submission.moveWithTitle', { tajuk: columns[0].title }) : t('boards.submission.moveLabel'))}>→</button></>); })()}
        {canEdit && <button onClick={onEdit} className="hover:text-gray-900" title={t('boards.submission.editLabel')}><Edit2 className="w-4 h-4" /></button>}
          {canEdit && <button onClick={onDelete} className="hover:text-red-600" title={t('boards.submission.deleteLabel')}><Trash2 className="w-4 h-4" /></button>}
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
function SubmitModal({ apiBase, classId, isEducator, columnId, onClose, onCreated }: { apiBase: string; classId: string; isEducator: boolean; columnId: string | null; onClose: () => void; onCreated: (item: SubmissionBoardItem) => void }) {
  const { t } = useBahasa();
  const [tab, setTab] = useState<TabType>('text');
  // KZ-017: keupayaan dalam konteks kelas supaya pelajar mengikut kebenaran
  // pemilik kelas, bukan hanya bendera akaun sendiri.
  const caps = useCapabilities(classId);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // type-specific state
  const [linkUrl, setLinkUrl] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const baseBody: any = { itemType: tab === 'youtube' ? 'video' : tab, title: title || null, description: description || null, columnId: columnId || null };

      if (tab === 'text') {
        if (!title && !description) throw new Error(t('boards.submission.titleOrDescRequired'));
      } else if (tab === 'link') {
        if (!linkUrl) throw new Error(t('boards.submission.linkUrlRequired'));
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
        if (!file) throw new Error(t('boards.submission.chooseFileRequired'));
        const fd = new FormData();
        fd.append('file', tab === 'image' ? await mampatImej(file) : file);
        const ur = await authedFetch(`${apiBase}/upload-file`, { method: 'POST', body: fd });
        if (!ur.ok) throw new Error((await ur.json()).error || t('boards.submission.uploadFailed'));
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
        if (!raw) throw new Error(t('boards.submission.ytUrlRequired'));
        if (!parseYouTubeId(raw)) throw new Error(t('boards.submission.invalidYoutube'));
        baseBody.videoProvider = 'youtube';
        baseBody.youtubeUrl = raw;
      }
      // KZ-039: tab 'video' (muat naik terus) dan 'chatbot' dibuang;
      // video hanya melalui tab YouTube di atas.

      const r = await authedFetch(`${apiBase}/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(baseBody) });
      if (!r.ok) throw new Error((await r.json()).error || t('boards.submission.createFailed'));
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
          <h3 className="font-bold">{t('boards.submission.newSubmission')}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-1 flex-wrap">
            {/* KZ-039: tab 'video' (muat naik terus) dan 'chatbot' dibuang. */}
            {(['text', 'image', 'youtube', 'link', 'file'] as TabType[]).map((jenis) => (
              <button key={jenis} onClick={() => setTab(jenis)} className={`px-3 py-1.5 rounded text-xs ${tab === jenis ? 'bg-purple-600 text-white' : 'bg-gray-100'}`}>{t(jenis === 'text' ? 'boards.submission.tabText' : jenis === 'image' ? 'boards.submission.tabImage' : jenis === 'youtube' ? 'boards.submission.tabYoutube' : jenis === 'link' ? 'boards.submission.tabLink' : 'boards.submission.tabFile')}</button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('boards.submission.titleOptional')} className="input w-full" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('boards.submission.descOptional')} className="input w-full" rows={3} />
          {tab === 'link' && <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="input w-full" />}
          {tab === 'youtube' && (
            <div className="space-y-1">
              <input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="input w-full" />
              <p className="text-xs text-gray-500">{t('boards.submission.ytNote')}</p>
            </div>
          )}
          {tab === 'image' && (
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input w-full" />
          )}
          {tab === 'file' && (
            caps.canUploadFiles
              ? <input type="file" accept="*/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="input w-full" />
              : <div className="text-sm rounded-lg bg-violet-50 border border-violet-200 text-violet-800 px-3 py-2">{t('boards.submission.uploadDisabled')}</div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm">{t('common.cancel')}</button>
          <button onClick={submit} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">{busy ? t('boards.submission.submitting') : t('boards.submission.submitLabel')}</button>
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
  const { t } = useBahasa();
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
        if (!linkUrl) throw new Error(t('boards.submission.linkUrlRequired'));
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
        if (!ur.ok) throw new Error((await ur.json()).error || t('boards.submission.uploadFailed'));
        const uj = await ur.json();
        if (isImage) {
          patch.imageUrl = uj.fileluFileUrl;
        } else {
          // For files we cannot fully replace via PATCH (need to re-create the row).
          // Strategy: send fileluFileCode + size via the dedicated POST + DELETE flow.
          // Simpler approach: delete current, post a new item, return early.
          const delRes = await authedFetch(`${apiBase}/items/${item.id}`, { method: 'DELETE' });
          if (!delRes.ok) throw new Error(t('boards.submission.deleteReplaceFailed'));
          const newRes = await authedFetch(`${apiBase}/items`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              itemType: 'file', title: title || null, description: description || null,
              fileluFileCode: uj.fileCode, fileName: uj.fileName, fileSizeBytes: uj.sizeBytes, mimeType: uj.mimeType,
            }),
          });
          if (!newRes.ok) throw new Error((await newRes.json()).error || t('boards.submission.replaceFailed'));
          const nj = await newRes.json();
          onSaved(nj.item);
          return;
        }
      }
      if (isVideo && newFile) {
        // Video replace: delete then re-add via SubmitModal-like flow is complex.
        // For now require the user to delete + resubmit videos manually.
        throw new Error(t('boards.submission.videoReplaceHint'));
      }

      const r = await authedFetch(`${apiBase}/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      if (!r.ok) { setErr((await r.json()).error || t('boards.submission.saveFailed')); return; }
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
        <div className="p-4 border-b flex items-center justify-between"><h3 className="font-bold">{t('boards.submission.editSubmission')}</h3><button onClick={onClose}><X className="w-5 h-5" /></button></div>
        <div className="p-4 space-y-3">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{item.item_type}</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('boards.submission.titlePlaceholder')} className="input w-full" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('boards.submission.descPlaceholder')} className="input w-full" rows={3} />
          {isLink && (
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="input w-full" />
          )}
          {(isFile || isImage) && (
            <div>
              <label className="text-xs text-slate-600 block mb-1">{t('boards.submission.replaceTypeOptional', { jenis: item.item_type })}</label>
              <input type="file" accept={isImage ? 'image/*' : '*/*'} onChange={(e) => setNewFile(e.target.files?.[0] || null)} className="input w-full" />
            </div>
          )}
          {isVideo && (
            <p className="text-xs text-slate-500">{t('boards.submission.videoReplaceHint')}</p>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary px-3 py-1.5 text-sm">{t('common.cancel')}</button>
          <button onClick={save} disabled={busy} className="btn-primary px-3 py-1.5 text-sm">{busy ? t('boards.submission.saving') : t('boards.submission.saveLabel')}</button>
        </div>
      </div>
    </div>
  );
}
