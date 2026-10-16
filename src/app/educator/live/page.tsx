"use client";

/**
 * Quizzes. Satu halaman, dua konteks, sama seperti Activities.
 *
 * Tanpa classId ia ialah tab Quizzes dalam Library (PageHead + Tabs kit).
 * Dengan classId ia ialah tab Quizzes di dalam kelas (ClassShell). Senarai
 * kuiz guna DataTable kit; borang cipta guna Card + Field. Fungsi
 * authedFetch, onCipta, onPadam dan reload tidak berubah.
 */

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Plus, Search, Trash2, Zap, ArrowRight } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from "@/lib/eduTabs";
import { listMyEducatorClasses } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import {
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  Field,
  Input,
  PageHead,
  Select,
  Tabs,
  type DataColumn,
} from "@/components/ui";

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
  const [halaman, setHalaman] = useState(1);

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

  // V2-012: kuiz tanpa kelas terbuka kepada tetamu; label "No class" jelas
  // berbanding "Personal" yang membayangkan kuiz itu milik peribadi sahaja.
  const labelKelas = (x: LiveQuizRow) => (x.class?.name ? x.class.name : "No class");

  const CreateForm = () => (
    <Card className="mb-6">
      <CardHead title="Create a quiz" subtitle="A quiz needs a title; the class is optional in your library." />
      <div className="mt-4 space-y-4">
        <Field label="Quiz title" htmlFor="kuiz-tajuk">
          <Input id="kuiz-tajuk" placeholder="e.g. Week 3 recap" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description" note="Optional." htmlFor="kuiz-desc">
          <Input id="kuiz-desc" placeholder="What is this quiz about?" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        {!tapisKelas && (
          <Field label="Class" note="Optional. A quiz without a class lets guests join." htmlFor="kuiz-kelas">
            <Select id="kuiz-kelas" value={newClassId} onChange={(e) => setNewClassId(e.target.value)} className="max-w-sm">
              <option value="">No class (anyone can join as a guest)</option>
              {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </Field>
        )}
        {/* V2-012: kuiz kelas menutup sesi kepada tetamu; nyatakan kesannya
            kepada pendidik sebelum mereka mencipta kuiz. Berlaku sama ada
            kuiz dicipta dalam Library (kelas dipilih) atau di dalam kelas. */}
        {(tapisKelas || newClassId) && (
          <p className="text-xs text-ink-faint max-w-sm">
            Players must sign in. Scores add to the class ranking.
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setShowNew(false)}>Cancel</Button>
          <Button disabled={busy} onClick={onCipta}>{busy ? "Creating…" : "Create quiz"}</Button>
        </div>
      </div>
      {err && <div className="text-sm text-kz-down mt-3">{err}</div>}
    </Card>
  );

  const lajur: DataColumn<LiveQuizRow>[] = [
    {
      key: "quiz",
      header: "Quiz",
      render: (x) => (
        <span className="flex items-center gap-3 py-3">
          <span
            aria-hidden="true"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[4px] bg-[#ebe2ff] text-brand-purple"
          >
            <Zap className="w-[18px] h-[18px]" />
          </span>
          <span className="min-w-0">
            <Link href={`/educator/live/${x.id}`} className="block text-[14px] font-bold text-ink truncate hover:text-brand-purple transition">
              {x.title}
            </Link>
            <span className="block text-[12px] text-ink-faint truncate">
              {tapisKelas ? (x.description || " ") : labelKelas(x)}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      hideOnMobile: true,
      className: "text-right",
      render: (x) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">
          {new Date(x.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "buka",
      header: "",
      className: "text-right",
      render: (x) => (
        <Button variant="outline" size="sm" onClick={() => router.push(`/educator/live/${x.id}`)}>
          <ArrowRight className="w-3.5 h-3.5" /> Open
        </Button>
      ),
    },
  ];

  const rows = (
    <>
      <DataTable
        label="Live quizzes"
        columns={lajur}
        rows={senarai}
        rowKey={(x) => x.id}
        menuItems={(x) => [
          { label: "Open quiz", icon: <ArrowRight className="w-4 h-4" />, onSelect: () => router.push(`/educator/live/${x.id}`) },
          { label: "Delete quiz", icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => onPadam(x) },
        ]}
        menuLabel="Quiz actions"
        halaman={halaman}
        saizHalaman={10}
        onHalaman={setHalaman}
        empty={
          <EmptyState
            icon={<Zap className="w-6 h-6" />}
            title="No quizzes match."
            text="Create a quiz or clear the search."
          />
        }
      />
      <div className="flex items-center justify-between gap-3 mt-3">
        <span className="text-xs text-ink-faint">
          Up to {maxLivePlayers ?? 50} players per session.
        </span>
        <span className="text-xs text-ink-faint">{senarai.length} of {quizzes.length}</span>
      </div>
    </>
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
            <Button onClick={() => setShowNew((v) => !v)}>
              <Plus className="w-4 h-4" /> New quiz
            </Button>
          )}
        </div>

        {showNew && <CreateForm />}
        {!showNew && err && <div className="text-sm text-kz-down mb-4">{err}</div>}
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}

        {!loading && senarai.length === 0 ? (
          <div className="bg-white rounded-[4px] shadow-card">
            <EmptyState
              icon={<Zap className="w-7 h-7" />}
              title="Make your first quiz."
              text="Bring this class together with a live challenge."
              actionLabel="Create quiz"
              onAction={() => setShowNew(true)}
            />
            <div className="pb-2">
              <Link href="/educator/live" className="text-[13px] font-medium text-brand-purple hover:underline">Choose from your library</Link>
            </div>
            <p className="text-xs text-ink-faint pb-5">Up to {maxLivePlayers ?? 50} players per session.</p>
          </div>
        ) : !loading && rows}
      </ClassShell>
    );
  }

  /* ---------- Library ---------- */
  return (
    <>
      <PageHead
        title="Your quizzes"
        description="Create and manage quizzes for your classes, anytime."
        primaryAction={{ label: "Create quiz", icon: <Plus className="w-4 h-4" />, onSelect: () => setShowNew((v) => !v) }}
      />

      <Tabs
        className="mb-5"
        items={[
          { label: "Activities", href: "/educator/activities" },
          { label: "Quizzes", href: "/educator/live" },
        ]}
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="input pl-9" placeholder="Search quizzes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search quizzes" />
        </div>
        <Select
          value=""
          onChange={(e) => { if (e.target.value) router.push(`/educator/live?classId=${e.target.value}`); }}
          aria-label="Filter by class"
          className="w-auto"
        >
          <option value="">All classes</option>
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </Select>
      </div>

      {showNew && <CreateForm />}
      {!showNew && err && <div className="text-sm text-kz-down mb-4">{err}</div>}
      {loading && <p className="text-sm text-ink-muted">Loading…</p>}

      {!loading && senarai.length === 0 ? (
        <div className="bg-white rounded-[4px] shadow-card">
          <EmptyState
            icon={<Zap className="w-7 h-7" />}
            title="Make your first quiz."
            text="A live quiz turns a lesson into a moment the class shares."
            actionLabel="Create quiz"
            onAction={() => setShowNew(true)}
          />
          <p className="text-xs text-ink-faint pb-5">Up to {maxLivePlayers ?? 50} players per session.</p>
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