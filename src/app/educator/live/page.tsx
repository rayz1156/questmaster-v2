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
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { LOKAL, terjemahBilangan } from "@/lib/i18n";
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
  const { t, bahasa } = useBahasa();
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
      .catch((e) => setErr(e.message || t("live.educatorList.loadFailed")));

    listMyEducatorClasses()
      .then((cs) => setClasses(cs))
      .catch((e) => setErr(e.message || t("live.educatorList.loadClassesFailed")));

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
  }, [t]);

  useEffect(() => { setNewClassId(tapisKelas); }, [tapisKelas]);

  const reload = async () => {
    setLoading(true);
    try {
      const json = await authedFetch("/api/live/quizzes");
      setQuizzes(json.data || []);
    } catch (e) {
      setErr((e instanceof Error ? e.message : null) || t("live.educatorList.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  const onCipta = async () => {
    setErr(null);
    if (!title.trim()) { setErr(t("live.educatorList.titleRequired")); return; }
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
      setErr((e instanceof Error ? e.message : null) || t("live.educatorList.createFailed"));
    } finally { setBusy(false); }
  };

  const onPadam = async (quiz: LiveQuizRow) => {
    if (!window.confirm(t("live.educatorList.deleteConfirm", { tajuk: quiz.title }))) return;
    try {
      await authedFetch("/api/live/quizzes/" + quiz.id, { method: "DELETE" });
      await reload();
    } catch (e) {
      alert((e instanceof Error ? e.message : null) || t("live.educatorList.deleteFailed"));
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
  const labelKelas = (x: LiveQuizRow) => (x.class?.name ? x.class.name : t("live.educatorList.noClass"));

  const CreateForm = () => (
    <Card className="mb-6">
      <CardHead title={t("live.educatorList.createTitle")} subtitle={t("live.educatorList.createSubtitle")} />
      <div className="mt-4 space-y-4">
        <Field label={t("live.educatorList.titleLabel")} htmlFor="kuiz-tajuk">
          <Input id="kuiz-tajuk" placeholder={t("live.educatorList.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t("live.educatorList.descLabel")} note={t("live.educatorList.optional")} htmlFor="kuiz-desc">
          <Input id="kuiz-desc" placeholder={t("live.educatorList.descPlaceholder")} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        {!tapisKelas && (
          <Field label={t("live.educatorList.classLabel")} note={t("live.educatorList.classNote")} htmlFor="kuiz-kelas">
            <Select id="kuiz-kelas" value={newClassId} onChange={(e) => setNewClassId(e.target.value)} className="max-w-sm">
              <option value="">{t("live.educatorList.noClassOption")}</option>
              {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </Field>
        )}
        {/* V2-012: kuiz kelas menutup sesi kepada tetamu; nyatakan kesannya
            kepada pendidik sebelum mereka mencipta kuiz. Berlaku sama ada
            kuiz dicipta dalam Library (kelas dipilih) atau di dalam kelas. */}
        {(tapisKelas || newClassId) && (
          <p className="text-xs text-ink-faint max-w-sm">
            {t("live.educatorList.playersSignIn")}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setShowNew(false)}>{t("common.cancel")}</Button>
          <Button disabled={busy} onClick={onCipta}>{busy ? t("live.educatorList.creating") : t("live.educatorList.createButton")}</Button>
        </div>
      </div>
      {err && <div className="text-sm text-kz-down mt-3">{err}</div>}
    </Card>
  );

  const lajur: DataColumn<LiveQuizRow>[] = [
    {
      key: "quiz",
      header: t("live.educatorList.colQuiz"),
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
      header: t("live.educatorList.colCreated"),
      hideOnMobile: true,
      className: "text-right",
      render: (x) => (
        <span className="text-[13px] text-ink-faint whitespace-nowrap">
          {new Date(x.created_at).toLocaleDateString(LOKAL[bahasa], { day: "numeric", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      key: "buka",
      header: "",
      className: "text-right",
      render: (x) => (
        <Button variant="outline" size="sm" onClick={() => router.push(`/educator/live/${x.id}`)}>
          <ArrowRight className="w-3.5 h-3.5" /> {t("live.educatorList.open")}
        </Button>
      ),
    },
  ];

  const rows = (
    <>
      <DataTable
        label={t("live.educatorList.tableLabel")}
        columns={lajur}
        rows={senarai}
        rowKey={(x) => x.id}
        menuItems={(x) => [
          { label: t("live.educatorList.openQuiz"), icon: <ArrowRight className="w-4 h-4" />, onSelect: () => router.push(`/educator/live/${x.id}`) },
          { label: t("live.educatorList.deleteQuiz"), icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => onPadam(x) },
        ]}
        menuLabel={t("live.educatorList.quizActions")}
        halaman={halaman}
        saizHalaman={10}
        onHalaman={setHalaman}
        empty={
          <EmptyState
            icon={<Zap className="w-6 h-6" />}
            title={t("live.educatorList.emptyTitle")}
            text={t("live.educatorList.emptyText")}
          />
        }
      />
      <div className="flex items-center justify-between gap-3 mt-3">
        <span className="text-xs text-ink-faint">
          {t("live.educatorList.maxPlayers", { n: maxLivePlayers ?? 50 })}
        </span>
        <span className="text-xs text-ink-faint">{t("live.educatorList.nOf", { papar: senarai.length, jumlah: quizzes.length })}</span>
      </div>
    </>
  );

  /* ---------- Di dalam kelas ---------- */
  if (tapisKelas) {
    return (
      <ClassShell classId={tapisKelas} current="quizzes">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="section-title">{t("live.educatorList.quizzesTitle")}</h2>
            {senarai.length > 0 && (
              <p className="text-sm text-ink-muted mt-0.5">
                {terjemahBilangan(bahasa, "live.educatorList.countOne", "live.educatorList.countOther", senarai.length, { n: senarai.length })}
              </p>
            )}
          </div>
          {senarai.length > 0 && (
            <Button onClick={() => setShowNew((v) => !v)}>
              <Plus className="w-4 h-4" /> {t("live.educatorList.newQuiz")}
            </Button>
          )}
        </div>

        {showNew && <CreateForm />}
        {!showNew && err && <div className="text-sm text-kz-down mb-4">{err}</div>}
        {loading && <p className="text-sm text-ink-muted">{t("common.loading")}</p>}

        {!loading && senarai.length === 0 ? (
          <div className="bg-white rounded-[4px] shadow-card">
            <EmptyState
              icon={<Zap className="w-7 h-7" />}
              title={t("live.educatorList.firstTitle")}
              text={t("live.educatorList.firstTextClass")}
              actionLabel={t("live.educatorList.createButton")}
              onAction={() => setShowNew(true)}
            />
            <div className="pb-2">
              <Link href="/educator/live" className="text-[13px] font-medium text-brand-purple hover:underline">{t("live.educatorList.libraryLink")}</Link>
            </div>
            <p className="text-xs text-ink-faint pb-5">{t("live.educatorList.maxPlayers", { n: maxLivePlayers ?? 50 })}</p>
          </div>
        ) : !loading && rows}
      </ClassShell>
    );
  }

  /* ---------- Library ---------- */
  return (
    <>
      <PageHead
        title={t("live.educatorList.yourQuizzes")}
        description={t("live.educatorList.yourQuizzesDesc")}
        primaryAction={{ label: t("live.educatorList.createButton"), icon: <Plus className="w-4 h-4" />, onSelect: () => setShowNew((v) => !v) }}
      />

      <Tabs
        className="mb-5"
        items={[
          { label: t("nav.activities"), href: "/educator/activities" },
          { label: t("live.educatorList.quizzesTitle"), href: "/educator/live" },
        ]}
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="input pl-9" placeholder={t("live.educatorList.searchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t("live.educatorList.searchPlaceholder")} />
        </div>
        <Select
          value=""
          onChange={(e) => { if (e.target.value) router.push(`/educator/live?classId=${e.target.value}`); }}
          aria-label={t("live.educatorList.filterByClass")}
          className="w-auto"
        >
          <option value="">{t("live.educatorList.allClasses")}</option>
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </Select>
      </div>

      {showNew && <CreateForm />}
      {!showNew && err && <div className="text-sm text-kz-down mb-4">{err}</div>}
      {loading && <p className="text-sm text-ink-muted">{t("common.loading")}</p>}

      {!loading && senarai.length === 0 ? (
        <div className="bg-white rounded-[4px] shadow-card">
          <EmptyState
            icon={<Zap className="w-7 h-7" />}
            title={t("live.educatorList.firstTitle")}
            text={t("live.educatorList.firstTextLibrary")}
            actionLabel={t("live.educatorList.createButton")}
            onAction={() => setShowNew(true)}
          />
          <p className="text-xs text-ink-faint pb-5">{t("live.educatorList.maxPlayers", { n: maxLivePlayers ?? 50 })}</p>
        </div>
      ) : !loading && rows}
    </>
  );
}

export default function HalamanKuizLangsung() {
  const { t } = useBahasa();
  return (
    <Shell tabs={EDU_TABS}>
      <Suspense fallback={<p className="text-sm text-ink-muted">{t("common.loading")}</p>}>
        <QuizList />
      </Suspense>
    </Shell>
  );
}