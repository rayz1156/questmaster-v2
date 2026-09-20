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
  class_id: string | null;
  owner_id: string;
  title: string;
  description: string | null;
  created_at: string;
  /** Nama kelas daripada join qm_classes (null untuk kuiz peribadi). */
  class?: { name: string } | null;
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
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json;
}

function SenaraiKuiz() {
  const router = useRouter();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  // Datang dari jubin Quiz pada dashboard kelas: tapis senarai dan pilih
  // kelas itu terlebih dahulu dalam borang cipta.
  const sp = useSearchParams();
  const tapisKelas = sp.get("classId") || "";
  const [newClassId, setNewClassId] = useState(tapisKelas); // kosong = kuiz peribadi
  const [quizzes, setQuizzes] = useState<LiveQuizRow[]>([]);
  const [maxLivePlayers, setMaxLivePlayers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // Senarai kuiz: semua kuiz yang boleh dihoskan (peribadi + kelas),
    // bukan lagi tapisan ikut kelas.
    authedFetch("/api/live/quizzes")
      .then((json) => setQuizzes(json.data || []))
      .catch((e) => setErr(e.message || "Could not load your quizzes."));

    listMyEducatorClasses()
      .then((cs) => setClasses(cs))
      .catch((e) => setErr(e.message || "Could not load your classes."));

    // Had pemain pengguna daripada profil (kelayakan pelan).
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("qm_profiles")
        .select("max_live_players")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          const p = data as { max_live_players?: number } | null;
          if (p?.max_live_players) setMaxLivePlayers(p.max_live_players);
        });
    });

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setNewClassId(tapisKelas); }, [tapisKelas]);

  const reload = async () => {
    setLoading(true);
    try {
      const json = await authedFetch("/api/live/quizzes");
      setQuizzes(json.data || []);
    } catch (e) {
      setErr((e instanceof Error ? e.message : null) || "Could not load your quizzes.");
    } finally {
      setLoading(false);
    }
  };

  const onCipta = async () => {
    setErr(null);
    if (!title.trim()) { setErr("A title is required."); return; }
    setBusy(true);
    try {
      // Hantar classId hanya jika kelas dipilih; kosong bermakna kuiz peribadi.
      await authedFetch("/api/live/quizzes", {
        method: "POST",
        body: JSON.stringify({
          ...(newClassId ? { classId: newClassId } : {}),
          title: title.trim(),
          description: desc.trim() || undefined,
        }),
      });
      setTitle(""); setDesc(""); setNewClassId(""); setShowNew(false);
      await reload();
    } catch (e) {
      setErr((e instanceof Error ? e.message : null) || "The quiz could not be created.");
    } finally { setBusy(false); }
  };

  const onPadam = async (q: LiveQuizRow) => {
    if (!window.confirm(`Delete the quiz "${q.title}"? All of its questions will be deleted too.`)) return;
    try {
      await authedFetch("/api/live/quizzes/" + q.id, { method: "DELETE" });
      await reload();
    } catch (e) {
      alert((e instanceof Error ? e.message : null) || "Could not delete the quiz.");
    }
  };

  const labelKelas = (q: LiveQuizRow) => (q.class?.name ? q.class.name : "Personal");

  // Senarai yang dipaparkan. Tanpa tapisan, semua quiz yang boleh dihoskan.
  const senarai = tapisKelas ? quizzes.filter((q) => q.class_id === tapisKelas) : quizzes;
  const namaKelas =
    classes.find((c) => c.id === tapisKelas)?.name ||
    senarai.find((q) => q.class?.name)?.class?.name ||
    "";

  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="page-title">Live Quiz</h2>
          {tapisKelas && (
            <p className="text-xs text-gray-500">
              {namaKelas ? `Quizzes shared with ${namaKelas}. ` : "Quizzes for this class. "}
              <Link href="/educator/live" className="text-brand-purple font-semibold">Show all quizzes</Link>
            </p>
          )}
        </div>
        <button onClick={() => setShowNew((s) => !s)} className="btn-primary py-1 px-3 text-sm flex items-center gap-1">
          <Plus className="w-4 h-4" /> New Quiz
        </button>
      </div>

      {maxLivePlayers !== null && (
        <p className="text-xs text-gray-500 mb-3">Your plan allows up to {maxLivePlayers} players per session.</p>
      )}

      {showNew && (
        <div className="card mb-4">
          <div className="font-semibold mb-2">Create a live quiz</div>
          <input className="input w-full mb-2" placeholder="Quiz title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input w-full mb-2" placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <label className="block text-xs font-medium text-gray-700 mb-1">Class (optional)</label>
          <select
            value={newClassId}
            onChange={(e) => setNewClassId(e.target.value)}
            className="input w-full max-w-xs mb-2"
          >
            <option value="">Personal quiz, no class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-sm">Cancel</button>
            <button type="button" disabled={busy} onClick={onCipta} className="btn-primary py-1.5 px-3 text-sm">{busy ? "Creating…" : "Create"}</button>
          </div>
          {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        </div>
      )}
      {!showNew && err && <div className="text-xs text-red-600 mb-2">{err}</div>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : senarai.length === 0 ? (
        <p className="text-sm text-gray-500">
          {tapisKelas
            ? "No quizzes for this class yet. Create one and it will be shared with the class."
            : "No live quizzes yet. Create one to start a live session."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {senarai.map((q) => (
            <div key={q.id} className="card">
              <div className="flex items-center gap-2">
                <ListChecks className="w-5 h-5 text-indigo-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Link href={`/educator/live/${q.id}`} className="font-semibold truncate block">{q.title}</Link>
                  {q.description && <div className="text-xs text-gray-500 truncate">{q.description}</div>}
                </div>
                <button onClick={() => onPadam(q)} title="Delete quiz" className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center">
                <span className={`px-1.5 py-0.5 rounded-full font-medium ${q.class_id ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
                  {labelKelas(q)}
                </span>
                <span className="ml-2">{new Date(q.created_at).toLocaleDateString()}</span>
                <button onClick={() => router.push(`/educator/live/${q.id}`)} className="ml-auto text-brand-purple font-semibold flex items-center gap-1">
                  <Play className="w-3 h-3" /> Manage →
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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>}>
      <SenaraiKuiz />
    </Suspense>
  );
}
