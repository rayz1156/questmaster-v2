"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Home, Compass, Users, Trophy, User as UserIcon, ArrowLeft } from "lucide-react";
import Shell from "@/components/Shell";
import { supabase } from "@/lib/supabase";
import { Board, getBoardForHunt } from "@/lib/boards";
import QuestBoardView from "@/components/boards/QuestBoardView";

const tabs = [
  { href: "/participant/home", label: "Home", icon: <Home className="w-5 h-5"/> },
  { href: "/participant/activities", label: "Activities", icon: <Compass className="w-5 h-5"/> },
  { href: "/participant/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/participant/leaderboard", label: "Ranking", icon: <Trophy className="w-5 h-5"/> },
  { href: "/participant/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

export default function PartActivityBoardPage() {
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
    <Shell tabs={tabs}>
      <div className="mb-3">
        <Link href={`/participant/activities`} className="text-sm text-gray-600 hover:text-gray-900 inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Kembali ke Activities
        </Link>
      </div>
      {loading && <p className="text-sm text-gray-500">Memuatkan…</p>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      {!loading && !board && <p className="text-sm text-gray-600">Board hantaran belum dicipta untuk quest ini.</p>}
      {board && <QuestBoardView board={board} canManage={false} currentUserId={userId} />}
    </Shell>
  );
}
