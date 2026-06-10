"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ListChecks, Users, BarChart3, Settings as SettingsIcon, User as UserIcon, ArrowLeft, Activity } from "lucide-react";
import Shell from "@/components/Shell";
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
      <div className="mb-3">
        <Link href={`/educator/classes/${classId}`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Class
        </Link>
      </div>
      {loading && <p className="text-sm text-gray-500">Memuatkan…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!loading && !board && <p className="text-sm text-gray-600">Board pengenalan belum dicipta untuk kelas ini.</p>}
      {board && <IntroBoardView board={board} canManage={true} currentUserId={userId} />}
    </Shell>
  );
}
