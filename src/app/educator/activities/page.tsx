"use client";

/**
 * Activities. Satu halaman, dua konteks.
 *
 * Tanpa classId ia ialah Library: grid kad projek merentas semua kelas,
 * dengan tab Activities dan Quizzes. Dengan classId ia ialah tab Activities
 * di dalam kelas: senarai lapang tanpa lencana kelas berulang, kerana nama
 * kelas sudah ada pada tajuk.
 *
 * KZ-022: rupa v3 (PageHead, Tabs, ProjectCard, EmptyState); logik data,
 * pengendali klik dan laluan tidak berubah daripada versi jadual.
 */

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from "next/navigation";
import { Search, Plus, FileText, Link as LinkIcon, Trash2, ListChecks, ClipboardList } from "lucide-react";
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import ClassShell from '@/components/ClassShell';
import { EDU_TABS } from '@/lib/eduTabs';
import { listMyHunts, deleteHunt, listMyClasses, type Hunt, type Klass } from '@/lib/data';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  ProjectCard,
  ProjectGrid,
  PageHead,
  Select,
  Tabs,
} from "@/components/ui";

/** Lencana status aktiviti ikut status sebenar (Active/Draft/Archived). */
function LencanaStatus({ status }: { status?: string | null }) {
  const s = String(status || "draft").toLowerCase();
  if (s === "active") return <Badge variant="dot" warna="green">Active</Badge>;
  if (s === "archived") return <Badge variant="dim" warna="gray">Archived</Badge>;
  return <Badge variant="dim" warna="yellow">Draft</Badge>;
}

/** Sisa hari sehingga end_at; null bila tiada tarikh (tiada lencana masa). */
function sisaHari(endAt?: string | null): number | undefined {
  if (!endAt) return undefined;
  const ms = new Date(endAt).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
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
    { label: "View submissions", icon: <ClipboardList className="w-4 h-4" />, onSelect: () => { window.location.href = `/educator/activities/${h.id}/submissions`; } },
    ...(h.submission_link
      ? [{ label: "Open submission link", icon: <LinkIcon className="w-4 h-4" />, onSelect: () => window.open(h.submission_link as string, "_blank", "noopener") }]
      : []),
    { label: "Delete activity", icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => onDelete(h.id) },
  ];

  /** Kad projek satu aktiviti; lencana mata dan status data sebenar. */
  const kad = (h: Hunt) => (
    <ProjectCard
      title={h.title}
      subtitle={h.class_id && classMap[h.class_id] ? classMap[h.class_id] : undefined}
      description={h.description || undefined}
      badges={
        <>
          <Badge variant="dim" warna="purple">{h.points ?? 0} pts</Badge>
          <LencanaStatus status={h.status} />
        </>
      }
      daysLeft={sisaHari(h.end_at)}
      menuItems={menuFor(h)}
      menuLabel="Activity actions"
      href={`/educator/activities/${h.id}`}
    />
  );

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
            <Button href="/educator/activities/new"><Plus className="w-4 h-4" /> Create activity</Button>
          </div>

          {shown.length > 4 && (
            <div className="mb-4 max-w-sm">
              <Input
                placeholder="Search activities..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                ikonKiri={<Search className="w-4 h-4" />}
                aria-label="Search activities"
              />
            </div>
          )}

          {busy && <p className="text-sm text-ink-muted">Loading…</p>}

          {!busy && shown.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="w-6 h-6" />}
              title="Set the first task."
              text="Activities are the work your students hand in and you grade."
              actionLabel="Create activity"
              href="/educator/activities/new"
            />
          ) : (
            <>
              {!busy && (
                <ProjectGrid>
                  {shown.map((h) => kad(h))}
                </ProjectGrid>
              )}
              {!busy && shown.length > 0 && (
                <p className="text-xs text-ink-faint mt-4">Open an activity to manage submissions.</p>
              )}
            </>
          )}
        </ClassShell>
      </Shell>
    );
  }

  /* ---------- Library ---------- */
  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        title="Your teaching library"
        description="Create and manage your activities and quizzes all in one place."
        primaryAction={{ label: "Create activity", icon: <Plus className="w-4 h-4" />, href: "/educator/activities/new" }}
      />

      <Tabs
        items={[
          { label: "Activities", href: "/educator/activities" },
          { label: "Quizzes", href: "/educator/live" },
        ]}
        className="mb-5"
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex-1 min-w-[220px] max-w-sm">
          <Input
            placeholder="Search activities"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            ikonKiri={<Search className="w-4 h-4" />}
            aria-label="Search activities"
          />
        </div>
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Filter by class" className="w-auto">
          <option value="">All classes</option>
          {Object.entries(classMap).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
        </Select>
        <Select value={onlyActive ? "active" : "all"} onChange={(e) => setOnlyActive(e.target.value === "active")} aria-label="Filter by status" className="w-auto">
          <option value="all">All statuses</option>
          <option value="active">Active</option>
        </Select>
      </div>

      {busy && <p className="text-sm text-ink-muted">Loading…</p>}

      {!busy && shown.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="w-6 h-6" />}
          title="Nothing here yet."
          text="Activities you create in any class appear here."
          actionLabel="Create activity"
          href="/educator/activities/new"
        />
      ) : !busy && (
        <>
          <ProjectGrid>
            {shown.map((h) => kad(h))}
          </ProjectGrid>
          <p className="text-xs text-ink-faint mt-4">
            {shown.length} of {hunts.length} {hunts.length === 1 ? "activity" : "activities"} shown. Open an activity to manage submissions.
          </p>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}><PageInner /></Suspense>;
}
