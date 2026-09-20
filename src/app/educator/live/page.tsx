"use client";

/**
 * Quizzes. Satu halaman, dua konteks, sama seperti Activities.
 *
 * Tanpa classId ia ialah tab Quizzes dalam Library. Dengan classId ia ialah
 * tab Quizzes di dalam kelas, lengkap dengan keadaan kosong yang mengajak
 * membuat kuiz pertama.
 */

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Trash2, Zap, ArrowRight } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import RowMenu from "@/components/ui/RowMenu";
import { EDU_TABS } from "@/lib/eduTabs";
import { listMyEducatorClasses } from "@/lib/data";
import { supabase } from "@/lib/supabase";

interface LiveQuizRow {
  id: string;
  class_id: string | null;
  owner_id: string;
  title: string;
  description: string | null;
  created_at: string;
  class?: { name: string } | null;
}

/** Permintaan dengan token Bearer pendidik. */
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

function QuizList() {
  const router = useRouter();
  const sp = useSearchParams();
  const tapisKelas = sp.get("classId") || "";

  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [newClassId, setNewClassId] = useState(tapisKelas);
  const [quizzes, setQuizzes] = useState<LiveQuizRow[]>([]);
  const [maxLivePlayers, setMaxLivePlayers] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    authedFetch("/api/live/quizzes")
      .then((json) => setQuizzes(json.data || []))
      .catch((e) => setErr(e.message || "Could not load your quizzes."));

    listMyEducatorClasses()
      .then((cs) => setClasses(cs))
      .catch((e) => setErr(e.message || "Could not load your classes."));

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
      await authedFetch("/api/live/quizzes", {
        method: "POST",
        body: JSON.stringify({
          ...(newClassId ? { classId: newClassId } : {}),
          title: title.trim(),
          description: desc.trim() || undefined,
        }),
      });
      setTitle(""); setDesc(""); setShowNew(false);
      await reload();
    } catch (e) {
      setErr((e instanceof Error ? e.message : null) || "The quiz could not be created.");
    } finally { setBusy(false); }
  };

  const onPadam = async (quiz: LiveQuizRow) => {
    if (!window.confirm(`Delete the quiz "${quiz.title}"? All of its questions will be deleted too.`)) return;
    try {
      await authedFetch("/api/live/quizzes/" + quiz.id, { method: "DELETE" });
      await reload();
    } catch (e) {
      alert((e instanceof Error ? e.message : null) || "Could not delete the quiz.");
    }
  };

  const senarai = useMemo(() => {
    let arr = tapisKelas ? quizzes.filter((x) => x.class_id === tapisKelas) : quizzes;
    const needle = q.trim().toLowerCase();
    if (needle) arr = arr.filter((x) => x.title.toLowerCase().includes(needle));
    return arr;
  }, [quizzes, tapisKelas, q]);

  const labelKelas = (x: LiveQuizRow) => (x.class?.name ? x.class.name : "Personal");

  const CreateForm = () => (
    <div className="surface p-5 mb-6">
      <div className="font-semibold text-ink mb-4">Create a quiz</div>
      <label className="block text-sm font-medium text-ink mb-1.5">Quiz title</label>
      <input className="input mb-4" placeholder="e.g. Week 3 recap" value={title} onChange={(e) => setTitle(e.target.value)} />
      <label className="block text-sm font-medium text-ink mb-1.5">Description <span className="text-ink-faint font-normal">(optional)</span></label>
      <input className="input mb-4" placeholder="What is this quiz about?" value={desc} onChange={(e) => setDesc(e.target.value)} />
      {!tapisKelas && (
        <>
          <label className="block text-sm font-medium text-ink mb-1.5">Class <span className="text-ink-faint font-normal">(optional)</span></label>
          <select value={newClassId} onChange={(e) => setNewClassId(e.target.value)} className="input max-w-sm mb-4">
            <option value="">Personal quiz, no class</option>
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
        </>
      )}
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
        <button type="button" disabled={busy} onClick={onCipta} className="btn-primary">{busy ? "Creating…" : "Create quiz"}</button>
      </div>
      {err && <div className="text-sm text-red-600 mt-3">{err}</div>}
    </div>
  );

  const rows = (
    <div className="surface">
      {senarai.map((x) => (
        <div key={x.id} className="t-row flex items-center gap-4 px-5 py-4 first:border-0">
          <span className="w-10 h-10 rounded-xl bg-[#EAE6FC] flex items-center justify-center shrink-0">
            <Zap className="w-[18px] h-[18px] text-brand-purple" />
          </span>
          <div className="min-w-0 flex-1">
            <Link href={`/educator/live/${x.id}`} className="text-[15px] font-medium text-ink hover:text-brand-purple transition truncate block">
              {x.title}
            </Link>
            <div className="text-sm text-ink-muted truncate">{tapisKelas ? (x.description || " ") : labelKelas(x)}</div>
          </div>
          <div className="hidden sm:block text-sm text-ink-muted w-28 text-right">
            {new Date(x.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </div>
          <button onClick={() => router.push(`/educator/live/${x.id}`)} className="btn-quiet text-brand-purple whitespace-nowrap">
            <ArrowRight className="w-3.5 h-3.5" /> Open
          </button>
          <RowMenu items={[
            { label: "Open quiz", icon: <ArrowRight className="w-4 h-4" />, onSelect: () => router.push(`/educator/live/${x.id}`) },
            { label: "Delete quiz", icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => onPadam(x) },
          ]} />
        </div>
      ))}
      <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
        <span className="text-xs text-ink-faint">
          Up to {maxLivePlayers ?? 50} players per session.
        </span>
        <span className="text-xs text-ink-faint">{senarai.length} of {quizzes.length}</span>
      </div>
    </div>
  );

  /* ---------- Di dalam kelas ---------- */
  if (tapisKelas) {
    return (
      <ClassShell classId={tapisKelas} current="quizzes">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="section-title">Quizzes</h2>
            {senarai.length > 0 && (
              <p className="text-sm text-ink-muted mt-0.5">
                {senarai.length} {senarai.length === 1 ? "quiz" : "quizzes"}
              </p>
            )}
          </div>
          {senarai.length > 0 && (
            <button onClick={() => setShowNew((v) => !v)} className="btn-primary"><Plus className="w-4 h-4" /> New quiz</button>
          )}
        </div>

        {showNew && <CreateForm />}
        {!showNew && err && <div className="text-sm text-red-600 mb-4">{err}</div>}
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}

        {!loading && senarai.length === 0 ? (
          <div className="surface py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-5">
              <Zap className="w-7 h-7 text-brand-purple" />
            </div>
            <div className="text-[22px] font-semibold tracking-tight text-ink mb-1.5">Make your first quiz.</div>
            <p className="text-[15px] text-ink-muted mb-6">Bring this class together with a live challenge.</p>
            <button onClick={() => setShowNew(true)} className="btn-primary px-5">Create quiz</button>
            <div className="mt-3">
              <Link href="/educator/live" className="btn-quiet text-brand-purple">Choose from your library</Link>
            </div>
            <p className="text-xs text-ink-faint mt-6">Up to {maxLivePlayers ?? 50} players per session.</p>
          </div>
        ) : !loading && rows}
      </ClassShell>
    );
  }

  /* ---------- Library ---------- */
  return (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="page-title">Your quizzes</h1>
          <p className="page-subtitle">Create and manage quizzes for your classes, anytime.</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="btn-primary"><Plus className="w-4 h-4" /> Create quiz</button>
      </div>

      <div className="flex items-center gap-6 border-b border-hairline mb-5">
        <Link href="/educator/activities" className="pb-2.5 text-[15px] font-medium text-ink-muted hover:text-ink transition">
          Activities
        </Link>
        <span className="relative pb-2.5 text-[15px] font-semibold text-ink">
          Quizzes
          <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink rounded-full" />
        </span>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="input pl-9" placeholder="Search quizzes" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select
          value=""
          onChange={(e) => { if (e.target.value) router.push(`/educator/live?classId=${e.target.value}`); }}
          className="input w-auto"
        >
          <option value="">All classes</option>
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
      </div>

      {showNew && <CreateForm />}
      {!showNew && err && <div className="text-sm text-red-600 mb-4">{err}</div>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {!loading && senarai.length === 0 ? (
        <div className="surface py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-5">
            <Zap className="w-7 h-7 text-brand-purple" />
          </div>
          <div className="text-[22px] font-semibold tracking-tight text-ink mb-1.5">Make your first quiz.</div>
          <p className="text-[15px] text-ink-muted mb-6">A live quiz turns a lesson into a moment the class shares.</p>
          <button onClick={() => setShowNew(true)} className="btn-primary px-5">Create quiz</button>
          <p className="text-xs text-ink-faint mt-6">Up to {maxLivePlayers ?? 50} players per session.</p>
        </div>
      ) : !loading && rows}
    </>
  );
}

export default function HalamanKuizLangsung() {
  return (
    <Shell tabs={EDU_TABS}>
      <Suspense fallback={<p className="text-sm text-ink-muted">Loading…</p>}>
        <QuizList />
      </Suspense>
    </Shell>
  );
}
