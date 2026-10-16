"use client";
import { useEffect, useState, useMemo } from "react";
import ActivityStatsPanel from "@/components/analytics/ActivityStatsPanel";
import GamificationPanel from "@/components/analytics/GamificationPanel";
import MasteryPanel from "@/components/analytics/MasteryPanel";
import Shell from "@/components/Shell";
import Stat from "@/components/insights/Stat";
import PanelInsights from "@/components/insights/PanelInsights";
import DialogEksport from "@/components/insights/DialogEksport";
import { EDU_TABS } from '@/lib/eduTabs';
import { supabase } from "@/lib/supabaseClient";
import { listMyEducatorClasses } from "@/lib/data";
import type { EducatorClassRow } from "@/lib/types";
import {
  BarChart3, BookOpen,
  Activity, TrendingUp, AlertTriangle, Eye, LogIn, Target, CheckCircle2,
  Download,
} from "lucide-react";
import {
  Alert,
  BarChart,
  Card,
  CardHead,
  LineChart,
  PageHead,
  Select,
  StatGroup,
} from "@/components/ui";

type Summary = {
  class_id: string | null;
  totals: { total_events: number; unique_users: number; page_views: number; logins: number; quest_opens: number; quest_submits: number };
  inactivity: { active_1d: number; active_7d: number; active_30d: number; at_risk_inactive_7d: number };
  daily: Array<{ day: string; dau: number; events: number }>;
  hourly: Array<{ hour: number; events: number }>;
};

/**
 * Instructor Overview (KZ-022): carta guna kit LineChart/BarChart; carta
 * garis dan bar div tempatan yang lama dibuang kerana kit mengambil alih.
 */
export default function EducatorAnalyticsPage() {
  const [classes, setClasses] = useState<EducatorClassRow[]>([]);
  const [classId, setClassId] = useState<string | "all">("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Dialog eksport CSV Insights (V2-014b), hanya untuk satu kelas.
  const [dialogEksport, setDialogEksport] = useState(false);

  useEffect(() => { listMyEducatorClasses().then(setClasses).catch(() => {}); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;
        const qs = classId === "all" ? "" : `?class_id=${encodeURIComponent(classId)}`;
        const res = await fetch(`/api/analytics/engagement${qs}`, { headers });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to load analytics");
        if (!cancelled) setSummary(j.data as Summary);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  const t = summary?.totals;
  const inact = summary?.inactivity;

  const learners = t?.unique_users ?? 0;
  const active30 = inact?.active_30d ?? 0;
  const atRisk = inact?.at_risk_inactive_7d ?? 0;

  // Data carta harian dan hourly: dipetakan sahaja kepada bentuk kit, tiada
  // nilai baharu. Label hari dipendekkan kepada MM-DD untuk paksi.
  const dataHarian = useMemo(
    () => (summary?.daily ?? []).map((d) => ({ label: d.day.length > 5 ? d.day.slice(5) : d.day, nilai: d.dau })),
    [summary],
  );
  const dataJam = useMemo(() => {
    const baket = Array.from({ length: 24 }, (_, h) => summary?.hourly?.find((d) => d.hour === h)?.events ?? 0);
    return baket.map((v, h) => ({ label: h % 3 === 0 ? `${h}h` : "", nilai: v }));
  }, [summary]);

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        title="See how learning is going."
        description="Track engagement across all your classes and spot opportunities to support your learners."
        {...(classId !== "all"
          ? { primaryAction: { label: "Export", icon: <Download className="w-4 h-4" />, onSelect: () => setDialogEksport(true) } }
          : {})}
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <Select
          value={classId}
          onChange={(e) => setClassId(e.target.value as string | "all")}
          aria-label="Choose class"
          className="w-auto"
        >
          <option value="all">All classes</option>
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </Select>
        <span className="text-[13px] text-ink-faint">Last 90 days</span>
      </div>

      {loading && <p className="text-sm text-ink-muted">Loading…</p>}
      {error && <div className="text-sm text-kz-down mb-4">{error}</div>}

      {summary && (
        <>
          {/* Bila satu kelas dipilih: markah peribadi dan kumpulan (V2-014b). */}
          {classId !== "all" && <PanelInsights classId={classId} />}

          {/* Bila "All classes": jemputan ringkas ke arah pilih kelas. */}
          {classId === "all" && (
            <Alert tone="info" icon={<BookOpen className="w-4 h-4" />} className="mb-5">
              Choose a class to see scores, who needs attention and team balance.
            </Alert>
          )}

          {/* Empat nombor sebenar; tiada data perubahan, jadi tiada anak panah. */}
          <Card className="mb-5">
            <StatGroup
              stats={[
                { label: "Learners", value: learners },
                { label: "Active in 30 days", value: active30 },
                { label: "Inactive over 7 days", value: atRisk },
                { label: "Total events", value: t?.total_events ?? 0 },
              ]}
            />
          </Card>

          {atRisk > 0 && (
            <Alert tone="warning" icon={<AlertTriangle className="w-4 h-4" />} className="mb-5">
              <span>
                {atRisk} {atRisk === 1 ? "learner has" : "learners have"} not visited in over a week.{" "}
                <a href="#explore" className="text-brand-purple hover:underline">View learners →</a>
              </span>
            </Alert>
          )}

          <Card className="mb-5">
            <CardHead
              title="Daily active learners"
              subtitle="Last 90 days"
            />
            <div className="mt-4">
              {dataHarian.length === 0 ? (
                <p className="text-[14px] text-ink-faint">No data yet, analytics start collecting now.</p>
              ) : (
                <LineChart labelAks="Daily active learners, last 90 days" data={dataHarian} tinggi={180} />
              )}
            </div>
            <details className="mt-3 border-t border-kz-line pt-3">
              <summary className="flex items-center gap-2 cursor-pointer select-none text-sm text-ink">
                <BarChart3 className="w-4 h-4 text-ink-faint" />
                More usage metrics
                <span className="text-ink-faint">· {t!.page_views.toLocaleString()} page views</span>
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <Stat icon={<Eye className="w-5 h-5" />} label="Page views" value={t!.page_views} />
                <Stat icon={<LogIn className="w-5 h-5" />} label="Sign ins" value={t!.logins} />
                <Stat icon={<Target className="w-5 h-5" />} label="Activity opens" value={t!.quest_opens} />
                <Stat icon={<CheckCircle2 className="w-5 h-5" />} label="Submissions" value={t!.quest_submits} />
                <Stat icon={<TrendingUp className="w-5 h-5" />} label="Total events" value={t!.total_events} />
                <Stat icon={<Activity className="w-5 h-5" />} label="Active in 24 hours" value={inact!.active_1d} />
              </div>
              <div className="mt-5">
                <p className="text-sm text-ink-muted mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-ink-faint" /> When students actually work
                </p>
                <BarChart labelAks="Events by hour of day" data={dataJam} />
              </div>
            </details>
          </Card>

          {/* Analitik kelas lanjutan (V2-014b): ditutup secara lalai kerana
              bahagian markah baharu di atas sudah menjawab soalan utama;
              panel lama kekal boleh dicapai tanpa halaman baharu. */}
          <details className="surface p-5 mb-4">
            <summary className="flex items-center gap-2 cursor-pointer select-none text-sm text-ink">
              <BarChart3 className="w-4 h-4 text-ink-faint" />
              More class analytics
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
              <div className="lg:col-span-7 space-y-4">
                <ActivityStatsPanel classId={classId} />
              </div>
              <div className="lg:col-span-5 space-y-4">
                <MasteryPanel classId={classId} />
                <GamificationPanel classId={classId} />
              </div>
            </div>
          </details>
        </>
      )}

      {/* Dialog eksport CSV (tiket G), hanya untuk satu kelas. */}
      {dialogEksport && classId !== "all" && (
        <DialogEksport classId={classId} tutup={() => setDialogEksport(false)} />
      )}
    </Shell>
  );
}
