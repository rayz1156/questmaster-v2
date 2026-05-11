'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, hostnameFromUrl, type LearningCard, type LearningCardType, type LearningColumn } from '@/lib/learning-boards';
import VideoLightbox from './VideoLightbox';
import ImageLightbox from './ImageLightbox';
import { supabase } from '@/lib/supabase';
import { showPrompt, showConfirm } from '@/components/ui/promptModal';


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
  const [openImage, setOpenImage] = useState<{ src: string; title: string | null } | null>(null);
  const [addCardTarget, setAddCardTarget] = useState<{ columnId: string; insertIndex: number | null } | null>(null);
  const [openMenuColumnId, setOpenMenuColumnId] = useState<string | null>(null);
  // Drag-and-drop state (editor only)
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragColumnId, setDragColumnId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null);
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [colDropIdx, setColDropIdx] = useState<number | null>(null);

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

  const layoutStorageKey = `lb_layout_${classId}`;
  const [layoutMode, setLayoutMode] = useState<'columns' | 'mood'>('columns');
  useEffect(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem(layoutStorageKey) : null;
      if (saved === 'mood' || saved === 'columns') setLayoutMode(saved);
    } catch {}
  }, [layoutStorageKey]);
  const changeLayout = (m: 'columns' | 'mood') => {
    setLayoutMode(m);
    try { window.localStorage.setItem(layoutStorageKey, m); } catch {}
  };

  const moveCard = useCallback(async (cardId: string, payload: any) => {
    try {
      await authedFetch(`/api/learning-boards/${classId}/cards/${cardId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } finally { refresh(); }
  }, [classId, refresh]);
  const moveColumn = useCallback(async (columnId: string, payload: any) => {
    try {
      await authedFetch(`/api/learning-boards/${classId}/columns/${columnId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } finally { refresh(); }
  }, [classId, refresh]);

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
      <div className="px-4 pt-3 flex items-center justify-end">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => changeLayout('columns')}
            className={`px-3 py-1.5 transition ${layoutMode === 'columns' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title="Display items side by side in columns"
          >Columns</button>
          <button
            type="button"
            onClick={() => changeLayout('mood')}
            className={`px-3 py-1.5 transition border-l border-gray-200 ${layoutMode === 'mood' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            title="Display items in a visual mood-board grid"
          >Mood Board</button>
        </div>
      </div>
      {playingFileId && (
        <VideoLightbox
          classId={classId}
          fileId={playingFileId.fileId}
          title={playingFileId.title}
          onClose={() => setPlayingFileId(null)}
        />
      )}
      {openImage && (
        <ImageLightbox
          src={openImage.src}
          title={openImage.title}
          onClose={() => setOpenImage(null)}
        />
      )}

      {layoutMode === 'mood' ? (
        <MoodBoardGrid
          classId={classId}
          snap={snap}
          isEditor={isEditor}
          onPlayVideo={(fileId, title) => setPlayingFileId({ fileId, title })}
          onOpenImage={(src, title) => setOpenImage({ src, title })}
          onChanged={refresh}
          moveCard={moveCard}
        />
      ) : (
      <div
        className="flex gap-4 overflow-x-auto p-4 pb-8 min-h-[60vh]"
        onClick={() => setOpenMenuColumnId(null)}
      >
        {snap.columns.map((col, ci) => (
          <ColumnCard
            key={col.id}
            classId={classId}
            column={col}
            columnIndex={ci}
            totalColumns={snap.columns.length}
            isEditor={isEditor}
            onPlayVideo={(fileId, title) => setPlayingFileId({ fileId, title })}
            onOpenImage={(src, title) => setOpenImage({ src, title })}
            onAddCard={async (insertIndex?: number | null) => {
                  // Refresh first to ensure column still exists (avoid 'Column not found' from stale UI)
                  try { await refresh(); } catch {}
                  setAddCardTarget({ columnId: col.id, insertIndex: typeof insertIndex === 'number' ? insertIndex : null });
                }}
            onChanged={refresh}
            menuOpen={openMenuColumnId === col.id}
            onToggleMenu={(open) => setOpenMenuColumnId(open ? col.id : null)}
            dragCardId={dragCardId}
            dragColumnId={dragColumnId}
            dropTarget={dropTarget}
            onCardDragStart={(cId, colId) => { setDragCardId(cId); setDragColumnId(colId); }}
            onCardDragEnd={() => { setDragCardId(null); setDragColumnId(null); setDropTarget(null); }}
            onCardDragOver={(colId, idx) => setDropTarget({ columnId: colId, index: idx })}
            onCardDrop={(colId, idx) => { if (dragCardId) moveCard(dragCardId, { action: 'to', columnId: colId, position: idx }); setDragCardId(null); setDragColumnId(null); setDropTarget(null); }}
            moveCard={moveCard}
            moveColumn={moveColumn}
            dragColId={dragColId}
            colDropIdx={colDropIdx}
            onColumnDragStart={(id) => setDragColId(id)}
            onColumnDragEnd={() => { setDragColId(null); setColDropIdx(null); }}
            onColumnDragOverIndex={(i) => setColDropIdx(i)}
            onColumnDrop={(i) => { if (dragColId) moveColumn(dragColId, { action: 'to', position: i }); setDragColId(null); setColDropIdx(null); }}
          />
        ))}

        {isEditor && (
          <NewColumnButton classId={classId} onCreated={refresh} />
        )}
      </div>
      )}

      {addCardTarget && (
        <AddCardModal
          classId={classId}
          columnId={addCardTarget.columnId}
          insertIndex={addCardTarget.insertIndex}
          onClose={() => setAddCardTarget(null)}
          onCreated={() => { setAddCardTarget(null); refresh(); setTimeout(() => refresh(), 15000); }}
        />
      )}
    </div>
  );
}

function ColumnCard({
  classId,
  column,
  columnIndex,
  totalColumns,
  isEditor,
  onPlayVideo,
  onOpenImage,
  onAddCard,
  onChanged,
  menuOpen,
  onToggleMenu,
  dragCardId,
  dragColumnId,
  dropTarget,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  onCardDrop,
  moveCard,
  moveColumn,
  dragColId,
  colDropIdx,
  onColumnDragStart,
  onColumnDragEnd,
  onColumnDragOverIndex,
  onColumnDrop,
}: {
  classId: string;
  column: LearningColumn & { cards: LearningCard[] };
  columnIndex: number;
  totalColumns: number;
  isEditor: boolean;
  onPlayVideo: (fileId: string, title: string | null) => void;
  onOpenImage: (src: string, title: string | null) => void;
  onAddCard: (insertIndex?: number | null) => void;
  onChanged: () => void;
  menuOpen: boolean;
  onToggleMenu: (open: boolean) => void;
  dragCardId: string | null;
  dragColumnId: string | null;
  dropTarget: { columnId: string; index: number } | null;
  onCardDragStart: (cardId: string, columnId: string) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (columnId: string, index: number) => void;
  onCardDrop: (columnId: string, index: number) => void;
  moveCard: (cardId: string, payload: any) => Promise<void>;
  moveColumn: (columnId: string, payload: any) => Promise<void>;
  dragColId: string | null;
  colDropIdx: number | null;
  onColumnDragStart: (columnId: string) => void;
  onColumnDragEnd: () => void;
  onColumnDragOverIndex: (index: number) => void;
  onColumnDrop: (index: number) => void;
}) {
  const renameColumn = async () => {
    const next = await showPrompt({ title: 'Rename column', initialValue: column.title, confirmLabel: 'Save' });
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
    const ok = await showConfirm({ title: `Delete column "${column.title}"?`, description: "All cards in this column will be permanently removed. This cannot be undone.", confirmLabel: "Delete", tone: "danger" }); if (!ok) return;
    await authedFetch(`/api/learning-boards/${classId}/columns/${column.id}`, { method: 'DELETE' });
    onToggleMenu(false);
    onChanged();
  };

  const isColDragging = dragColId === column.id;
  const isColDropAfter = !!(isEditor && dragColId && dragColId !== column.id && colDropIdx === columnIndex);
  return (
    <div
      className={`flex-shrink-0 w-72 bg-white rounded-xl border ${isColDragging ? 'opacity-40 border-indigo-400' : isColDropAfter ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'} shadow-md hover:shadow-lg transition-shadow flex flex-col self-start`}
      onDragOver={(e) => {
        if (!isEditor) return;
        if (dragColId && dragColId !== column.id) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          onColumnDragOverIndex(columnIndex);
        }
      }}
      onDrop={(e) => {
        if (!isEditor) return;
        if (dragColId && dragColId !== column.id) {
          e.preventDefault();
          onColumnDrop(columnIndex);
        }
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-gray-200"
        draggable={isEditor}
        onDragStart={(e) => {
          if (!isEditor) return;
          e.dataTransfer.effectAllowed = 'move';
          try { e.dataTransfer.setData('text/plain', `col:${column.id}`); } catch {}
          onColumnDragStart(column.id);
        }}
        onDragEnd={() => onColumnDragEnd()}
      >
        <span className={`select-none ${isEditor ? 'text-gray-600 cursor-grab active:cursor-grabbing' : 'text-gray-400'}`} aria-hidden title={isEditor ? 'Drag column to reorder' : ''}>≡</span>
        <h3 className="flex-1 text-gray-900 font-semibold truncate text-sm">{column.title}</h3>
        {isEditor && (
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              className="text-gray-600 hover:text-gray-900 px-1"
              aria-label="Column menu"
              onClick={() => onToggleMenu(!menuOpen)}
            >…</button>
            {menuOpen && (
              <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-md shadow-lg w-44 text-sm">
                <button onClick={renameColumn} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700">Rename</button>
                <div className="h-px bg-gray-100" />
                <button disabled={columnIndex === 0} onClick={() => { onToggleMenu(false); moveColumn(column.id, { action: 'first' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move to first</button>
                <button disabled={columnIndex === 0} onClick={() => { onToggleMenu(false); moveColumn(column.id, { action: 'left' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move left</button>
                <button disabled={columnIndex >= totalColumns - 1} onClick={() => { onToggleMenu(false); moveColumn(column.id, { action: 'right' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move right</button>
                <button disabled={columnIndex >= totalColumns - 1} onClick={() => { onToggleMenu(false); moveColumn(column.id, { action: 'last' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move to last</button>
                <div className="h-px bg-gray-100" />
                <button onClick={deleteColumn} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-400">Delete</button>
              </div>
            )}
          </div>
        )}
      </div>

      {isEditor && (
        <button
          onClick={() => onAddCard()}
          className="mx-3 my-3 flex items-center justify-center w-10 h-10 self-center rounded-full border border-dashed border-gray-300 text-gray-600 hover:text-gray-900 hover:border-indigo-400 transition"
          aria-label="Add card"
        >+</button>
      )}

      <div
        className="px-3 pb-3 space-y-3"
        onDragOver={(e) => {
          if (!isEditor || !dragCardId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          if (!isEditor || !dragCardId) return;
          // Drop at end if dropping on empty area
          e.preventDefault();
          onCardDrop(column.id, column.cards.length);
        }}
      >
        {column.cards.length === 0 && !isEditor && (
          <div className="text-gray-500 text-xs text-center py-6">No items yet.</div>
        )}
        {column.cards.length === 0 && isEditor && dragCardId && (
          <div
            className={`h-16 rounded-md border-2 border-dashed ${dropTarget && dropTarget.columnId === column.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'}`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onCardDragOver(column.id, 0); }}
            onDrop={(e) => { e.preventDefault(); onCardDrop(column.id, 0); }}
          />
        )}
        {column.cards.map((card, idx) => {
          const isDragging = dragCardId === card.id;
          const showIndicatorBefore = isEditor && dragCardId && dropTarget && dropTarget.columnId === column.id && dropTarget.index === idx && dragCardId !== card.id;
          return (
            <div key={card.id}>
              {showIndicatorBefore && (
                <div className="h-1.5 bg-indigo-500 rounded-full mb-2" aria-hidden />
              )}
              {isEditor && (
                <InsertCardStrip onClick={() => onAddCard(idx)} />
              )}
              <div
                className={isDragging ? 'opacity-40' : ''}
                draggable={isEditor}
                onDragStart={(e) => {
                  if (!isEditor) return;
                  e.dataTransfer.effectAllowed = 'move';
                  try { e.dataTransfer.setData('text/plain', `card:${card.id}`); } catch {}
                  onCardDragStart(card.id, column.id);
                }}
                onDragEnd={() => onCardDragEnd()}
                onDragOver={(e) => {
                  if (!isEditor || !dragCardId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  // Decide drop position: above or below this card based on cursor Y
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const before = (e.clientY - rect.top) < rect.height / 2;
                  onCardDragOver(column.id, before ? idx : idx + 1);
                }}
                onDrop={(e) => {
                  if (!isEditor || !dragCardId) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const before = (e.clientY - rect.top) < rect.height / 2;
                  onCardDrop(column.id, before ? idx : idx + 1);
                }}
              >
                <CardRenderer
                  classId={classId}
                  card={card}
                  cardIndex={idx}
                  totalCards={column.cards.length}
                  isEditor={isEditor}
                  onPlayVideo={onPlayVideo}
                  onOpenImage={onOpenImage}
                  onChanged={onChanged}
                  moveCard={moveCard}
                />
              </div>
            </div>
          );
        })}
        {isEditor && dragCardId && dropTarget && dropTarget.columnId === column.id && dropTarget.index === column.cards.length && (
          <div className="h-1.5 bg-indigo-500 rounded-full" aria-hidden />
        )}
        {isEditor && column.cards.length > 0 && (
          <InsertCardStrip onClick={() => onAddCard(column.cards.length)} />
        )}
      </div>
    </div>
  );
}

function InsertCardStrip({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Insert card here"
      className="group block w-full my-1 py-1 flex items-center justify-center text-slate-300 hover:text-indigo-500 transition-colors"
    >
      <span className="flex-1 h-px bg-slate-200 group-hover:bg-indigo-300 transition-colors" />
      <span className="mx-2 w-5 h-5 rounded-full border border-current flex items-center justify-center text-xs leading-none">+</span>
      <span className="flex-1 h-px bg-slate-200 group-hover:bg-indigo-300 transition-colors" />
    </button>
  );
}

function NewColumnButton({ classId, onCreated }: { classId: string; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const create = async () => {
    const title = await showPrompt({ title: 'New column', placeholder: 'e.g. Modul 4', confirmLabel: 'Create' });
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
  cardIndex,
  totalCards,
  isEditor,
  onPlayVideo,
  onOpenImage,
  onChanged,
  moveCard,
}: {
  classId: string;
  card: LearningCard;
  cardIndex: number;
  totalCards: number;
  isEditor: boolean;
  onPlayVideo: (fileId: string, title: string | null) => void;
  onOpenImage: (src: string, title: string | null) => void;
  onChanged: () => void;
  moveCard: (cardId: string, payload: any) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDelete = async () => {
    const ok = await showConfirm({ title: "Delete this card?", description: "This action cannot be undone.", confirmLabel: "Delete", tone: "danger" }); if (!ok) return;
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
      if ((card as any).is_qr && card.link_image_url) {
        return (
          <div className="relative">
            <button
              type="button"
              onClick={() => onOpenImage(card.link_image_url!, card.title || 'QR code')}
              className="block w-full bg-white rounded-md overflow-hidden cursor-zoom-in group"
              aria-label="View QR code full screen"
            >
              <div className="aspect-square bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={card.link_image_url} alt={card.title || 'QR code'} className="w-full h-full object-contain transition-opacity group-hover:opacity-90" />
              </div>
            </button>
            <a
              href={card.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-1 right-1 inline-flex items-center gap-1 bg-indigo-600 text-white text-[11px] px-2 py-0.5 rounded-md hover:bg-indigo-500"
              title="Open link"
            >Open ↗</a>
          </div>
        );
      }
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
      <button
        type="button"
        onClick={() => onOpenImage(card.image_url!, card.title || null)}
        className="block w-full rounded-md overflow-hidden bg-white cursor-zoom-in group"
        aria-label="View image full screen"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.image_url} alt={card.title || ''} className="w-full object-cover transition-opacity group-hover:opacity-90" />
      </button>
    );
  }
    if (card.card_type === 'file' && card.file_url) {
      const ext = (card.file_extension || '').toLowerCase();
      const sizeKb = card.file_size_bytes ? Math.round(card.file_size_bytes / 1024) : null;
      const sizeLabel = sizeKb == null ? '' : sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;
      const iconBg =
        ext === 'pdf' ? 'bg-red-100 text-red-700' :
        ext === 'doc' || ext === 'docx' ? 'bg-blue-100 text-blue-700' :
        ext === 'xls' || ext === 'xlsx' || ext === 'csv' ? 'bg-emerald-100 text-emerald-700' :
        ext === 'ppt' || ext === 'pptx' ? 'bg-orange-100 text-orange-700' :
        ext === 'zip' || ext === 'rar' || ext === '7z' ? 'bg-amber-100 text-amber-800' :
        'bg-slate-100 text-slate-700';
      return (
        <a
          href={card.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md bg-white p-2 hover:bg-slate-50 transition-colors"
          title={card.file_name || ''}
        >
          <div className={`w-12 h-14 rounded-md flex items-center justify-center text-[10px] font-bold ${iconBg}`}>
            {ext ? ext.toUpperCase().slice(0, 4) : 'FILE'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{card.file_name || card.title || 'File'}</div>
            <div className="text-xs text-gray-500">{sizeLabel}</div>
          </div>
        </a>
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

  const title = card.card_type === 'link' ? (card.link_title || card.title) : (card.card_type === 'file' ? (card.title || card.file_name) : card.title);
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
              <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-md shadow-lg w-44 text-sm">
                <button disabled={cardIndex === 0} onClick={() => { setMenuOpen(false); moveCard(card.id, { action: 'top' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move to top</button>
                <button disabled={cardIndex === 0} onClick={() => { setMenuOpen(false); moveCard(card.id, { action: 'up' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move up</button>
                <button disabled={cardIndex >= totalCards - 1} onClick={() => { setMenuOpen(false); moveCard(card.id, { action: 'down' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move down</button>
                <button disabled={cardIndex >= totalCards - 1} onClick={() => { setMenuOpen(false); moveCard(card.id, { action: 'bottom' }); }} className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">Move to bottom</button>
                <div className="h-px bg-gray-100" />
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
  insertIndex,
  onClose,
  onCreated,
}: {
  classId: string;
  columnId: string;
  insertIndex?: number | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tab, setTab] = useState<LearningCardType | 'qr'>('link');
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
          {(['link', 'qr', 'text', 'file', 'image', 'video'] as Array<LearningCardType | 'qr'>).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 px-3 py-1.5 rounded-md text-sm capitalize ${tab === t ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900'}`}
            >{t}</button>
          ))}
        </div>
        {tab === 'video' && <VideoForm classId={classId} columnId={columnId} insertIndex={insertIndex ?? null} onCreated={onCreated} />}
        {tab === 'link'  && <LinkForm  classId={classId} columnId={columnId} insertIndex={insertIndex ?? null} onCreated={onCreated} />}
          {tab === 'qr'    && <QRForm    classId={classId} columnId={columnId} insertIndex={insertIndex ?? null} onCreated={onCreated} />}
        {tab === 'image' && <ImageForm classId={classId} columnId={columnId} insertIndex={insertIndex ?? null} onCreated={onCreated} />}
        {tab === 'file'  && <FileForm  classId={classId} columnId={columnId} insertIndex={insertIndex ?? null} onCreated={onCreated} />}
        {tab === 'text'  && <TextForm  classId={classId} columnId={columnId} insertIndex={insertIndex ?? null} onCreated={onCreated} />}
      </div>
    </div>
  );
}

function VideoForm({ classId, columnId, insertIndex, onCreated }: { classId: string; columnId: string; insertIndex: number | null; onCreated: () => void }) {
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
          insertIndex,
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
          key: initData.key,
          eTag,
          projectId: initData.projectId,
          filename: file.name,
          mimeType: file.type || 'video/mp4',
          sizeBytes: file.size,
          durationSeconds,
          title: title || file.name,
          description,
          insertIndex,
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

function LinkForm({ classId, columnId, insertIndex, onCreated }: { classId: string; columnId: string; insertIndex: number | null; onCreated: () => void }) {
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
          insertIndex,
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

function QRForm({ classId, columnId, insertIndex, onCreated }: { classId: string; columnId: string; insertIndex: number | null; onCreated: () => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    if (!url.trim()) { setErr('Please enter a URL.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await authedFetch(`/api/learning-boards/${classId}/qr-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId, url: url.trim(), title: title.trim() || null, insertIndex }),
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
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      <p className="text-xs text-gray-500">A QR code image will be generated for this URL. Tapping the card opens the URL; the QR enlarges when clicked.</p>
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <button
        onClick={submit}
        disabled={!url.trim() || busy}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md py-2 text-sm"
      >{busy ? 'Creating QR...' : 'Add QR card'}</button>
    </div>
  );
}

function ImageForm({ classId, columnId, insertIndex, onCreated }: { classId: string; columnId: string; insertIndex: number | null; onCreated: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!file) { setErr('Choose an image'); return; }
    setBusy(true); setErr(null); setProgress(0);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await authedFetch(`/api/learning-boards/${classId}/upload-file`, {
        method: 'POST',
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || 'Upload failed');
      setProgress(70);

      // Image card stores the FileLu redirect endpoint as image_url so <img src> works.
      const imageUrl = `/api/learning-boards/${classId}/file-redirect/${upData.fileCode}`;

      const cardRes = await authedFetch(`/api/learning-boards/${classId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          cardType: 'image',
          title: title || null,
          imageUrl,
          fileluFileCode: upData.fileCode,
          insertIndex,
        }),
      });
      const cardData = await cardRes.json();
      if (!cardRes.ok) throw new Error(cardData.error || 'Failed to create card');
      setProgress(100);
      onCreated();
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={busy}
        className="w-full text-sm text-gray-900 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:font-medium hover:file:bg-indigo-500 file:cursor-pointer disabled:opacity-50"
      />
      {file && (
        <div className="text-xs text-gray-600">
          {file.name} · {file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`}
        </div>
      )}
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Caption (optional)"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      {busy && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <button
        onClick={submit}
        disabled={!file || busy}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md py-2 text-sm"
      >{busy ? 'Uploading…' : 'Add image'}</button>
    </div>
  );
}
function TextForm({ classId, columnId, insertIndex, onCreated }: { classId: string; columnId: string; insertIndex: number | null; onCreated: () => void }) {
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
        body: JSON.stringify({ columnId, cardType: 'text', title: title || null, description: description || null, insertIndex }),
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

function FileForm({ classId, columnId, insertIndex, onCreated }: { classId: string; columnId: string; insertIndex: number | null; onCreated: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!file) { setErr('Choose a file'); return; }
    setBusy(true); setErr(null); setProgress(0);
    try {
      // 1) Upload to Supabase Storage via our API route
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await authedFetch(`/api/learning-boards/${classId}/upload-file`, {
        method: 'POST',
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || 'Upload failed');
      setProgress(70);

      // 2) Create the card record
      // File card stores the FileLu redirect endpoint as file_url so it works
      // even when FileLu has not made the share link public.
      const fileUrl = `/api/learning-boards/${classId}/file-redirect/${upData.fileCode}`;
      const cardRes = await authedFetch(`/api/learning-boards/${classId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId,
          cardType: 'file',
          title: title || null,
          fileUrl,
          filePath: upData.filePath,
          fileName: upData.fileName,
          fileMimeType: upData.fileMimeType,
          fileSizeBytes: upData.fileSizeBytes,
          fileExtension: upData.fileExtension,
          fileluFileCode: upData.fileCode,
          insertIndex,
        }),
      });
      const cardData = await cardRes.json();
      if (!cardRes.ok) throw new Error(cardData.error || 'Failed to create card');
      setProgress(100);
      onCreated();
    } catch (e: any) {
      setErr(e.message || 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.odt,.ods,.odp,.zip,.rar,.7z,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        disabled={busy}
        className="w-full text-sm text-gray-900 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-indigo-600 file:text-white file:text-sm file:font-medium hover:file:bg-indigo-500 file:cursor-pointer disabled:opacity-50"
      />
      {file && (
        <div className="text-xs text-gray-600">
          {file.name} · {file.size >= 1024 * 1024 ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`}
        </div>
      )}
      <input
        value={title} onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm placeholder-gray-400"
      />
      {busy && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
      {err && <div className="text-red-400 text-xs">{err}</div>}
      <button
        onClick={submit}
        disabled={!file || busy}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-md py-2 text-sm"
      >{busy ? 'Uploading…' : 'Upload file'}</button>
      <div className="text-[11px] text-gray-500">Supports PDF, Word, Excel, PowerPoint, text, archives, and more (up to 50 MB).</div>
    </div>
  );
}

function MoodBoardGrid({
  classId,
  snap,
  isEditor,
  onPlayVideo,
  onOpenImage,
  onChanged,
  moveCard,
}: {
  classId: string;
  snap: Snapshot;
  isEditor: boolean;
  onPlayVideo: (fileId: string, title: string | null) => void;
  onOpenImage: (src: string, title: string | null) => void;
  onChanged: () => void;
  moveCard: (cardId: string, payload: any) => Promise<void>;
}) {
  // Flatten every card across every column into one stream for the visual board.
  const allCards = snap.columns.flatMap((col) => (col.cards || []).map((c: LearningCard) => ({ card: c, columnTitle: col.title })));
  if (allCards.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        {isEditor
          ? 'No items yet. Switch to Columns to add a column, then add cards inside it.'
          : 'No items have been added to this board yet.'}
      </div>
    );
  }
  return (
    <div className="p-4 pb-8 min-h-[60vh]">
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {allCards.map(({ card, columnTitle }, idx) => (
          <div
            key={card.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition overflow-hidden flex flex-col"
          >
            <div className="p-3">
              <CardRenderer
                classId={classId}
                card={card}
                cardIndex={idx}
                totalCards={allCards.length}
                isEditor={isEditor}
                onPlayVideo={onPlayVideo}
                onOpenImage={onOpenImage}
                onChanged={onChanged}
                moveCard={moveCard}
              />
            </div>
            <div className="px-3 pb-2 text-[10px] uppercase tracking-wide text-gray-400 truncate" title={columnTitle}>{columnTitle}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
