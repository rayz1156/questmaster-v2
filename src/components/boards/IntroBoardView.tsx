"use client";
import { useEffect, useState, useRef } from "react";
import { Plus, Image as ImageIcon, Upload, X, Trash2, Pencil, Loader2 } from "lucide-react";
import {
  Board, IntroPost,
  listIntroPosts, getMyIntroPost, createOrUpdateIntroPost,
  deleteIntroPost,
} from "@/lib/boards";

interface Props {
  board: Board;
  canManage: boolean; // educator/admin
  currentUserId: string | null;
}

export default function IntroBoardView({ board, canManage, currentUserId }: Props) {
  const [posts, setPosts] = useState<IntroPost[]>([]);
  const [mine, setMine] = useState<IntroPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        {posts.map(p => (
          <div key={p.id} className="group rounded-xl overflow-hidden border bg-white shadow-sm hover:shadow-md transition relative">
            <div className="aspect-square bg-gray-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url} alt={p.display_name} className="w-full h-full object-cover" />
            </div>
            <div className="p-3">
              <div className="font-semibold text-sm truncate">{p.display_name}</div>
              {p.description && <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap break-words">{p.description}</div>}
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
        ))}
      </div>

      {showModal && (
        <IntroUploadModal
          boardId={board.id}
          existing={mine}
          onClose={() => setShowModal(false)}
          onSaved={async () => { setShowModal(false); await reload(); }}
        />
      )}
    </div>
  );
}

function IntroUploadModal({ boardId, existing, onClose, onSaved }: {
  boardId: string;
  existing: IntroPost | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(existing?.image_url || null);
  const [name, setName] = useState(existing?.display_name || "");
  const [desc, setDesc] = useState(existing?.description || "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = (f: File | null) => {
    setFile(f);
    if (f) {
      const r = new FileReader();
      r.onload = e => setPreviewUrl(e.target?.result as string);
      r.readAsDataURL(f);
    }
  };

  const submit = async () => {
    setErr(null);
    if (!name.trim()) { setErr("Please enter your name."); return; }
    if (!previewUrl && !file) { setErr("Please choose an image."); return; }
    setBusy(true);
    try {
      await createOrUpdateIntroPost({
        boardId,
        displayName: name,
        description: desc,
        imageFile: file || undefined,
        existingPath: existing?.image_path,
        existingUrl: existing?.image_url,
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">{existing ? "Edit Introduction" : "Add Introduction"}</h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3">
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); onPick(e.dataTransfer.files?.[0] || null); }}
            className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-indigo-400 transition"
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="preview" className="max-h-48 mx-auto rounded" />
            ) : (
              <div className="py-6 text-gray-500">
                <Upload className="w-8 h-8 mx-auto mb-1" />
                <p className="text-sm">Click or drop an image here</p>
                <p className="text-xs">JPG/PNG/WebP/GIF · Max 10MB</p>
              </div>
            )}
            <input ref={fileInput} type="file" accept="image/*" className="hidden"
              onChange={e => onPick(e.target.files?.[0] || null)} />
          </div>
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
          <button onClick={submit} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-50 inline-flex items-center gap-2">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
