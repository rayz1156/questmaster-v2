"use client";
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from '@/lib/session';
import Shell from '@/components/Shell';
import { GraduationCap, ListChecks, Users, BarChart3, Settings as SettingsIcon, ArrowLeft } from 'lucide-react';
import { listMyHunts, updateQuestDetails, type Hunt, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, listTeamsByClass } from '@/lib/data';
import { CheckCircle, Circle } from 'lucide-react';

const tabs = [
  { href: "/educator/classes",    label: "Classes",    icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities",  label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams",      label: "Teams",      icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings",   label: "Rankings",   icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/settings",   label: "Settings",   icon: <SettingsIcon className="w-5 h-5"/> },
];

function PageInner() {
  const { id: huntId } = useParams() as { id: string };
  const { user } = useSession('educator');
  const [hunt, setHunt] = useState<Hunt | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [link1, setLink1] = useState('');
  const [link2, setLink2] = useState('');
  const [status, setStatus] = useState('draft');
  const [points, setPoints] = useState<number|string>("")
  const [err, setErr] = useState<string | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [toggling, setToggling] = useState("");

  const refresh = async () => {
    const hunts = await listMyHunts();
    const h = hunts.find(x => x.id === huntId) || null;
    setHunt(h);
    if (h) {
      setTitle(h.title); setDescription((h as any).description || '');
      setInstructions((h as any).instructions || '');
      setLink1((h as any).link1 || ''); setLink2((h as any).link2 || '');
      setStatus((h as any).status || 'draft');
      setPoints((h as any).points_per_task ?? "");
    }
  };
  useEffect(() => { refresh(); }, [huntId]);

  const toggleComplete = async (teamId: string, isDone: boolean) => {
    setToggling(teamId);
    try {
      if (isDone) await unmarkTeamCompletion(huntId, teamId);
      else await markTeamCompletion(huntId, teamId);
      setCompletions(await listQuestCompletions(huntId));
    } catch {} finally { setToggling(""); }
  };

  const save = async () => {
    try {
      await updateQuestDetails(huntId, { title, description, instructions, link1, link2, status: status as any, points: Number(points) || 0 });
      await refresh();
    } catch (e: any) { setErr(e?.message || 'Save failed'); }
  };

  if (!hunt) return <Shell tabs={tabs}><p className="text-sm text-gray-500">Loading quest...</p></Shell>;

  return (
    <Shell tabs={tabs}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/activities" className="text-sm text-gray-600 hover:underline flex items-center gap-1"><ArrowLeft className="w-4 h-4"/> Back</Link>
      </div>
      <h2 className="font-bold text-lg mb-1">{hunt.title}</h2>
      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
      <div className="card space-y-3">
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Title</div>
          <input className="input w-full" value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Status</div>
          <select className="input w-full" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Short description</div>
          <input className="input w-full" value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Instructions</div>
          <textarea className="input w-full" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="What teams need to do to complete this quest..." />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-gray-600 mb-1">Link 1 (any URL)</div>
            <input className="input w-full" value={link1} onChange={e => setLink1(e.target.value)} placeholder="https://drive.google.com/..." />
          </label>
          <label className="text-sm">
            <div className="text-gray-600 mb-1">Link 2 (any URL)</div>
            <input className="input w-full" value={link2} onChange={e => setLink2(e.target.value)} placeholder="https://youtu.be/..." />
          </label>
        </div>
        <label className="text-sm">
          <div className="text-gray-600 mb-1">Completion points</div>
          <input type="number" min={0} max={1000} className="input w-full" value={points} onChange={e => setPoints(e.target.value === "" ? "" : parseInt(e.target.value, 10))} />
        </label>
        <div>
          <button onClick={save} className="btn-primary px-4 py-2 text-sm">Save changes</button>
        </div>
      {/* Team Completions */}
      <div className="mt-6 pt-4 border-t">
        <h3 className="font-semibold text-sm mb-3">Team Completions</h3>
        {teams.length === 0 ? <p className="text-xs text-gray-400">No teams in this class.</p> :
          <div className="space-y-1">
            {teams.map((t: any) => {
              const done = completions.some((c: any) => c.team_id === t.id);
              return (
                <div key={t.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${done ? 'bg-green-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                  onClick={() => toggleComplete(t.id, done)}>
                  {toggling===t.id ? <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin"/> :
                    done ? <CheckCircle className="w-4 h-4 text-green-600"/> : <Circle className="w-4 h-4 text-gray-300"/>}
                  <span className={`text-sm ${done ? 'text-green-700 font-medium' : 'text-gray-600'}`}>{t.name}</span>
                  {done && <span className="text-xs text-green-500 ml-auto">Complete</span>}
                </div>
              );
            })}
          </div>
        }
      </div>
      </div>
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<p>Loading...</p>}><PageInner /></Suspense>;
}
