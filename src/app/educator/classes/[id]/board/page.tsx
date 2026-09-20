"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ListChecks, Users, BarChart3, Settings as SettingsIcon, User as UserIcon, ArrowLeft, Activity } from "lucide-react";
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from '@/lib/eduTabs';
import { supabase } from "@/lib/supabase";
import { Board, getBoardForClass } from "@/lib/boards";
import IntroBoardView from "@/components/boards/IntroBoardView";

export default function ClassBoardPage() {
  const params = useParams<{ id: string }>();
  const classId = params.id;
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
      } catch (e: any) { setErr(e.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, [classId]);

  return (
    <Shell tabs={EDU_TABS}>
      <ClassShell classId={classId} current="learning">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="section-title">Intro board</h2>
            <p className="text-sm text-ink-muted mt-0.5">Where the class introduces itself.</p>
          </div>
          <Link href={`/educator/classes/${classId}/learning-board`} className="btn-quiet text-brand-purple">
            Learning board →
          </Link>
        </div>
        {loading && <p className="text-sm text-ink-muted">Loading…</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {!loading && !board && <p className="text-sm text-ink-muted">No intro board has been created for this class yet.</p>}
        {board && <IntroBoardView board={board} canManage={true} currentUserId={userId} />}
      </ClassShell>
    </Shell>
  );
}
