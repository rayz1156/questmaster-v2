"use client";
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from "next/navigation";
import Link from 'next/link';
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import { GraduationCap, ListChecks, Users, BarChart3, User as UserIcon, Activity } from "lucide-react";
import { listMyHunts, deleteHunt, listMyClasses, type Hunt, type Klass } from '@/lib/data';

const tabs = [
  { href: "/educator/classes",    label: "Classes",    icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams",      label: "Teams",      icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",   label: "Rankings",   icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/analytics", label: "Analytics", icon: <Activity className="w-5 h-5"/> },
  { href: "/educator/profile",    label: "Profile",    icon: <UserIcon className="w-5 h-5"/> },
];

function PageInner() {
  const { user } = useSession('educator');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [classMap, setClassMap] = useState<Record<string,string>>({});
  const [busy, setBusy] = useState(false);
  const sp = useSearchParams();
  const [classFilter, setClassFilter] = useState<string>(sp.get('classId') || "");
  async function refresh() { setHunts(await listMyHunts()); listMyClasses().then((cls: Klass[]) => { const m: Record<string,string> = {}; cls.forEach(k => m[k.id] = k.name); setClassMap(m); }).catch(() => {}); }
  useEffect(() => { if (!user) return; (async () => { setBusy(true); try { await refresh(); } finally { setBusy(false); } })(); }, [user]);
  async function onDelete(id: string) {
    if (!confirm('Delete this quest? This cannot be undone.')) return;
    await deleteHunt(id); await refresh();
  }
  return (
    <Shell tabs={tabs}>
      {classFilter && (
        <Link href={`/educator/classes/${classFilter}`} className="inline-flex items-center gap-1 mb-4 text-sm text-purple-700 hover:text-purple-900 hover:underline">← Back to class dashboard</Link>
      )}
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <h2 className="page-title">My Activities</h2>
        <div className="flex items-center gap-2">
          <select value={classFilter} onChange={e=>setClassFilter(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2 py-1 bg-white">
            <option value="">All classes</option>
            {Object.entries(classMap).map(([id,name]) => (<option key={id} value={id}>{name}</option>))}
          </select>
          <Link href="/educator/activities/new" className="btn-primary px-3 py-1 text-sm">+ New Activity</Link>
        </div>
      </div>
      {busy && <p className="text-sm text-gray-500">Loading...</p>}
      {!busy && hunts.length === 0 && <p className="text-sm text-gray-500">No activities yet. Create one to get started.</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(classFilter ? hunts.filter(h => h.class_id === classFilter) : hunts).map(h => (
          <div key={h.id} className="card flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold">{h.title}</span>
              {h.class_id && classMap[h.class_id] && <span className="text-xs text-purple-600 bg-purple-50 rounded px-2 py-0.5 ml-2">{classMap[h.class_id]}</span>}
                <span className="text-xs text-purple-700">{h.points ?? 0} pts</span>
                <span className="text-xs text-gray-500">- {h.status}</span>
              </div>
              {h.description && <p className="text-sm text-gray-600 mt-1">{h.description}</p>}
            </div>
            <div className="flex flex-col gap-1 items-end shrink-0">
              <Link href={`/educator/activities/${h.id}`} className="btn-primary px-3 py-1 text-xs">Manage</Link>
            {h.submission_link && (<a href={h.submission_link} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-center">Submission Link ↗</a>)}
              <button onClick={() => onDelete(h.id)} className="text-xs text-red-600 hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </Shell>
  );
}


export default function Page() { return <Suspense fallback={<p>Loading...</p>}><PageInner /></Suspense>; }
