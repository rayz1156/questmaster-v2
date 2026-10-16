'use client';

/**
 * Papan penghantaran satu kelas untuk satu aktiviti (pendidik). KZ-025: rupa
 * v3, kepala halaman PageHead dengan breadcrumb "Activities / <tajuk> /
 * Submissions" memakai data yang sudah dimuat (tajuk papan; papan dinamakan
 * sempena aktiviti ketika dicipta). Komponen papan dalaman
 * (SubmissionBoardView) TIDAK ditulis semula: ia sudah melukis kadnya sendiri,
 * jadi tiada kad tambahan di sekelilingnya untuk elak kad bertindih.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import SubmissionBoardView from '@/components/submission-board/SubmissionBoardView';
import type { SubmissionBoard, SubmissionBoardColumn, SubmissionBoardItem } from '@/lib/submission-boards';
import { Alert, PageHead } from '@/components/ui';

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
      } catch (e) { setErr(e instanceof Error ? e.message : null); }
    })();
  }, [params.id, params.classId]);

  // Tajuk untuk breadcrumb: data papan yang sudah dimuat (board.title).
  const tajuk = data?.board?.title || null;

  return (
    <Shell tabs={EDU_TABS}>
      <PageHead
        crumb={tajuk ? `Activities / ${tajuk}` : 'Activities'}
        name="Submissions"
        secondaryActions={[
          { label: 'Back', icon: <ArrowLeft className="w-4 h-4" />, href: `/educator/activities/${params.id}` },
        ]}
      />
      {err && <Alert tone="danger" className="mb-4">{err}</Alert>}
      {!data && !err && <p className="text-sm text-ink-muted">Loading...</p>}
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