'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import Shell from '@/components/Shell';
import { supabase } from '@/lib/supabase';

export default function ActivitySubmissionsIndex() {
  const params = useParams<{ id: string }>();
  const huntId = params.id;
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error('Not signed in');
        // Find classes where this hunt is used. qm_hunts has class_id; also can be assigned via qm_team_quest_completions etc.
        // Simplest: get hunts.class_id
        const { data: hunt } = await supabase.from('qm_hunts').select('id, class_id').eq('id', huntId).maybeSingle();
        if (!hunt) throw new Error('Activity not found');
        // Get the class name (and any other classes the user manages where this hunt is used).
        const { data: kls } = await supabase.from('qm_classes').select('id, name').eq('id', hunt.class_id);
        setClasses(kls || []);
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, [huntId]);

  return (
    <Shell tabs={[]}>
      <div className="mb-3">
        <Link href={`/educator/activities/${huntId}`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to Activity</Link>
      </div>
      <h1 className="text-xl font-bold mb-3">Student Submissions</h1>
      <p className="text-sm text-gray-600 mb-4">Pick a class to view or manage its submission board for this activity.</p>
      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="space-y-2">
        {classes.map((c) => (
          <Link key={c.id} href={`/educator/activities/${huntId}/submissions/${c.id}`} className="card p-3 flex items-center justify-between hover:bg-gray-50">
            <span className="font-semibold">{c.name}</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
        {!loading && !classes.length && <p className="text-sm text-gray-500">No classes found for this activity.</p>}
      </div>
    </Shell>
  );
}
