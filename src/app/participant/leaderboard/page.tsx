'use client';
import { useEffect, useState } from 'react';
import { Home, Compass, Trophy, Inbox, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { useSession } from '@/lib/session';
import { getActiveHunt, listTeams, Team } from '@/lib/data';

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Leaderboard', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/submissions', label: 'Submissions', icon: <Inbox className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];
export default function Page() {
  useSession('participant');
  const [teams,setTeams]=useState<Team[]>([]);
  useEffect(()=>{ getActiveHunt().then(async h=>{ if(h) setTeams(await listTeams(h.id)); }); },[]);
  const podium = teams.slice(0,3); const rest = teams.slice(3);
  const medal = (i:number)=> i===0?'🥇':i===1?'🥈':'🥉';
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Leaderboard</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {podium.map((t,i)=>(
          <div key={t.id} className={`rounded-2xl shadow p-4 text-center text-white ${i===0?'bg-gradient-to-br from-purple-600 to-blue-600 col-span-1':'bg-purple-500/80'}`}>
            <div className="text-2xl">{medal(i)}</div>
            <div className="font-semibold mt-1 truncate">{t.name}</div>
            <div className="text-sm opacity-90">{t.total_points} pts</div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {rest.map((t,i)=>(
          <div key={t.id} className="bg-white rounded-xl shadow flex items-center justify-between p-3">
            <div className="flex items-center gap-3"><span className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 grid place-items-center text-sm font-semibold">{i+4}</span><span className="font-medium">{t.name}</span></div>
            <div className="text-sm text-gray-600">{t.total_points} pts</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
