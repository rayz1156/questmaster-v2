"use client";

/**
 * Activities peserta, rupa v3 KZ-023.
 *
 * Grid ProjectCard untuk semua aktiviti merentas kelas, diikuti kad
 * butiran aktiviti yang dipilih (parameter "hunt" dalam URL). Lencana
 * masa hanya bila aktiviti ada end_at sebenar; ProgressBar hanya pada
 * kad aktiviti yang kemajuan (siap atau belum pasukan saya) sudah
 * dimuat. Logik data, pengendali klik dan laluan tidak berubah
 * daripada versi sebelum KZ-023: memilih aktiviti masih melalui
 * /participant/activities?hunt=<id> dan borang kekal seperti asal.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Eye,
  Info,
  ListChecks,
} from "lucide-react";
import ParticipantShell from "@/components/ParticipantShell";
import { useSession } from "@/lib/session";
import {
  listQuestsForParticipant,
  listQuestCompletions,
  listEnrolledClasses,
  type Hunt,
  type Klass,
} from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";
import {
  Alert,
  Badge,
  Card,
  CardHead,
  CardSection,
  EmptyState,
  PageHead,
  ProjectCard,
  ProjectGrid,
  Select,
} from "@/components/ui";

/** Lencana status aktiviti ikut status sebenar (Active/Draft/Archived). */
function LencanaStatus({ status }: { status?: string | null }) {
  const s = String(status || "draft").toLowerCase();
  if (s === "active") return <Badge variant="dot" warna="green">Active</Badge>;
  if (s === "archived") return <Badge variant="dim" warna="gray">Archived</Badge>;
  return <Badge variant="dim" warna="yellow">Draft</Badge>;
}

/** Sisa hari sehingga end_at; undefined bila tiada tarikh (tiada lencana masa). */
function sisaHari(endAt?: string | null): number | undefined {
  if (!endAt) return undefined;
  const ms = new Date(endAt).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function Inner() {
  const { user } = useSession("participant");
  const router = useRouter();
  const sp = useSearchParams();
  const huntId = sp.get("hunt") || "";
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<Klass[]>([]);
  const [active, setActive] = useState<Hunt | null>(null);
  const [completedTeamIds, setCompletedTeamIds] = useState<string[]>([]);
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [filterClass, setFilterClass] = useState<string>("");
  // Kemajuan (senarai pasukan yang siap) hanya dimuat untuk aktiviti
  // yang dipilih; ProgressBar tidak dipapar sebelum ia tiba.
  const [kemajuanDimuat, setKemajuanDimuat] = useState(false);

  useEffect(() => { if (!user) return; (async () => {
    setBusy(true);
    try {
      const [list, cls] = await Promise.all([listQuestsForParticipant(), listEnrolledClasses()]);
      setHunts(list);
      setClasses(cls);
      const sel = huntId ? (list.find(h => h.id === huntId) || null) : (list[0] || null);
      setActive(sel);
      const { data: tm } = await supabase.from('qm_team_members').select('team_id').eq('user_id', user.id);
      setMyTeamIds((((tm as unknown as { team_id: string }[]) || [])).map((r) => r.team_id).filter(Boolean));
      if (sel) {
        const cs = await listQuestCompletions(sel.id);
        setCompletedTeamIds(cs.map(c => c.team_id));
        setKemajuanDimuat(true);
      } else { setCompletedTeamIds([]); setKemajuanDimuat(false); }
    } finally { setBusy(false); }
  })(); }, [user, huntId]);

  // Re-fetch completions if active changes via tab click
  useEffect(() => {
    if (!active) { setCompletedTeamIds([]); setKemajuanDimuat(false); return; }
    (async () => {
      try {
        const cs = await listQuestCompletions(active.id);
        setCompletedTeamIds(cs.map(c => c.team_id));
        setKemajuanDimuat(true);
      } catch { setCompletedTeamIds([]); setKemajuanDimuat(false); }
    })();
    // Bergantung pada id aktiviti sahaja supaya tukar pilihan tidak memuat
    // semula data yang sama (corak sama seperti sebelum KZ-023).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const filteredHunts = useMemo(() => filterClass ? hunts.filter((h) => h.class_id === filterClass) : hunts, [hunts, filterClass]);
  const myDone = active ? myTeamIds.some(id => completedTeamIds.includes(id)) : false;

  // Peta nama kelas untuk subtajuk kad (data sebenar, tiada nama rekaan).
  const namaKelas = useMemo(() => {
    const peta = new Map<string, string>();
    for (const c of classes) peta.set(c.id, c.name);
    return peta;
  }, [classes]);

  /** Kad projek satu aktiviti; lencana mata dan status data sebenar. */
  const kad = (h: Hunt) => {
    const dipilih = active?.id === h.id;
    const siapSaya = dipilih && kemajuanDimuat && myDone;
    return (
      <ProjectCard
        title={h.title}
        subtitle={h.class_id ? namaKelas.get(h.class_id) : undefined}
        description={h.description || undefined}
        badges={
          <>
            <Badge variant="dim" warna="purple">{h.points ?? 0} pts</Badge>
            <LencanaStatus status={h.status} />
          </>
        }
        daysLeft={sisaHari(h.end_at)}
        done={siapSaya || undefined}
        menuItems={[
          { label: "Open activity", icon: <Eye className="w-4 h-4" />, onSelect: () => { router.push(`/participant/activities?hunt=${h.id}`); } },
          { label: "Open submission board", icon: <ClipboardList className="w-4 h-4" />, onSelect: () => { router.push(`/participant/activities/${h.id}/submissions`); } },
        ]}
        menuLabel="Activity actions"
        href={`/participant/activities?hunt=${h.id}`}
      />
    );
  };

  return (
    <ParticipantShell>
      <PageHead
        title="What is on your plate."
        description="Complete activities to earn points for your team."
      />

      {classes.length > 0 && (
        <div className="mb-5">
          <Select
            value={filterClass}
            onChange={e => setFilterClass(e.target.value)}
            aria-label="Filter by class"
            className="w-auto min-w-[220px]"
          >
            <option value="">All classes</option>
            {classes.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </Select>
        </div>
      )}

      {busy && hunts.length === 0 ? (
        <p className="text-sm text-ink-muted">Loading…</p>
      ) : filteredHunts.length === 0 ? (
        <div className="bg-white rounded-[4px] shadow-card">
          <EmptyState
            icon={<ListChecks className="w-6 h-6" />}
            title="No activities yet"
            text="They appear here once your educator creates them in your classes."
          />
        </div>
      ) : (
        <ProjectGrid>
          {filteredHunts.map(h => kad(h))}
        </ProjectGrid>
      )}

      {active && (
        <Card padat className="mt-7">
          <div className="px-6 pt-6">
            <CardHead
              title={active.title}
              subtitle={active.class_id ? namaKelas.get(active.class_id) : undefined}
              right={
                <span className="text-right">
                  <span className="block text-[24px] leading-none text-ink tabular-nums">{active.points ?? 0}</span>
                  <span className="block text-[12px] text-ink-faint mt-1">points</span>
                </span>
              }
            />
            <div className="mt-3 flex items-center gap-2">
              <LencanaStatus status={active.status} />
            </div>
            {active.description && (
              <p className="mt-4 text-[14px] text-ink-muted whitespace-pre-wrap leading-[1.65]">{active.description}</p>
            )}
          </div>

          {active.instructions && (
            <CardSection>
              <div className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint mb-2">Instructions</div>
              <p className="text-[14px] text-ink whitespace-pre-wrap leading-[1.65]">{active.instructions}</p>
            </CardSection>
          )}

          {/* Bahagian dipisah: baris pautan aktiviti, pemisah kz-line. */}
          <div className="border-t border-kz-line">
            {active.submission_link && (
              <a
                href={active.submission_link}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 px-6 py-4 hover:bg-canvas transition"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-ink">Submission link</span>
                  <span className="block text-[13px] text-ink-faint mt-0.5 truncate">{active.submission_link_label || active.submission_link}</span>
                </span>
                <ExternalLink className="w-4 h-4 text-ink-faint shrink-0" />
              </a>
            )}

            <Link
              href={`/participant/activities/${active.id}/submissions`}
              className="flex items-center gap-4 border-t border-kz-line px-6 py-4 hover:bg-canvas transition"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-medium text-ink">Submission board</span>
                <span className="block text-[13px] text-ink-faint mt-0.5">Share your work and see what your classmates posted.</span>
              </span>
              <ClipboardList className="w-4 h-4 text-ink-faint shrink-0" />
            </Link>

            {[active.link1, active.link2].filter(Boolean).map((lnk, i) => (
              <a
                key={i}
                href={lnk as string}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-4 border-t border-kz-line px-6 py-4 hover:bg-canvas transition"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium text-ink">Resource {i + 1}</span>
                  <span className="block text-[13px] text-ink-faint mt-0.5 truncate">{lnk}</span>
                </span>
                <ExternalLink className="w-4 h-4 text-ink-faint shrink-0" />
              </a>
            ))}
          </div>

          <CardSection baris>
            {myDone ? (
              <Alert tone="success" icon={<CheckCircle2 className="w-4 h-4" />}>
                Your team has been awarded {active.points ?? 0} points for this activity.
              </Alert>
            ) : (
              <Alert tone="info" icon={<Info className="w-4 h-4" />}>
                Your team has not been marked complete yet. Your educator ticks the team once the activity is done.
              </Alert>
            )}
          </CardSection>
        </Card>
      )}
    </ParticipantShell>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading...</div>}><Inner /></Suspense>;
}
