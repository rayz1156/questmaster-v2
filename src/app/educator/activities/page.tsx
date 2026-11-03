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
import { useBahasa, type FungsiT } from '@/lib/i18n/BahasaProvider';
import { terjemahBilangan } from '@/lib/i18n';

/** Lencana status aktiviti ikut status sebenar (Active/Draft/Archived). */
function LencanaStatus({ status, t }: { status?: string | null; t: FungsiT }) {
  const s = String(status || "draft").toLowerCase();
  if (s === "active") return <Badge variant="dot" warna="green">{t("participant.statusActive")}</Badge>;
  if (s === "archived") return <Badge variant="dim" warna="gray">{t("participant.statusArchived")}</Badge>;
  return <Badge variant="dim" warna="yellow">{t("participant.statusDraft")}</Badge>;
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
  const { t, bahasa } = useBahasa();
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
    if (!(await confirm({ title: t('educator.activities.deleteConfirm'), tone: 'danger' }))) return;
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
    { label: t("educator.activities.manage"), icon: <FileText className="w-4 h-4" />, onSelect: () => { window.location.href = `/educator/activities/${h.id}`; } },
    { label: t("educator.activities.viewSubmissions"), icon: <ClipboardList className="w-4 h-4" />, onSelect: () => { window.location.href = `/educator/activities/${h.id}/submissions`; } },
    ...(h.submission_link
      ? [{ label: t("educator.activities.openSubmissionLink"), icon: <LinkIcon className="w-4 h-4" />, onSelect: () => window.open(h.submission_link as string, "_blank", "noopener") }]
      : []),
    { label: t("educator.activities.deleteMenu"), icon: <Trash2 className="w-4 h-4" />, danger: true, onSelect: () => onDelete(h.id) },
  ];

  /** Kad projek satu aktiviti; lencana mata dan status data sebenar. */
  const kad = (h: Hunt) => (
    <ProjectCard
      title={h.title}
      subtitle={h.class_id && classMap[h.class_id] ? classMap[h.class_id] : undefined}
      description={h.description || undefined}
      badges={
        <>
          <Badge variant="dim" warna="purple">{t("participant.ptsBadge", { n: h.points ?? 0 })}</Badge>
          <LencanaStatus status={h.status} t={t} />
        </>
      }
      daysLeft={sisaHari(h.end_at)}
      menuItems={menuFor(h)}
      menuLabel={t("ui.activityActions")}
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
              <h2 className="section-title">{t("educator.activities.sectionTitle")}</h2>
              <p className="text-sm text-ink-muted mt-0.5">
                {terjemahBilangan(bahasa, "educator.activities.countOne", "educator.activities.countOther", shown.length, { n: shown.length })}
              </p>
            </div>
            <Button href="/educator/activities/new"><Plus className="w-4 h-4" /> {t("educator.activities.createButton")}</Button>
          </div>

          {shown.length > 4 && (
            <div className="mb-4 max-w-sm">
              <Input
                placeholder={t("educator.activities.searchPlaceholder")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                ikonKiri={<Search className="w-4 h-4" />}
                aria-label={t("educator.activities.searchAria")}
              />
            </div>
          )}

          {busy && <p className="text-sm text-ink-muted">{t("common.loading")}</p>}

          {!busy && shown.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="w-6 h-6" />}
              title={t("educator.activities.emptyTitle")}
              text={t("educator.activities.emptyText")}
              actionLabel={t("educator.activities.emptyAction")}
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
                <p className="text-xs text-ink-faint mt-4">{t("educator.activities.openHint")}</p>
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
        title={t("educator.activities.libraryTitle")}
        description={t("educator.activities.libraryDesc")}
        primaryAction={{ label: t("educator.activities.createButton"), icon: <Plus className="w-4 h-4" />, href: "/educator/activities/new" }}
      />

      <Tabs
        items={[
          { label: t("educator.activities.tabActivities"), href: "/educator/activities" },
          { label: t("educator.activities.tabQuizzes"), href: "/educator/live" },
        ]}
        className="mb-5"
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <div className="flex-1 min-w-[220px] max-w-sm">
          <Input
            placeholder={t("educator.activities.searchAria")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            ikonKiri={<Search className="w-4 h-4" />}
            aria-label={t("educator.activities.searchAria")}
          />
        </div>
        <Select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label={t("participant.filterByClassAria")} className="w-auto">
          <option value="">{t("participant.allClasses")}</option>
          {Object.entries(classMap).map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
        </Select>
        <Select value={onlyActive ? "active" : "all"} onChange={(e) => setOnlyActive(e.target.value === "active")} aria-label={t("educator.activities.filterStatusAria")} className="w-auto">
          <option value="all">{t("educator.activities.allStatuses")}</option>
          <option value="active">{t("participant.statusActive")}</option>
        </Select>
      </div>

      {busy && <p className="text-sm text-ink-muted">{t("common.loading")}</p>}

      {!busy && shown.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="w-6 h-6" />}
          title={t("educator.activities.emptyLibraryTitle")}
          text={t("educator.activities.emptyLibraryText")}
          actionLabel={t("educator.activities.emptyAction")}
          href="/educator/activities/new"
        />
      ) : !busy && (
        <>
          <ProjectGrid>
            {shown.map((h) => kad(h))}
          </ProjectGrid>
          <p className="text-xs text-ink-faint mt-4">
            {terjemahBilangan(bahasa, "educator.activities.shownOne", "educator.activities.shownOther", hunts.length, {
              papar: shown.length,
              jumlah: hunts.length,
            })} {t("educator.activities.openHint")}
          </p>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  const { t } = useBahasa();
  return <Suspense fallback={<p className="p-6 text-sm text-ink-muted">{t("common.loading")}</p>}><PageInner /></Suspense>;
}
