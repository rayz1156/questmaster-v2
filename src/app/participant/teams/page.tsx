"use client";
import Shell from "@/components/Shell";
import { useEffect, useState, Suspense } from "react";
import { Home, Compass, Trophy, User as UserIcon, Users, LogIn, LogOut, Check, AlertCircle, Pencil } from "lucide-react";
import { listTeamsByClass, listEnrolledClasses, joinTeamByCode, leaveTeam, renameTeam, listTeamMembers, type Klass } from "@/lib/data";
import { useSession, getSession } from "@/lib/session";

const navTabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: 'Teams', icon: <Users className="w-5 h-5" /> },
  { href: '/participant/leaderboard', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];

function Inner() {
  const { session, loading: authLoading } = useSession();
  const [classes, setClasses] = useState<Klass[]>([]);
  const [activeClassId, setActiveClassId] = useState('');
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinMsg, setJoinMsg] = useState<{type:'ok'|'err',text:string}|null>(null);
  const [expandedTeam, setExpandedTeam] = useState<string|null>(null);
  const [renamingId, setRenamingId] = useState<string|null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [countMap, setCountMap] = useState<Record<string,number>>({});
  const [membersByTeam, setMembersByTeam] = useState<Record<string,any[]>>({});

  useEffect(() => {
    if (authLoading) return;
    (async () => {
      try {
        const cs = await listEnrolledClasses();
        setClasses(cs);
        if (cs.length > 0) setActiveClassId(cs[0].id);
      } catch {} finally { setLoading(false); }
    })();
  }, [authLoading]);

  useEffect(() => {
    if (!activeClassId) { setTeams([]); return; }
    setLoading(true);
    listTeamsByClass(activeClassId).then(async ts => {
      setTeams(ts as any);
      // Auto-load all members and auto-expand user's team
      if (uid && ts.length > 0) {
        const allMembers: Record<string,any[]> = {};
        await Promise.all(ts.map(async (team: any) => {
          try { const ms = await listTeamMembers(team.id); allMembers[team.id] = ms; } catch {}
        }));
        setMembersByTeam(prev => ({ ...prev, ...allMembers }));
        const myTeam = ts.find((team: any) => allMembers[team.id]?.some((m: any) => m.user_id === uid));
        if (myTeam) setExpandedTeam((myTeam as any).id);
      }
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data } = await supabase.rpc('qm_team_member_counts', { p_class_id: activeClassId });
        if (data) { const m: Record<string,number> = {}; for (const r of data as any[]) m[r.team_id] = Number(r.cnt); setCountMap(m); }
      } catch {}
    }).catch(() => setTeams([])).finally(() => setLoading(false));
  }, [activeClassId]);

  const loadMembers = async (teamId: string) => {
    if (membersByTeam[teamId]) return;
    try { const ms = await listTeamMembers(teamId); setMembersByTeam(p => ({...p, [teamId]: ms})); } catch {}
  };

  const onJoin = async () => {
    if (!code.trim()) return;
    setJoinBusy(true); setJoinMsg(null);
    try {
      await joinTeamByCode(code.trim().toUpperCase());
      setJoinMsg({type:'ok', text:'Joined successfully!'});
      setCode('');
      if (activeClassId) { const ts = await listTeamsByClass(activeClassId); setTeams(ts as any); }
    } catch (e:any) { setJoinMsg({type:'err', text: e?.message || 'Failed to join'}); }
    finally { setJoinBusy(false); }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p>Loading...</p></div>;

  const uid = session?.id;

  return (
    <Shell tabs={navTabs}>
      <h1 className="text-xl font-bold mb-4">Teams</h1>
      <div className="bg-white border rounded-xl p-4 mb-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Join a team by code</h2>
        <div className="flex gap-2">
          <input className="border rounded-lg px-3 py-2 text-sm flex-1 focus:ring-2 focus:ring-purple-300 outline-none font-mono uppercase tracking-widest" placeholder="Enter team code" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onJoin()}/>
          <button onClick={onJoin} disabled={joinBusy||!code.trim()} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm px-5 py-2 rounded-lg flex items-center gap-1.5 transition"><LogIn className="w-4 h-4"/>Join</button>
        </div>
        {joinMsg && <div className={`mt-2 text-sm flex items-center gap-1.5 ${joinMsg.type==='ok'?'text-green-600':'text-red-600'}`}>{joinMsg.type==='ok'?<Check className="w-4 h-4"/>:<AlertCircle className="w-4 h-4"/>}{joinMsg.text}</div>}
      </div>
      {classes.length > 1 && <select className="border rounded-lg px-3 py-2 text-sm bg-white mb-4" value={activeClassId} onChange={e=>setActiveClassId(e.target.value)}>
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>}
      {loading ? <p className="text-gray-400 text-sm text-center py-8">Loading teams...</p> : teams.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">No teams in this class yet.</p>
      ) : (
        <div className="space-y-2">
          {teams.map(t => {
            const isExp = expandedTeam === t.id;
            const members = membersByTeam[t.id] || [];
            const isMine = members.some((m:any) => m.user_id === uid);
              const hasMyTeam = teams.some((tt:any) => (membersByTeam[tt.id] || []).some((mm:any) => mm.user_id === uid));
              const count = countMap[t.id] ?? 0;
              const maxM = t.max_members ?? 5;
              const isFull = count >= maxM;
            return (
              <div key={t.id} className={`bg-white border rounded-xl overflow-hidden transition ${isMine ? 'border-purple-300 ring-1 ring-purple-200' : ''}`}>
                <button onClick={() => { if(isMine){} else { setExpandedTeam(isExp ? null : t.id); } loadMembers(t.id); }} className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center"><Users className="w-4 h-4 text-purple-600"/></div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-1">{renamingId===t.id?(<form className="flex items-center gap-1" onSubmit={async(e)=>{e.preventDefault();e.stopPropagation();if(!renameVal.trim())return;try{await renameTeam(t.id,renameVal.trim());setTeams((ts:any)=>ts.map((x:any)=>x.id===t.id?{...x,name:renameVal.trim()}:x));setRenamingId(null);}catch(err:any){alert(err?.message||'Failed');}}}><input autoFocus className="border rounded px-1 py-0.5 text-sm w-32" value={renameVal} onChange={e=>setRenameVal(e.target.value)} onClick={e=>e.stopPropagation()}/><button type="submit" className="text-green-600" onClick={e=>e.stopPropagation()}><Check className="w-4 h-4"/></button><button type="button" className="text-gray-400" onClick={e=>{e.stopPropagation();setRenamingId(null);}}>&times;</button></form>):(<><span>{t.name}</span>{isMine && <button className="text-gray-400 hover:text-purple-600" onClick={e=>{e.stopPropagation();setRenamingId(t.id);setRenameVal(t.name);}} title="Rename team"><Pencil className="w-3.5 h-3.5"/></button>}</>)}{isMine && <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Your team</span>}</div>
                      <div className="text-xs text-gray-400">{countMap[t.id] ?? 0}/{t.max_members??5} members</div>
                    </div>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExp?'rotate-180':''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </button>
                {isExp && (
                  <div className="px-4 pb-4 border-t bg-gray-50/50">
                    {members.length === 0 ? <p className="text-xs text-gray-400 py-2">No members yet</p> : (
                      <div className="divide-y">
                        {members.map((m:any) => (
                          <div key={m.user_id} className="flex items-center gap-2 py-2 text-sm">
                            <div className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-xs font-bold text-purple-700">{(m.profile?.display_name||'?')[0].toUpperCase()}</div>
                            <span className="font-medium">{m.profile?.display_name || ('User '+String(m.user_id).slice(0,8))}</span>
                            {m.user_id === uid && <span className="text-xs text-purple-600">(you)</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {!isMine && !hasMyTeam && (isFull ? (<div className="mx-4 mb-3 text-xs text-gray-500 bg-gray-100 rounded-lg px-3 py-1.5 text-center font-medium">Team full</div>) : (<button onClick={async(e)=>{e.stopPropagation();try{await joinTeamByCode(t.join_code);const ts=await listTeamsByClass(activeClassId!);setTeams(ts as any);const ms=await listTeamMembers(t.id);setMembersByTeam(p=>({...p,[t.id]:ms}));try{const { supabase }=await import("@/lib/supabaseClient");const { data }=await supabase.rpc("qm_team_member_counts",{p_class_id:activeClassId});if(data){const m:Record<string,number>={};for(const r of data as any[])m[r.team_id]=Number(r.cnt);setCountMap(m);}}catch{}setExpandedTeam(t.id);}catch(err:any){alert(err?.message||"Failed to join");}}} className="mx-4 mb-3 text-purple-700 hover:bg-purple-50 text-xs px-3 py-1.5 rounded-lg border border-purple-200 flex items-center gap-1 transition w-fit"><LogIn className="w-3.5 h-3.5"/>Join this team</button>))}
              {isMine && <button onClick={async(e)=>{e.stopPropagation();if(!window.confirm('Leave this team?'))return;try{await leaveTeam(t.id);setMembersByTeam(p=>{const n={...p};delete n[t.id];return n;});if(activeClassId){const ts=await listTeamsByClass(activeClassId);setTeams(ts as any);}}catch(err:any){alert(err?.message||'Failed');}}} className="mx-4 mb-3 text-red-500 hover:bg-red-50 text-xs px-3 py-1.5 rounded-lg border border-red-200 flex items-center gap-1 transition w-fit"><LogOut className="w-3.5 h-3.5"/>Leave this team</button>}
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}

export default function ParticipantTeams(){return <Suspense fallback={<p>Loading...</p>}><Inner/></Suspense>;}
