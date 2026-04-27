"use client";
import Shell from "@/components/Shell";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, Users, BarChart3, GraduationCap, Plus, Pencil, Trash2 , User as UserIcon } from "lucide-react";
import { listMyHunts, listTeams, createTeam, bulkCreateTeams, renameTeam, deleteTeam, setTeamMaxMembers, listMyClasses, listMyHuntsByClass, type Hunt, type Team, type Klass } from "@/lib/data";
import { regenerateTeamCode, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, addScoreAdjustment, type QuestCompletion } from '@/lib/data';

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];
function TeamsInner() {
  const sp = useSearchParams();
  const classIdParam = sp.get('classId');
  const [classes, setClasses] = useState<Klass[]>([]);
  const [activeClassId, setActiveClassId] = useState<string>(classIdParam || '');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [teams, setTeams] = useState<any[]>([]);
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [showDetails, setShowDetails] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [bulkN, setBulkN] = useState(4);
  const [bulkMax, setBulkMax] = useState(5);
  const [bulkPrefix, setBulkPrefix] = useState('Team');
  const [name, setName] = useState('');
  const [maxM, setMaxM] = useState(5);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const masterRef = useRef<HTMLInputElement>(null);

  const reloadTeams = useCallback(async (id: string) => {
    try { setTeams(await listTeams(id) as any); setSelected(new Set()); } catch (e: any) { setErr(e.message); }
  }, []);
  const reloadCompletions = useCallback(async (id: string) => { try { setCompletions(id ? await listQuestCompletions(id) : []); } catch {} }, []);

  // Load classes on mount
  useEffect(() => { (async () => { try { const cs = await listMyClasses(); setClasses(cs); } catch {} })(); }, []);

  useEffect(() => { reloadCompletions(activeId); }, [activeId, reloadCompletions]);
  // Load hunts when class changes
  useEffect(() => {
    (async () => {
      try {
        const hs = activeClassId ? await listMyHuntsByClass(activeClassId) : await listMyHunts();
        setHunts(hs);
        if (hs[0]) { setActiveId(hs[0].id); await reloadTeams(hs[0].id); }
        else { setTeams([]); setActiveId(''); }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [activeClassId, reloadTeams]);

  useEffect(() => { if (activeId) reloadTeams(activeId); }, [activeId, reloadTeams]);

  // Indeterminate checkbox
  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = selected.size > 0 && selected.size < teams.length;
  }, [selected, teams.length]);

  const onAdd = async () => {
    if (!name.trim() || !activeId) return;
    try { await createTeam(activeId, name.trim(), maxM); setName(''); await reloadTeams(activeId); }
    catch (e: any) { setErr(e.message); }
  };
  const onBulk = async () => {
    if (!activeId || bulkN < 1) return;
    try { await bulkCreateTeams(activeId, bulkN, bulkPrefix.trim() || 'Team', bulkMax); await reloadTeams(activeId); }
    catch (e: any) { setErr(e.message); }
  };
  const onRename = (t: any) => { const n = prompt('New name', t.name); if (n && n.trim()) renameTeam(t.id, n.trim()).then(() => reloadTeams(activeId)); };
  const onMax = (t: any) => { const n = prompt('Max members', String(t.max_members ?? 5)); if (n) setTeamMaxMembers(t.id, parseInt(n, 10) || 5).then(() => reloadTeams(activeId)); };
  const onDel = (t: any) => { if (confirm('Delete team ' + t.name + '?')) deleteTeam(t.id).then(() => reloadTeams(activeId)); };

  const toggleOne = (id: string) => setSelected(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const toggleAll = () => setSelected(prev => prev.size === teams.length ? new Set() : new Set(teams.map(t => t.id)));
  const onBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm('Delete ' + selected.size + ' selected team(s)?')) return;
    await Promise.all(Array.from(selected).map(id => deleteTeam(id)));
    await reloadTeams(activeId);
  };

  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Teams</h2>
      {loading ? <p className="text-sm text-gray-500">Loading...</p> : hunts.length === 0 && !activeClassId ? <p className="text-sm text-gray-500">No activities yet. Create one first.</p> : (<>

        {/* Class filter */}
        <div className="mb-2">
          <label className="text-xs text-gray-500 mr-1">Class:</label>
          <select className="input w-full mb-1" value={activeClassId} onChange={e => { setActiveClassId(e.target.value); setLoading(true); }}>
            <option value="">All classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Quest/Hunt selector */}
        {hunts.length === 0 ? <p className="text-sm text-gray-500">No quests in this class.</p> : (
          <select className="input w-full mb-3" value={activeId} onChange={e => setActiveId(e.target.value)}>
            {hunts.map(h => <option key={h.id} value={h.id}>{h.title}</option>)}
          </select>
        )}

        {/* Bulk create */}
        <div className="card mb-3">
          <div className="font-semibold text-sm mb-2">Bulk create</div>
          <div className="flex gap-2 items-center mb-2">
            <label className="text-xs text-gray-500">Prefix</label>
            <input className="input flex-1" value={bulkPrefix} onChange={e=>setBulkPrefix(e.target.value)}/>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div><label className="text-xs text-gray-500">Teams</label><input type="number" min={1} max={50} className="input w-full" value={bulkN} onChange={e=>setBulkN(parseInt(e.target.value,10)||1)}/></div>
            <div className="col-span-2"><label className="text-xs text-gray-500">Max members</label><input type="number" min={1} max={50} className="input w-full" value={bulkMax} onChange={e=>setBulkMax(parseInt(e.target.value,10)||1)}/></div>
          </div>
          <button onClick={onBulk} className="btn-primary w-full text-sm py-2">Create {bulkN} teams</button>
        </div>

        {/* Add single team */}
        <div className="card mb-3">
          <div className="font-semibold text-sm mb-2">Add a single team</div>
          <div className="space-y-2">
            <div><label className="text-xs text-gray-500">Team name</label><input className="input w-full" placeholder="Enter team name" value={name} onChange={e=>setName(e.target.value)}/></div>
            <div><label className="text-xs text-gray-500">Max members</label><input type="number" min={1} max={50} className="input w-full" placeholder="Max" value={maxM} onChange={e=>setMaxM(parseInt(e.target.value,10)||1)}/></div>
          </div>
          <button onClick={onAdd} disabled={!name.trim()} className="btn-primary w-full text-sm py-2 mt-2 flex items-center gap-1 justify-center disabled:opacity-50"><Plus className="w-4 h-4"/>Add team</button>
        </div>

        {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

        {/* Teams list */}
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-sm">Teams ({teams.length})</div>
            {selected.size > 0 && <button onClick={onBulkDelete} className="text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50 flex items-center gap-1"><Trash2 className="w-3 h-3"/>Delete selected ({selected.size})</button>}
          </div>
          {teams.length > 0 && (
            <div className="flex items-center gap-2 mb-2 pb-2 border-b">
              <input ref={masterRef} type="checkbox" checked={selected.size === teams.length && teams.length > 0} onChange={toggleAll} className="w-4 h-4 accent-purple-600"/>
              <span className="text-xs text-gray-500">Select all</span>
            </div>
          )}
          {teams.length === 0 && <p className="text-sm text-gray-400">No teams yet.</p>}
          {teams.map(t => {
            const qr = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent('https://indoorgame.airiz.tech/tjoin/' + (t.join_code || ''));
            const link = 'https://indoorgame.airiz.tech/tjoin/' + (t.join_code || '');
            return (
            <div key={t.id} className="py-3 border-b last:border-0">
              <div className="flex items-center gap-2 mb-2">
                <input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleOne(t.id)} className="w-4 h-4 accent-purple-600 shrink-0"/>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{t.name}</div>
                  <div className="text-xs text-gray-500">Max {t.max_members ?? 5} members - base score {t.score ?? 0}</div>
                </div>
                <button onClick={()=>onRename(t)} className="text-blue-600 px-2 py-1 rounded hover:bg-blue-50 text-xs">Rename</button>
                <button onClick={()=>onMax(t)} className="text-gray-700 text-xs px-2 py-1 rounded hover:bg-gray-100">Max</button>
                <button onClick={()=>onDel(t)} className="text-red-600 px-2 py-1 rounded hover:bg-red-50 text-xs">Delete</button>
              </div>
              <div className="flex items-center gap-2 mb-2 p-2 bg-purple-50 rounded">{(() => { const done = completions.find(c=>c.team_id===t.id); return (<><input type="checkbox" checked={!!done} onChange={async ()=>{ try { if (done) { if(!confirm('Unmark completion? This will remove awarded points.')) return; await unmarkTeamCompletion(activeId, t.id); } else { await markTeamCompletion(activeId, t.id); } await reloadCompletions(activeId); await reloadTeams(activeId); } catch(e:any){ if(!String(e?.message||'').toLowerCase().includes('duplicate')) alert(e.message); await reloadCompletions(activeId); } }} className="w-4 h-4 accent-purple-600"/><span className="text-sm font-medium">{done ? `Quest completed (+${(done as any).awarded_points} pts)` : 'Mark quest completed'}</span><button onClick={async ()=>{ const v = prompt('Bonus points to add (negative to deduct):','0'); if(v===null) return; const n = parseInt(v,10); if(!Number.isFinite(n)||n===0) return; const reason = prompt('Reason (optional):','Bonus')||''; try { await addScoreAdjustment(activeId, t.id, n, reason); await reloadTeams(activeId); } catch(e:any){ alert(e.message); } }} className="ml-auto text-xs px-2 py-1 rounded bg-purple-600 text-white hover:bg-purple-700">+ Bonus pts</button></>); })()}</div><button onClick={()=>setShowDetails(d=>({...d,[t.id]:!d[t.id]}))} className="text-xs text-purple-700 underline mb-1">{showDetails[t.id] ? 'Hide details' : 'Show join code & QR'}</button>
                {showDetails[t.id] && (<div className="flex items-start gap-3">
                <img src={qr} alt="QR" className="w-20 h-20 rounded border bg-white" />
                <div className="flex-1 min-w-0 text-xs space-y-1">
                  <div><span className="text-gray-500">Code: </span><span className="font-mono font-bold tracking-widest">{t.join_code || '-'}</span> <button onClick={async()=>{await navigator.clipboard.writeText(t.join_code||'');}} className="ml-1 text-purple-700 underline">copy</button> <button onClick={async()=>{ if(!confirm('Generate a new code? Old code will stop working.')) return; const c = await regenerateTeamCode(t.id); await reloadTeams(activeId); alert('New code: '+c); }} className="ml-1 text-purple-700 underline">regenerate</button></div>
                  <div className="break-all"><span className="text-gray-500">Link: </span><a className="text-purple-700 underline" href={link} target="_blank" rel="noreferrer">{link}</a> <button onClick={async()=>{await navigator.clipboard.writeText(link);}} className="ml-1 text-purple-700 underline">copy</button></div>
                  <div><a className="text-purple-700 underline" href={qr} target="_blank" rel="noreferrer">Open QR image</a></div>
                </div>
              </div>)}
            </div>
            );
          })}
        </div>
      </>)}
    </Shell>
  );
}
export default function Teams(){return <Suspense fallback={<p>Loading...</p>}><TeamsInner/></Suspense>;}
