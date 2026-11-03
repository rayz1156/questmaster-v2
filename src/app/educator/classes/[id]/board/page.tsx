"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from '@/lib/eduTabs';
import { supabase } from "@/lib/supabase";
import { Board, getBoardForClass } from "@/lib/boards";
import IntroBoardView from "@/components/boards/IntroBoardView";
import { useBahasa } from "@/lib/i18n/BahasaProvider";

export default function ClassBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
  const { t } = useBahasa();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        setUserId(u.user?.id || null);
        const b = await getBoardForClass(classId);
        setBoard(b);
      } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      finally { setLoading(false); }
    })();
  }, [classId]);

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={classId} current="board">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="section-title">{t('papanKelas.introBoard')}</h2>
            <p className="text-sm text-ink-muted mt-0.5">{t('educator.boards.introDesc')}</p>
          </div>
          <Link href={`/educator/classes/${classId}/learning-board`} className="btn-quiet text-brand-purple">
            {t('papanKelas.learningBoard')} →
          </Link>
        </div>
        {loading && <p className="text-sm text-ink-muted">{t('common.loading')}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!loading && !board && <p className="text-sm text-ink-muted">{t('educator.boards.introNotCreated')}</p>}
        {board && <IntroBoardView board={board} canManage={true} currentUserId={userId} />}
      </ClassShell>
    </Shell>
  );
}
