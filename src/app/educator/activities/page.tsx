"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import { GraduationCap, ListChecks, Users, BarChart3 } from 'lucide-react';
import { listMyHunts, deleteHunt, type Hunt } from '@/lib/data';

const tabs = [
  { href: "/educator/classes",    label: "Classes",    icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams",      label: "Teams",      icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",   label: "Rankings",   icon: <BarChart3 className="w-5 h-5"/> },
];

export default function Page() {
  const { user } = useSession('educator');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [busy, setBusy] = useState(false);
  async function refresh() { setHunts(await listMyHunts()); }
  useEffect(() => { if (!user) return; (async () => { setBusy(true); try { await refresh(); } finally { setBusy(false); } })(); }, [user]);
  async function onDelete(id: string) {
    if (!confirm('Delete this quest? This cannot be undone.')) return;
    await deleteHunt(id); await refresh();
  }
  return (
    <Shell tabs={tabs}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-bold text-lg">My Quests</h2>
        <Link href="/educator/activities/new" className="btn-primary px-3 py-1 text-sm">+ New Quest</Link>
      </div>
      {busy && <p className="text-sm text-gray-500">Loading...</p>}
      {!busy && hunts.length === 0 && <p className="text-sm text-gray-500">No quests yet. Create one to get started.</p>}
      <div className="space-y-2">
        {hunts.map(h => (
          <div key={h.id} className="card flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{h.title}</span>
                <span className="text-xs text-purple-700">{h.points ?? 0} pts</span>
                <span className="text-xs text-gray-500">- {h.status}</span>
              </div>
              {h.description && <p className="text-sm text-gray-600 mt-1">{h.description}</p>}
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <Link href={`/educator/activities/${h.id}`} className="btn-primary px-3 py-1 text-xs">Manage</Link>
              <button onClick={() => onDelete(h.id)} className="text-xs text-red-600 hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}
