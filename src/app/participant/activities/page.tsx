"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, Compass, Trophy, Inbox, User as UserIcon } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listQuestCompletions, type Hunt } from "@/lib/data";
import { supabase } from "@/lib/supabaseClient";

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

function Inner() {
  const { user } = useSession('participant');
  const sp = useSearchParams();
  const huntId = sp.get('hunt') || '';
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [active, setActive] = useState<Hunt | null>(null);
  const [completedTeamIds, setCompletedTeamIds] = useState<string[]>([]);
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!user) return; (async () => {
    setBusy(true);
    try {
      const list = await listQuestsForParticipant();
      setHunts(list);
      const sel = huntId ? (list.find(h => h.id === huntId) || null) : (list[0] || null);
      setActive(sel);
      const { data: tm } = await supabase.from('qm_team_members').select('team_id').eq('user_id', user.id);
      setMyTeamIds(((tm as any[]) || []).map((r) => r.team_id).filter(Boolean));
      if (sel) {
        const cs = await listQuestCompletions(sel.id);
        setCompletedTeamIds(cs.map(c => c.team_id));
      } else {
        setCompletedTeamIds([]);
      }
    } finally { setBusy(false); }
  })(); }, [user, huntId]);

  const myDone = active ? myTeamIds.some(id => completedTeamIds.includes(id)) : false;

  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">My Quests</h2>
      {busy && <p className="text-sm text-gray-500">Loading...</p>}
      {!busy && hunts.length === 0 && (
        <p className="text-sm text-gray-500">No quests yet. Quests appear here once your educator creates them in your classes.</p>
      )}
      {hunts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
          {hunts.map(h => (
            <Link key={h.id} href={`/participant/activities?hunt=${h.id}`} className={`shrink-0 rounded-full px-3 py-1 text-xs border ${active?.id===h.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-200'}`}>{h.title}</Link>
          ))}
        </div>
      )}
      {active && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-lg">{active.title}</div>
              {active.description && <p className="text-sm text-gray-600">{active.description}</p>}
            </div>
            <div className="text-right">
              <div className="text-xs text-gray-500">Reward</div>
              <div className="font-bold text-purple-700">{(active as any).points ?? 0} pts</div>
            </div>
          </div>
          {(active as any).instructions && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1">INSTRUCTIONS</div>
              <p className="text-sm whitespace-pre-wrap">{(active as any).instructions}</p>
            </div>
          )}
          {((active as any).link1 || (active as any).link2) && (
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-500">RESOURCES</div>
              {(active as any).link1 && <a className="block text-sm text-purple-700 underline break-all" href={(active as any).link1} target="_blank" rel="noreferrer">{(active as any).link1}</a>}
              {(active as any).link2 && <a className="block text-sm text-purple-700 underline break-all" href={(active as any).link2} target="_blank" rel="noreferrer">{(active as any).link2}</a>}
            </div>
          )}
          <div className={`text-sm font-medium px-3 py-2 rounded-lg ${myDone ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{myDone ? `✓ Your team has been awarded ${(active as any).points ?? 0} pts for this quest.` : 'Your team has not been marked complete yet. Your educator will tick the team once the quest is done.'}</div>
        </div>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading...</div>}><Inner/></Suspense>;
}
