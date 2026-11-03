"use client";
import { useEffect, useState, useMemo } from "react";
import ActivityStatsPanel from "@/components/analytics/ActivityStatsPanel";
import GamificationPanel from "@/components/analytics/GamificationPanel";
import MasteryPanel from "@/components/analytics/MasteryPanel";
import LnaPanel from "@/components/analytics/LnaPanel";
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
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { terjemahBilangan, LOKAL } from "@/lib/i18n";

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
  const { t, bahasa } = useBahasa();
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
        if (!res.ok) throw new Error(j.error || t('educator.analytics.loadFailed'));
        if (!cancelled) setSummary(j.data as Summary);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('papanKelas.failedToLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId]);

  const jumlah = summary?.totals;
  const inact = summary?.inactivity;

  const learners = jumlah?.unique_users ?? 0;
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
        title={t('educator.analytics.title')}
        description={t('educator.analytics.desc')}
        {...(classId !== "all"
          ? { primaryAction: { label: t('educator.analytics.export'), icon: <Download className="w-4 h-4" />, onSelect: () => setDialogEksport(true) } }
          : {})}
      />

      <div className="flex items-center gap-3 flex-wrap mb-5">
        <Select
          value={classId}
          onChange={(e) => setClassId(e.target.value as string | "all")}
          aria-label={t('educator.analytics.chooseClass')}
          className="w-auto"
        >
          <option value="all">{t('educator.analytics.allClasses')}</option>
          {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </Select>
        <span className="text-[13px] text-ink-faint">{t('educator.analytics.last90')}</span>
      </div>

      {loading && <p className="text-sm text-ink-muted">{t('common.loading')}</p>}
      {error && <div className="text-sm text-kz-down mb-4">{error}</div>}

      {summary && (
        <>
          {/* Bila satu kelas dipilih: markah peribadi dan kumpulan (V2-014b). */}
          {classId !== "all" && <PanelInsights classId={classId} />}

          {/* Bila "All classes": jemputan ringkas ke arah pilih kelas. */}
          {classId === "all" && (
            <Alert tone="info" icon={<BookOpen className="w-4 h-4" />} className="mb-5">
              {t('educator.analytics.chooseClassHint')}
            </Alert>
          )}

          {/* Empat nombor sebenar; tiada data perubahan, jadi tiada anak panah. */}
          <Card className="mb-5">
            <StatGroup
              stats={[
                { label: t('educator.analytics.statLearners'), value: learners },
                { label: t('educator.analytics.statActive30'), value: active30 },
                { label: t('educator.analytics.statInactive7'), value: atRisk },
                { label: t('educator.analytics.statTotalEvents'), value: jumlah?.total_events ?? 0 },
              ]}
            />
          </Card>

          {atRisk > 0 && (
            <Alert tone="warning" icon={<AlertTriangle className="w-4 h-4" />} className="mb-5">
              <span>
                {terjemahBilangan(bahasa, 'educator.analytics.atRiskOne', 'educator.analytics.atRiskOther', atRisk, { n: atRisk })}{" "}
                <a href="#explore" className="text-brand-purple hover:underline">{t('educator.analytics.viewLearners')} →</a>
              </span>
            </Alert>
          )}

          <Card className="mb-5">
            <CardHead
              title={t('educator.analytics.dailyTitle')}
              subtitle={t('educator.analytics.last90')}
            />
            <div className="mt-4">
              {dataHarian.length === 0 ? (
                <p className="text-[14px] text-ink-faint">{t('educator.analytics.noData')}</p>
              ) : (
                <LineChart labelAks={t('educator.analytics.dailyChartAria')} data={dataHarian} tinggi={180} />
              )}
            </div>
            <details className="mt-3 border-t border-kz-line pt-3">
              <summary className="flex items-center gap-2 cursor-pointer select-none text-sm text-ink">
                <BarChart3 className="w-4 h-4 text-ink-faint" />
                {t('educator.analytics.moreUsage')}
                <span className="text-ink-faint">· {t('educator.analytics.pageViewsCount', { n: jumlah!.page_views.toLocaleString(LOKAL[bahasa]) })}</span>
              </summary>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                <Stat icon={<Eye className="w-5 h-5" />} label={t('educator.analytics.statPageViews')} value={jumlah!.page_views} />
                <Stat icon={<LogIn className="w-5 h-5" />} label={t('educator.analytics.statSignIns')} value={jumlah!.logins} />
                <Stat icon={<Target className="w-5 h-5" />} label={t('educator.analytics.statActivityOpens')} value={jumlah!.quest_opens} />
                <Stat icon={<CheckCircle2 className="w-5 h-5" />} label={t('educator.analytics.statSubmissions')} value={jumlah!.quest_submits} />
                <Stat icon={<TrendingUp className="w-5 h-5" />} label={t('educator.analytics.statTotalEvents')} value={jumlah!.total_events} />
                <Stat icon={<Activity className="w-5 h-5" />} label={t('educator.analytics.statActive24')} value={inact!.active_1d} />
              </div>
              <div className="mt-5">
                <p className="text-sm text-ink-muted mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-ink-faint" /> {t('educator.analytics.whenStudentsWork')}
                </p>
                <BarChart labelAks={t('educator.analytics.hourlyChartAria')} data={dataJam} />
              </div>
            </details>
          </Card>

          {/* Analitik kelas lanjutan (V2-014b): ditutup secara lalai kerana
              bahagian markah baharu di atas sudah menjawab soalan utama;
              panel lama kekal boleh dicapai tanpa halaman baharu. */}
          <details className="surface p-5 mb-4">
            <summary className="flex items-center gap-2 cursor-pointer select-none text-sm text-ink">
              <BarChart3 className="w-4 h-4 text-ink-faint" />
              {t('educator.analytics.moreClassAnalytics')}
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4">
              <div className="lg:col-span-7 space-y-4">
                <ActivityStatsPanel classId={classId} />
              </div>
              <div className="lg:col-span-5 space-y-4">
                <MasteryPanel classId={classId} />
                <LnaPanel classId={classId} />
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
