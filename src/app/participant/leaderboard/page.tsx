"use client";
import { useEffect, useState } from "react";
import { Home, Compass, Trophy, Inbox, User as UserIcon } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listJoinedHunts, listTeams, type Hunt, type Team } from "@/lib/data";
const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];
export default function Page() {
  const { user } = useSession('participant');
  const [data, setData] = useState<{hunt: Hunt, teams: Team[]}[]>([]);
  useEffect(() => { if (!user) return; (async () => {
    const hunts = await listJoinedHunts();
    const out = await Promise.all(hunts.map(async h => ({ hunt: h, teams: await listTeams(h.id) })));
    setData(out);
  })(); }, [user]);
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3 flex items-center gap-2"><Trophy className="w-5 h-5"/>Leaderboard</h2>
      {data.length === 0 ? <p className="text-sm text-gray-500">Join a quest to see rankings.</p> :
        <div className="space-y-4">{data.map(({hunt, teams}) => (
          <div key={hunt.id}>
            <div className="font-semibold text-sm text-gray-700 mb-1">{hunt.title}</div>
            {teams.length === 0 ? <p className="text-xs text-gray-400 ml-2">No teams yet</p> :
              <div className="space-y-1">{teams.map((t, i) => (
                <div key={t.id} className="card flex justify-between"><span>#{i+1} {t.name}</span><span className="font-mono text-sm">{t.score} pts</span></div>
              ))}</div>}
          </div>))}</div>}
    </Shell>
  );
}
