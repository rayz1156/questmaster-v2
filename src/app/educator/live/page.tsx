"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import { EDU_TABS } from "@/lib/eduTabs";
import { Plus, Trash2, Play, ListChecks } from "lucide-react";
import { listMyEducatorClasses } from "@/lib/data";
import { supabase } from "@/lib/supabase";

interface LiveQuizRow {
  id: string;
  class_id: string;
  title: string;
  description: string | null;
  created_at: string;
}

/**Permintaan dengan token Bearer pendidik. */
async function authedFetch(url: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session ? { Authorization: "Bearer " + session.access_token } : {}),
      ...(init?.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Permintaan gagal.");
  return json;
}

function SenaraiKuiz() {
  const router = useRouter();
  const sp = useSearchParams();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [classId, setClassId] = useState(sp.get("classId") || "");
  const [quizzes, setQuizzes] = useState<LiveQuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    listMyEducatorClasses()
      .then((cs) => {
        setClasses(cs);
        if (!sp.get("classId") && cs.length > 0) setClassId(cs[0].id);
      })
      .catch((e) => setErr(e.message || "Gagal memuat kelas."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = async (cid: string) => {
    if (!cid) { setQuizzes([]); return; }
    setLoading(true);
    try {
      const json = await authedFetch("/api/live/quizzes?classId=" + encodeURIComponent(cid));
      setQuizzes(json.data || []);
    } catch (e: any) {
      setErr(e.message || "Gagal memuat kuiz.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (classId) reload(classId); }, [classId]);

  const onCipta = async () => {
    setErr(null);
    if (!title.trim()) { setErr("Tajuk diperlukan."); return; }
    setBusy(true);
    try {
      await authedFetch("/api/live/quizzes", {
        method: "POST",
        body: JSON.stringify({ classId, title: title.trim(), description: desc.trim() || undefined }),
      });
      setTitle(""); setDesc(""); setShowNew(false);
      await reload(classId);
    } catch (e: any) {
      setErr(e.message || "Kuiz tidak dapat dicipta.");
    } finally { setBusy(false); }
  };

  const onPadam = async (q: LiveQuizRow) => {
    if (!window.confirm(`Padam kuiz "${q.title}"? Semua soalan akan turut dipadam.`)) return;
    try {
      await authedFetch("/api/live/quizzes/" + q.id, { method: "DELETE" });
      await reload(classId);
    } catch (e: any) {
      alert(e.message || "Gagal memadam kuiz.");
    }
  };

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="page-title">Kuiz Langsung</h2>
        <button onClick={() => setShowNew((s) => !s)} disabled={!classId} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
          <Plus className="w-4 h-4" /> Kuiz Baharu
        </button>
      </div>

      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Kelas</label>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className="input w-full max-w-xs">
          <option value="">— Pilih kelas —</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {showNew && (
        <div className="card mb-4">
          <div className="font-semibold mb-2">Cipta kuiz langsung</div>
          <input className="input w-full mb-2" placeholder="Tajuk kuiz" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input w-full mb-2" placeholder="Keterangan (pilihan)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Batal</button>
            <button type="button" disabled={busy} onClick={onCipta} className="btn-primary py-1.5 px-3 text-sm">{busy ? "Mencipta…" : "Cipta"}</button>
          </div>
          {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        </div>
      )}
      {!showNew && err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Memuat…</p>
      ) : !classId ? (
        <p className="text-sm text-gray-500">Pilih kelas untuk melihat kuiz langsung.</p>
      ) : quizzes.length === 0 ? (
        <p className="text-sm text-gray-500">Tiada kuiz langsung lagi. Cipta satu untuk memulakan sesi langsung.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {quizzes.map((q) => (
            <div key={q.id} className="card">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link href={`/educator/live/${q.id}`} className="font-semibold truncate block">{q.title}</Link>
                  {q.description && <div className="text-xs text-gray-500 truncate">{q.description}</div>}
                </div>
                <button onClick={() => onPadam(q)} title="Padam kuiz" className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center">
                <span>{new Date(q.created_at).toLocaleDateString()}</span>
                <button onClick={() => router.push(`/educator/live/${q.id}`)} className="ml-auto text-brand-purple font-semibold flex items-center gap-1">
                  <Play className="w-3 h-3" /> Urus →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

export default function HalamanKuizLangsung() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Memuat…</div>}>
      <SenaraiKuiz />
    </Suspense>
  );
}
