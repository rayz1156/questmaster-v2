'use client';
import { PARTICIPANT_TABS } from "@/lib/participantTabs";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import Shell from '@/components/Shell';
import SubmissionBoardView from '@/components/submission-board/SubmissionBoardView';
import { supabase } from '@/lib/supabase';
import type { SubmissionBoard, SubmissionBoardColumn, SubmissionBoardItem } from '@/lib/submission-boards';


/** Wrap fetch() to attach the Supabase access token. */
async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}


export default function ParticipantSubmissionsPage() {
  const params = useParams<{ id: string }>();
  const huntId = params.id;
  const [classId, setClassId] = useState<string | null>(null);
  const [data, setData] = useState<{ board: SubmissionBoard | null; items: SubmissionBoardItem[]; columns: SubmissionBoardColumn[]; myRole: 'educator' | 'student' | 'admin'; myId: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Find the class this hunt belongs to (hunts.class_id), then load the board.
        const { data: hunt } = await supabase.from('qm_hunts').select('class_id').eq('id', huntId).maybeSingle();
        if (!hunt) throw new Error('Activity not found');
        setClassId(hunt.class_id);
        const r = await authedFetch(`/api/submission-boards/${huntId}/${hunt.class_id}`, { cache: 'no-store' });
        if (!r.ok) throw new Error((await r.json()).error || 'Failed to load');
        const j = await r.json();
        setData({ board: j.board, items: j.items || [], columns: j.columns || [], myRole: j.myRole || 'student', myId: j.myId });
      } catch (e: any) { setErr(e.message); }
    })();
  }, [huntId]);

  return (
    <Shell tabs={PARTICIPANT_TABS}>
      <div className="mb-3"><Link href={`/participant/home`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</Link></div>
      <h1 className="text-xl font-bold mb-3">My Submissions</h1>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!data && !err && <p className="text-sm text-gray-500">Loading...</p>}
      {data && classId && (
        <SubmissionBoardView
          huntId={huntId}
          classId={classId}
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
