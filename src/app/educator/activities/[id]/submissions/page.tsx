'use client';

/**
 * Indeks penghantaran satu aktiviti (pendidik). KZ-025: rupa v3, PageHead
 * dengan breadcrumb "Activities / <tajuk> / Submissions" dan senarai kelas
 * dalam kad kit. Logik muat, pengalihan automatik dan pautan tidak berubah.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import { Alert, Card, PageHead } from '@/components/ui';
import { supabase } from '@/lib/supabase';

export default function ActivitySubmissionsIndex() {
  const params = useParams<{ id: string }>();
  const huntId = params.id;
  const router = useRouter();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  // Tajuk aktiviti untuk breadcrumb; lajur yang sama ditambah pada pertanyaan sedia ada.
  const [tajuk, setTajuk] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error('Not signed in');
        // Find classes where this hunt is used. qm_hunts has class_id; also can be assigned via qm_team_quest_completions etc.
        // Simplest: get hunts.class_id
        const { data: hunt } = await supabase.from('qm_hunts').select('id, class_id, title').eq('id', huntId).maybeSingle();
        if (!hunt) throw new Error('Activity not found');
        setTajuk(hunt.title || null);
        // Get the class name (and any other classes the user manages where this hunt is used).
        const { data: kls } = await supabase.from('qm_classes').select('id, name').eq('id', hunt.class_id);
        const list = kls || [];
        if (list.length === 1) {
          router.replace(`/educator/activities/${huntId}/submissions/${list[0].id}`);
          return;
        }
        setClasses(list);
      } catch (e) { setErr(e instanceof Error ? e.message : null); }
      finally { setLoading(false); }
    })();
  }, [huntId, router]);

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        crumb={tajuk ? `Activities / ${tajuk}` : 'Activities'}
        name="Submissions"
        description="Pick a class to view or manage its submission board for this activity."
        secondaryActions={[
          { label: 'Back to Activity', icon: <ArrowLeft className="w-4 h-4" />, href: `/educator/activities/${huntId}` },
        ]}
      />

      {loading && <p className="text-sm text-ink-muted">Loading...</p>}
      {err && <Alert tone="danger" className="mb-4">{err}</Alert>}

      {/* Senarai kelas dalam kad kit; pautan dan destinasi tidak berubah. */}
      {classes.length > 0 && (
        <Card padat>
          {classes.map((c, i) => (
            <Link
              key={c.id}
              href={`/educator/activities/${huntId}/submissions/${c.id}`}
              className={`flex items-center justify-between gap-3 px-6 py-4 transition hover:bg-canvas ${i > 0 ? 'border-t border-kz-line' : ''}`}
            >
              <span className="text-[14px] font-bold text-ink truncate">{c.name}</span>
              <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />
            </Link>
          ))}
        </Card>
      )}
      {!loading && !classes.length && <p className="text-sm text-ink-faint">No classes found for this activity.</p>}
    </Shell>
  );
}
