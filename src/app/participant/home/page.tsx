'use client';
import { useEffect, useState } from 'react';
import { Home, Compass, Trophy, Inbox, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { useSession } from '@/lib/session';
import { getActiveHunt, listChallenges, getProfile, Hunt, Challenge } from '@/lib/data';

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Leaderboard', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/submissions', label: 'Submissions', icon: <Inbox className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];
const ACH = [{i:'⚔️',n:'First Blood'},{i:'🧩',n:'Explorer'},{i:'⭐',n:'Solver'},{i:'🌍',n:'Team Player'},{i:'👏',n:'Speed Run'},{i:'👏',n:'Perfectionist'}];

export default function Page() {
  const { user } = useSession('participant');
  const [hunt,setHunt] = useState<Hunt|null>(null);
  const [chs,setChs] = useState<Challenge[]>([]);
  const [prof,setProf] = useState<{xp:number;level:number}|null>(null);
  useEffect(()=>{
    if(!user) return;
    getProfile(user.id).then(p=>p&&setProf({xp:p.xp,level:p.level}));
    getActiveHunt().then(async h=>{ setHunt(h); if(h) setChs(await listChallenges(h.id)); });
  },[user]);
  const xp = prof?.xp ?? 0, level = prof?.level ?? 1;
  const pct = Math.min(100, ((xp % 300)/300)*100);
  return (
    <Shell tabs={tabs}>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="text-xs font-semibold text-purple-700 tracking-widest">LEVEL {level} • {xp} XP</div>
          <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-600 to-blue-600" style={{width:`${pct}%`}}/></div>
          <div className="text-xs text-gray-500 mt-1">{Math.max(0,300-(xp%300))} XP to level {level+1}</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="text-xs font-semibold text-purple-700 tracking-widest">ACTIVE HUNT</div>
          {hunt ? (<><div className="text-xl font-bold mt-1">{hunt.name}</div><div className="text-gray-600 mt-1">{hunt.description}</div><div className="text-sm text-gray-500 mt-2">{chs.length} challenges • {hunt.location}</div></>) : <div className="text-gray-500 mt-2">No active hunt.</div>}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-700 tracking-widest mb-3">ACHIEVEMENTS</div>
          <div className="grid grid-cols-3 gap-3">{ACH.map(a=>(<div key={a.n} className="bg-white rounded-2xl shadow p-4 text-center"><div className="text-2xl">{a.i}</div><div className="text-sm font-medium mt-1">{a.n}</div></div>))}</div>
        </div>
      </div>
    </Shell>
  );
}
