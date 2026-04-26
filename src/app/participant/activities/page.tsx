'use client';
import { useEffect, useState } from 'react';
import { Home, Compass, Trophy, Inbox, User as UserIcon } from 'lucide-react';
import Shell from '@/components/Shell';
import { useSession } from '@/lib/session';
import { getActiveHunt, listChallenges, Challenge } from '@/lib/data';

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Leaderboard', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/submissions', label: 'Submissions', icon: <Inbox className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];
export default function Page() {
  useSession('participant');
  const [chs,setChs]=useState<Challenge[]>([]);
  useEffect(()=>{ getActiveHunt().then(async h=>{ if(h) setChs(await listChallenges(h.id)); }); },[]);
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Challenges</h2>
      <div className="space-y-3">
        {chs.length===0 && <div className="text-gray-500">No challenges yet.</div>}
        {chs.map(c=>(
          <div key={c.id} className="bg-white rounded-2xl shadow p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-purple-700">CHALLENGE {c.order_index}</div>
              <div className="text-xs font-semibold text-blue-600">+{c.points} XP</div>
            </div>
            <div className="font-semibold mt-1">{c.title}</div>
            <div className="text-sm text-gray-600 mt-1">{c.description}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
