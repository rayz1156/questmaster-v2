"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ListChecks, Users, BarChart3, Settings as SettingsIcon, User as UserIcon, ArrowLeft, Activity } from "lucide-react";
import Shell from "@/components/Shell";
import { EDU_TABS } from '@/lib/eduTabs';
import { supabase } from "@/lib/supabase";
import { Board, getBoardForHunt } from "@/lib/boards";
import QuestBoardView from "@/components/boards/QuestBoardView";

export default function ActivityBoardPage() {
  const params = useParams<{ id: string }>();
  const huntId = params.id;
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        setUserId(u.user?.id || null);
        const b = await getBoardForHunt(huntId);
        setBoard(b);
      } catch (e: any) { setErr(e.message || String(e)); }
      finally { setLoading(false); }
    })();
  }, [huntId]);

  return (
    <Shell tabs={EDU_TABS}>
      <div className="mb-3">
        <Link href={`/educator/activities`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Activities
        </Link>
      </div>
      {loading && <p className="text-sm text-gray-500">Memuatkan…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!loading && !board && <p className="text-sm text-gray-600">Board hantaran belum dicipta untuk aktiviti ini.</p>}
      {board && <QuestBoardView board={board} canManage={true} currentUserId={userId} />}
    </Shell>
  );
}
