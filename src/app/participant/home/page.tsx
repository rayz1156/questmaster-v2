"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Home, Compass, Trophy, Inbox, User as UserIcon } from "lucide-react";
import Shell from "@/components/Shell";
import { useSession } from "@/lib/session";
import { listQuestsForParticipant, listEnrolledClasses, getMyProfile, type Hunt } from "@/lib/data";

const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

export default function Page() {
  const { user } = useSession('participant');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [name, setName] = useState<string>("");

  useEffect(() => { if (!user) return; (async () => {
    setHunts(await listQuestsForParticipant());
    setClasses(await listEnrolledClasses());
    const p = await getMyProfile(); setName(p?.display_name || "");
  })(); }, [user]);

  return (
    <Shell tabs={tabs}>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="text-xs font-semibold text-purple-700 tracking-widest">WELCOME</div>
          <div className="mt-1 text-xl font-bold">{name || 'Participant'}</div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <div className="text-xs font-semibold text-purple-700 tracking-widest mb-2">MY CLASSES</div>
          {classes.length === 0 ? (
            <p className="text-sm text-gray-500">You have not joined any class yet. <Link className="underline" href="/participant/join">Join a class</Link> using the code from your educator.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {classes.map((c: any) => (
                <li key={c.id} className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full" style={{ background: c.color || '#7c3aed' }} /><span className="font-medium">{c.name}</span>{c.description && <span className="text-gray-500">- {c.description}</span>}</li>
              ))}
            </ul>
          )}
          <div className="mt-3"><Link href="/participant/join" className="text-xs text-purple-700 underline">+ Join another class</Link></div>
        </div>

        <div className="bg-white rounded-2xl shadow p-5">
          <div className="text-xs font-semibold text-purple-700 tracking-widest mb-2">MY QUESTS</div>
          {hunts.length === 0 ? (
            <p className="text-sm text-gray-500">No quests yet. Quests appear automatically when you join a class.</p>
          ) : (
            <div className="space-y-2">{hunts.map(h => (
              <Link key={h.id} href={`/participant/activities?hunt=${h.id}`} className="card block hover:shadow-md transition">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">{h.title}</span>
                  <span className="text-xs text-purple-700">{(h as any).points ?? 0} pts</span>
                </div>
                {h.description && <p className="text-sm text-gray-500 mt-1">{h.description}</p>}
                <p className="text-xs text-gray-500 mt-1">{h.status}</p>
              </Link>
            ))}</div>
          )}
        </div>
      </div>
    </Shell>
  );
}
