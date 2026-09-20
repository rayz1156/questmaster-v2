"use client";

/**
 * Activities. Satu halaman, dua konteks.
 *
 * Tanpa classId ia ialah Library: jadual penuh lebar merentas semua kelas,
 * dengan tab Activities dan Quizzes. Dengan classId ia ialah tab Activities
 * di dalam kelas: senarai lapang tanpa lencana kelas berulang, kerana nama
 * kelas sudah ada pada tajuk.
 *
 * Tindakan memusnah berpindah ke menu elipsis. Butang merah pada setiap
 * baris menarik mata ke perkara paling jarang dan paling berbahaya.
 */

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import { Search, Plus, FileText, Link as LinkIcon, Trash2, ListChecks } from "lucide-react";
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import ClassShell from '@/components/ClassShell';
import RowMenu from '@/components/ui/RowMenu';
import { EDU_TABS } from '@/lib/eduTabs';
import { listMyHunts, deleteHunt, listMyClasses, type Hunt, type Klass } from '@/lib/data';
import { useConfirm } from '@/components/ui/ConfirmProvider';

function StatusDot({ status }: { status?: string | null }) {
  const active = String(status || "").toLowerCase() === "active";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
      <span className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[#4BA972]" : "bg-[#C6C8D1]"}`} />
      {status ? String(status)[0].toUpperCase() + String(status).slice(1) : "Draft"}
    </span>
  );
}

function PageInner() {
  const { user } = useSession('educator');
  const confirm = useConfirm();
  const sp = useSearchParams();
  const classFilterFromUrl = sp.get('classId') || "";

  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classMap, setClassMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [classFilter, setClassFilter] = useState<string>(classFilterFromUrl);
  const [q, setQ] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  async function refresh() {
    setHunts(await listMyHunts());
    listMyClasses()
      .then((cls: Klass[]) => {
        const m: Record<string, string> = {};
        cls.forEach((k) => { m[k.id] = k.name; });
        setClassMap(m);
      })
      .catch(() => {});
  }
  useEffect(() => {
    if (!user) return;
    (async () => { setBusy(true); try { await refresh(); } finally { setBusy(false); } })();
  }, [user]);
  useEffect(() => { setClassFilter(classFilterFromUrl); }, [classFilterFromUrl]);

  async function onDelete(id: string) {
    if (!(await confirm({ title: 'Delete this activity? This cannot be undone.', tone: 'danger' }))) return;
    await deleteHunt(id);
    await refresh();
  }

  const shown = useMemo(() => {
    let arr = classFilter ? hunts.filter((h) => h.class_id === classFilter) : hunts;
    const needle = q.trim().toLowerCase();
    if (needle) arr = arr.filter((h) => String(h.title || "").toLowerCase().includes(needle));
    if (onlyActive) arr = arr.filter((h) => String(h.status || "").toLowerCase() === "active");
    return arr;
  }, [hunts, classFilter, q, onlyActive]);

  const menuFor = (h: Hunt) => [
    { label: "Manage activity", icon: <FileText className="w-4 h-4" />, onSelect: () => { window.location.href = `/educator/activities/${h.id}`; } },
    ...(h.submission_link
      ? [{ label: "Open submission link", icon: <LinkIcon className="w-4 h-4" />, onSelect: () => window.open(h.submission_link as string, "_blank", "noopener") }]
      : []),
    { label: "Delete activity", icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => onDelete(h.id) },
  ];

  /* ---------- Di dalam kelas ---------- */
  if (classFilter) {
    return (
      <Shell tabs={EDU_TABS}>
        <ClassShell classId={classFilter} current="activities">
          <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
            <div>
              <h2 className="section-title">Activities</h2>
              <p className="text-sm text-ink-muted mt-0.5">
                {shown.length} {shown.length === 1 ? "activity" : "activities"}
              </p>
            </div>
            <Link href="/educator/activities/new" className="btn-primary"><Plus className="w-4 h-4" /> Create activity</Link>
          </div>

          {shown.length > 4 && (
            <div className="relative mb-4 max-w-sm">
              <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input className="input pl-9" placeholder="Search activities..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          )}

          {busy && <p className="text-sm text-ink-muted">Loading…</p>}

          {!busy && shown.length === 0 ? (
            <div className="surface py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
                <ListChecks className="w-6 h-6 text-brand-purple" />
              </div>
              <div className="section-title mb-1">Set the first task.</div>
              <p className="text-sm text-ink-muted mb-5">Activities are the work your students hand in and you grade.</p>
              <Link href="/educator/activities/new" className="btn-primary">Create activity</Link>
            </div>
          ) : (
            <div className="surface">
              {shown.map((h) => (
                <div key={h.id} className="t-row flex items-center gap-4 px-5 py-4 first:border-0">
                  <span className="w-10 h-10 rounded-xl bg-[#F4F4F6] flex items-center justify-center shrink-0">
                    <FileText className="w-[18px] h-[18px] text-ink-faint" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/educator/activities/${h.id}`} className="text-[15px] font-medium text-ink hover:text-brand-purple transition truncate block">
                      {h.title}
                    </Link>
                    {h.description && <div className="text-sm text-ink-muted truncate">{h.description}</div>}
                  </div>
                  <div className="hidden sm:block"><StatusDot status={h.status} /></div>
                  <div className="hidden sm:block text-sm text-ink-muted tabular-nums w-20 text-right">{h.points ?? 0} points</div>
                  {h.submission_link && (
                    <a href={h.submission_link} target="_blank" rel="noopener noreferrer" className="hidden lg:inline-flex btn-quiet text-brand-purple">
                      <LinkIcon className="w-3.5 h-3.5" /> Submission link
                    </a>
                  )}
                  <Link href={`/educator/activities/${h.id}/submissions`} className="btn-quiet text-brand-purple whitespace-nowrap">
                    View submissions
                  </Link>
                  <RowMenu items={menuFor(h)} />
                </div>
              ))}
            </div>
          )}
        </ClassShell>
      </Shell>
    );
  }

  /* ---------- Library ---------- */
  return (
    <Shell tabs={EDU_TABS}>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="page-title">Your teaching library</h1>
          <p className="page-subtitle">Create and manage your activities and quizzes all in one place.</p>
        </div>
        <Link href="/educator/activities/new" className="btn-primary"><Plus className="w-4 h-4" /> Create activity</Link>
      </div>

      <div className="flex items-center gap-6 border-b border-hairline mb-5">
        <span className="relative pb-2.5 text-[15px] font-semibold text-ink">
          Activities
          <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-ink rounded-full" />
        </span>
        <Link href="/educator/live" className="pb-2.5 text-[15px] font-medium text-ink-muted hover:text-ink transition">
          Quizzes
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-ink-faint absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="input pl-9" placeholder="Search activities" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="input w-auto">
          <option value="">All classes</option>
          {Object.entries(classMap).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
        </select>
        <select value={onlyActive ? "active" : "all"} onChange={(e) => setOnlyActive(e.target.value === "active")} className="input w-auto">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
        </select>
      </div>

      {busy && <p className="text-sm text-ink-muted">Loading…</p>}

      {!busy && shown.length === 0 ? (
        <div className="surface py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
            <ListChecks className="w-6 h-6 text-brand-purple" />
          </div>
          <div className="section-title mb-1">Nothing here yet.</div>
          <p className="text-sm text-ink-muted mb-5">Activities you create in any class appear here.</p>
          <Link href="/educator/activities/new" className="btn-primary">Create activity</Link>
        </div>
      ) : !busy && (
        <div className="surface">
          <div className="grid grid-cols-[1fr,150px,90px] sm:grid-cols-[1fr,200px,90px,120px,40px] gap-4 px-5 py-3 bg-[#FAFAFB]">
            <div className="t-head">Activity</div>
            <div className="t-head hidden sm:block">Class</div>
            <div className="t-head text-right">Points</div>
            <div className="t-head hidden sm:block">Status</div>
            <div />
          </div>
          {shown.map((h) => (
            <div key={h.id} className="t-row grid grid-cols-[1fr,150px,90px] sm:grid-cols-[1fr,200px,90px,120px,40px] gap-4 px-5 py-3.5 items-center">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-[18px] h-[18px] text-ink-faint shrink-0" />
                <Link href={`/educator/activities/${h.id}`} className="text-[15px] text-brand-purple font-medium truncate hover:underline">
                  {h.title}
                </Link>
              </div>
              <div className="text-sm text-ink-muted truncate hidden sm:block">
                {h.class_id && classMap[h.class_id] ? classMap[h.class_id] : "—"}
              </div>
              <div className="text-sm text-ink tabular-nums text-right">{h.points ?? 0}</div>
              <div className="hidden sm:block"><StatusDot status={h.status} /></div>
              <div className="flex justify-end"><RowMenu items={menuFor(h)} /></div>
            </div>
          ))}
          <div className="px-5 py-3 border-t border-hairline flex items-center justify-between">
            <span className="text-xs text-ink-faint">Open an activity to manage submissions.</span>
            <span className="text-xs text-ink-faint">{shown.length} of {hunts.length}</span>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}><PageInner /></Suspense>;
}
