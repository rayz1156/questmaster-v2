"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Home, Compass, Users, Trophy, User as UserIcon, ArrowLeft } from "lucide-react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Board, getBoardForClass } from "@/lib/boards";
import IntroBoardView from "@/components/boards/IntroBoardView";

const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <Compass className="w-5 h-5"/> },
  { href: "/participant/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Ranking", icon: <Trophy className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

export default function PartClassBoardPage() {
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
    <Shell tabs={tabs}>
      <div className="mb-3">
        <Link href={`/participant/home`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </Link>
      </div>
      {loading && <p className="text-sm text-gray-500">Memuatkan…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!loading && !board && <p className="text-sm text-gray-600">Board pengenalan belum dicipta untuk kelas ini.</p>}
      {board && <IntroBoardView board={board} canManage={false} currentUserId={userId} />}
    </Shell>
  );
}
