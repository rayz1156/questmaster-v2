'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, GraduationCap, ListChecks, Users, BarChart3, Activity, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import SubmissionBoardView from '@/components/submission-board/SubmissionBoardView';
import type { SubmissionBoard, SubmissionBoardColumn, SubmissionBoardItem } from '@/lib/submission-boards';

import { supabase } from '@/lib/supabase';

/** Wrap fetch() to attach the Supabase access token. */
async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export default function EducatorSubmissionBoardPage() {
  const params = useParams<{ id: string; classId: string }>();
  const [data, setData] = useState<{ board: SubmissionBoard | null; items: SubmissionBoardItem[]; columns: SubmissionBoardColumn[]; myRole: 'educator' | 'student' | 'admin'; myId: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await authedFetch(`/api/submission-boards/${params.id}/${params.classId}`, { cache: 'no-store' });
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load');
        const j = await r.json();
        setData({ board: j.board, items: j.items || [], columns: j.columns || [], myRole: j.myRole || 'student', myId: j.myId });
      } catch (e: any) { setErr(e.message); }
    })();
  }, [params.id, params.classId]);

  return (
    <Shell tabs={EDU_TABS}>
      <div className="mb-3"><Link href={`/educator/activities/${params.id}`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</Link></div>
      <h1 className="text-xl font-bold mb-3">Submission Board</h1>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!data && !err && <p className="text-sm text-gray-500">Loading...</p>}
      {data && (
        <SubmissionBoardView
          huntId={params.id}
          classId={params.classId}
          initialBoard={data.board}
          initialItems={data.items}
            initialColumns={data.columns}
          myRole={data.myRole}
          myId={data.myId}
        />
      )}
    </Shell>
  );
}
