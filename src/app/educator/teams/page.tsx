"use client";
import { showPrompt, showConfirm } from '@/components/ui/promptModal';
import Shell from "@/components/Shell";
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, Users, BarChart3, GraduationCap, Plus, Pencil, Trash2, User as UserIcon, Search, Copy, RefreshCw, ChevronRight, X, Settings, Link2, Activity } from "lucide-react";
import { listMyHunts, listTeams, createTeam, bulkCreateTeams, renameTeam, deleteTeam, setTeamMaxMembers, listMyClasses, listMyHuntsByClass, type Hunt, type Team, type Klass } from "@/lib/data";
import { regenerateTeamCode, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, addScoreAdjustment, type QuestCompletion, listTeamsByClass, createTeamForClass, bulkCreateTeamsForClass, listClassTeamScores, listTeamMembers } from '@/lib/data';
import { useConfirm } from '@/components/ui/ConfirmProvider';

const navTabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/analytics", label: "Analytics", icon: <Activity className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

type DTab = 'members' | 'scores' | 'joinlink' | 'settings';

function TeamsInner() {
  const sp = useSearchParams();
  const classIdParam = sp.get('classId');
  const [classes, setClasses] = useState<Klass[]>([]);
  const confirm = useConfirm();
  const [activeClassId, setActiveClassId] = useState<string>(classIdParam || '');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [teams, setTeams] = useState<any[]>([]);
  const [bonusMap, setBonusMap] = useState<Record<string,{bonus:number,total:number,task:number}>>({});
  const [showBonusForm, setShowBonusForm] = useState<string|null>(null);
  const [bonusInput, setBonusInput] = useState("");
  const [bonusReason, setBonusReason] = useState("Bonus");
  const [membersByTeam, setMembersByTeam] = useState<Record<string, any[]>>({});
  const [memLoading, setMemLoading] = useState<Record<string, boolean>>({});
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [maxM, setMaxM] = useState(5);
  const [bulkN, setBulkN] = useState(4);
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkMax, setBulkMax] = useState(5);
  const [selectedTeamId, setSelectedTeamId] = useState<string|null>(null);
  const [detailTab, setDetailTab] = useState<DTab>('members');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'members'|'score'>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [memberCountByTeam, setMemberCountByTeam] = useState<Record<string,number>>({});

  const reloadClassTeams = useCallback(async (classId: string) => {
    try {
      const teamsRes:any = (classId ? await listTeamsByClass(classId) : []) as any;
      setTeams(teamsRes);
      try {
        if (classId) {
          const { supabase } = await import('@/lib/supabaseClient');
          const { data: cnts } = await supabase.rpc('qm_team_member_counts', { p_class_id: classId });
          if (cnts) {
            const map: Record<string, number> = {};
            for (const r of cnts as any[]) map[r.team_id] = Number(r.cnt) || 0;
            setMemberCountByTeam(map);
          } else {
            setMemberCountByTeam({});
          }
        } else {
          setMemberCountByTeam({});
        }
      } catch { setMemberCountByTeam({}); }
      if (classId) {
        try { const cts = await listClassTeamScores(classId); const m: Record<string,{bonus:number,total:number,task:number}> = {}; for (const r of cts) m[r.team_id] = { bonus: Number(r.adjustment_score)||0, total: Number(r.total_score)||0, task: Number(r.task_score)||0 }; setBonusMap(m); } catch { setBonusMap({}); }
      } else setBonusMap({});
    } catch(e:any){ setErr(e.message); }
  }, []);
  const reloadCompletions = useCallback(async (_id?: string) => {
    try {
      const allComps: QuestCompletion[] = [];
      for (const h of hunts) {
        const cs = await listQuestCompletions(h.id);
        allComps.push(...cs);
      }
      setCompletions(allComps);
    } catch {}
  }, [hunts]);

  useEffect(() => { (async () => { try { const cs = await listMyClasses(); setClasses(cs); } catch {} })(); }, []);
  useEffect(() => { reloadCompletions(activeId); }, [activeId, reloadCompletions]);
  useEffect(() => {
    (async () => {
      try {
        const hs = activeClassId ? await listMyHuntsByClass(activeClassId) : await listMyHunts();
        setHunts(hs); if (hs[0]) setActiveId(hs[0].id); else setActiveId('');
        await reloadClassTeams(activeClassId);
      } catch {} finally { setLoading(false); }
    })();
  }, [activeClassId, reloadClassTeams]);

  useEffect(() => {
    if (!selectedTeamId || membersByTeam[selectedTeamId]) return;
    setMemLoading(m=>({...m,[selectedTeamId]:true}));
    listTeamMembers(selectedTeamId).then(ms => setMembersByTeam(m=>({...m,[selectedTeamId]:ms})))
    .catch(()=>{}).finally(() => setMemLoading(m=>({...m,[selectedTeamId]:false})));
  }, [selectedTeamId]);

  const onAdd = async () => { if (!name.trim()||!activeClassId) return; try { await createTeamForClass(activeClassId,name.trim(),maxM); setName(''); await reloadClassTeams(activeClassId); setShowCreate(false); } catch(e:any){ setErr(e.message); } };
  const onBulk = async () => { if (!activeClassId||bulkN<1) return; try { await bulkCreateTeamsForClass(activeClassId,bulkN,bulkPrefix.trim()||'Team',bulkMax); await reloadClassTeams(activeClassId); setShowCreate(false); } catch(e:any){ setErr(e.message); } };
  const onRename = async (t:any) => { const n = await showPrompt({ title: 'Rename team', initialValue: t.name, confirmLabel: 'Save' }); if(n && n.trim()) { await renameTeam(t.id, n.trim()); reloadClassTeams(activeClassId); } };
  const onMax = async (t:any) => { const n = await showPrompt({ title: 'Max members', initialValue: String(t.max_members ?? 5), inputType: 'number', confirmLabel: 'Save' }); if(n) { await setTeamMaxMembers(t.id, parseInt(n, 10) || 5); reloadClassTeams(activeClassId); } };
  const onDel = async (t:any) => { const ok = await showConfirm({ title: `Delete team ${t.name}?`, description: 'This action cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }); if(ok) { await deleteTeam(t.id); reloadClassTeams(activeClassId); if(selectedTeamId===t.id) setSelectedTeamId(null); } };
  const toggleOne = (id:string) => setSelected(p=>{ const s=new Set(p); if(s.has(id)) s.delete(id); else s.add(id); return s; });
  const toggleAll = () => setSelected(p=>p.size===teams.length?new Set():new Set(teams.map(t=>t.id)));
  const onBulkDelete = async () => { if(!selected.size) return; const ok = await showConfirm({ title: `Delete ${selected.size} team(s)?`, description: 'This action cannot be undone.', confirmLabel: 'Delete', tone: 'danger' }); if(!ok) return; await Promise.all(Array.from(selected).map(id=>deleteTeam(id))); await reloadClassTeams(activeClassId); };

  const sel = teams.find(t=>t.id===selectedTeamId);
  const filtered = teams.filter(t=>!search||t.name?.toLowerCase().includes(search.toLowerCase())).sort((a:any,b:any)=>{
    if(sortBy==='members') return ((memberCountByTeam[b.id]??b.member_count??0))-((memberCountByTeam[a.id]??a.member_count??0));
    if(sortBy==='score') return (bonusMap[b.id]?.total||b.score||0)-(bonusMap[a.id]?.total||a.score||0);
    return (a.name||'').localeCompare(b.name||'');
  });

  return (
    <Shell tabs={navTabs}>
      {activeClassId && (
        <Link href={`/educator/classes/${activeClassId}`} className="inline-flex items-center gap-1 mb-4 text-sm text-purple-700 hover:text-purple-900 hover:underline">← Back to class dashboard</Link>
      )}
      {/* Top bar: class + hunt selectors inline */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white min-w-[200px] font-medium" value={activeClassId} onChange={e=>{setActiveClassId(e.target.value);setSelectedTeamId(null);}}>
          <option value="">All classes</option>
          {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        
        <div className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm"><Users className="w-4 h-4 text-purple-600"/><span className="text-gray-700">{teams.length} team{teams.length!==1?'s':''} created</span></div>
      </div>

      {loading ? <p className="text-center py-12 text-gray-400">Loading teams...</p> : (
        <div className="grid gap-4 lg:[grid-template-columns:minmax(280px,320px)_1fr]">

          {/* ── LEFT: Team list ── */}
          <div className={`flex flex-col ${sel ? "hidden lg:flex" : ""}`}>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none"/>
                <input className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:ring-2 focus:ring-purple-300 outline-none" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              <button onClick={()=>setShowCreate(true)} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 font-medium text-sm shrink-0"><Plus className="w-4 h-4"/>Add team</button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-xs text-gray-500">Sort by:</label>
              <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"><option value="name">Name</option><option value="members">Members</option><option value="score">Score</option></select>
              {selected.size>0 && <button onClick={onBulkDelete} className="ml-auto text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-md"><Trash2 className="w-3 h-3 inline mr-0.5"/>{selected.size}</button>}
            </div>

            <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pb-2">
              {filtered.length===0 && <p className="text-sm text-gray-300 text-center py-8">No teams</p>}
              {filtered.map(t=>{
                const act = selectedTeamId===t.id;
                const sc = bonusMap[t.id]?.total ?? (t.score??0);
                const bon = bonusMap[t.id]?.bonus ?? 0;
                const mc = (typeof memberCountByTeam[t.id]==="number")?memberCountByTeam[t.id]:((membersByTeam[t.id]||[]).length||t.member_count||0);
                return (
                  <div key={t.id} onClick={()=>{setSelectedTeamId(t.id);setDetailTab('members');}} className={`group flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-all shrink-0 w-full lg:w-56 ${act?'border-purple-400 bg-purple-50 shadow':'border-gray-100 hover:border-purple-200 hover:bg-gray-50 bg-white'}`}>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleOne(t.id)} onClick={e=>e.stopPropagation()} className="w-3.5 h-3.5 accent-purple-600 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{t.name}</div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span><Users className="w-3 h-3 inline"/> {mc}/{t.max_members??5}</span>
                        <span className="text-purple-600 font-semibold">{sc}pts</span>
                        {bon!==0 && <span className="text-amber-500">+{bon}</span>}
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 shrink-0 transition ${act?'text-purple-500':'text-gray-200 group-hover:text-gray-400'}`}/>
                  </div>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t mt-2 cursor-pointer select-none">
              <input type="checkbox" checked={selected.size===teams.length&&teams.length>0} onChange={toggleAll} className="w-3.5 h-3.5 accent-purple-600"/>Select all ({teams.length})
            </label>
          </div>

          {/* ── RIGHT: Detail panel ── */}
          <div className={`flex-1 min-w-0 overflow-hidden ${sel ? "block" : "hidden lg:block"}`}>
            {!sel ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-300">
                <Users className="w-12 h-12 mb-3"/>
                <p className="text-sm">Select a team to view details</p>
              </div>
            ) : (
              <div className="bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-gray-50/50">
                  <button onClick={()=>{setSelectedTeamId(null);}} className="lg:hidden inline-flex items-center gap-1 text-sm text-purple-700 hover:text-purple-900 mb-3">← Back to teams</button>
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold truncate">{sel.name}</h2>
                      <p className="text-sm text-gray-500 mt-0.5">Max {sel.max_members??5} members &middot; Score: <span className="text-purple-700 font-bold">{bonusMap[sel.id]?.total??(sel.score??0)}</span>{(bonusMap[sel.id]?.bonus??0)!==0 && <span className="text-amber-600 ml-1">(+{bonusMap[sel.id]?.bonus} bonus)</span>}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 ml-4">
                      <button onClick={()=>onRename(sel)} className="text-sm px-3 py-1.5 rounded-lg hover:bg-gray-100 text-gray-600 flex items-center gap-1.5 transition"><Pencil className="w-3.5 h-3.5"/>Rename</button>
                      <button onClick={()=>onDel(sel)} className="text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 text-red-500 flex items-center gap-1.5 transition"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
                    </div>
                  </div>
                </div>
                {/* Sub-tabs */}
                <div className="flex border-b px-6 overflow-x-auto" style={{scrollbarWidth:'none'}}>
                  {([['members','Members',Users],['scores','Scores & Bonus',BarChart3],['joinlink','Join Code',Link2],['settings','Settings',Settings]] as const).map(([key,label,Icon])=>(
                    <button key={key} onClick={()=>setDetailTab(key as DTab)} className={`flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${detailTab===key?'border-purple-600 text-purple-700 font-semibold':'border-transparent text-gray-500 hover:text-gray-700'}`}>
                      <Icon className="w-4 h-4"/>{label}
                    </button>
                  ))}
                </div>
                {/* Tab content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">

                  {detailTab==='members' && (
                    <div>
                      <div className="text-sm text-gray-500 mb-3">Members ({(membersByTeam[sel.id]||[]).length}/{sel.max_members??5})</div>
                      {memLoading[sel.id] ? <p className="text-sm text-gray-400">Loading...</p> :
                        (membersByTeam[sel.id]||[]).length===0 ? <p className="text-gray-400 text-sm">No members yet.</p> : (
                          <table className="w-full text-sm">
                            <thead><tr className="text-left text-xs text-gray-400 border-b"><th className="pb-2 font-medium">Name</th><th className="pb-2 font-medium">Email</th><th className="pb-2 font-medium">Role</th></tr></thead>
                            <tbody>{(membersByTeam[sel.id]||[]).map((mm:any)=>(
                              <tr key={mm.user_id} className="border-b border-gray-50 hover:bg-purple-50/30">
                                <td className="py-2 font-medium">{mm.profile?.display_name||('User '+String(mm.user_id).slice(0,8))}</td>
                                <td className="py-2 text-gray-500">{mm.profile?.email||'-'}</td>
                                <td className="py-2">{mm.role&&mm.role!=='member'?<span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full">{mm.role}</span>:null}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        )}
                    </div>
                  )}

                  {detailTab==='scores' && (
                    <div className="space-y-4">
                      <div className="text-sm text-gray-500 mb-1">Mark activity completions for <strong>{sel.name}</strong>:</div>
                      {hunts.length === 0 ? <p className="text-sm text-gray-400">No activities in this class.</p> :
                        hunts.map(h => {
                          const done = completions.find(c => c.hunt_id === h.id && c.team_id === sel.id);
                          return (
                            <div key={h.id} className={`flex items-center gap-3 p-3 rounded-lg border transition ${done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-100'}`}>
                              <input type="checkbox" checked={!!done} onChange={async()=>{
                                try { if(done){if(!(await confirm({ title: `Unmark completion for ${h.title}?`, tone: 'danger' })))return;await unmarkTeamCompletion(h.id,sel.id);}else{await markTeamCompletion(h.id,sel.id);} await reloadCompletions(activeId); await reloadClassTeams(activeClassId); }catch(e:any){if(!String(e?.message||'').toLowerCase().includes('duplicate'))alert(e.message);await reloadCompletions(activeId);}
                              }} className="w-5 h-5 accent-purple-600 shrink-0"/>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium">{h.title}</div>
                                <div className="text-xs text-gray-400">{done ? 'Completed (+'+((done as any).awarded_points||0)+' pts)' : (h as any).points ? (h as any).points+' pts on completion' : 'No points set'}</div>
                              </div>
                              {done && <span className="text-green-600 text-xs font-semibold shrink-0">✓ Done</span>}
                            </div>
                          );
                        })
                      }
                      <div className="border-t pt-4">
                {showBonusForm === sel.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input type="number" placeholder="Points (negative to deduct)" value={bonusInput} onChange={e=>setBonusInput(e.target.value)} className="border rounded-lg px-3 py-2 text-sm flex-1" data-testid="bonus-points-input"/>
                    </div>
                    <input type="text" placeholder="Reason" value={bonusReason} onChange={e=>setBonusReason(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-full" data-testid="bonus-reason-input"/>
                    <div className="flex gap-2">
                      <button onClick={async()=>{
                        const n=parseInt(bonusInput,10);if(!Number.isFinite(n)||n===0)return;
                        try{await addScoreAdjustment(activeId,sel.id,n,bonusReason);await reloadClassTeams(activeClassId);}catch(e:any){alert(e.message);}
                        setBonusInput("");setBonusReason("Bonus");setShowBonusForm(null);
                      }} className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg" data-testid="bonus-submit-btn">Submit</button>
                      <button onClick={()=>{setShowBonusForm(null);setBonusInput("");setBonusReason("Bonus");}} className="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={()=>{setShowBonusForm(sel.id);setBonusInput("");setBonusReason("Bonus");}} className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2 transition"><Plus className="w-4 h-4"/>Add Bonus Points</button>
                )}
                        <div className="mt-3 text-sm text-gray-500">Bonus: <span className="text-amber-700 font-semibold">{bonusMap[sel.id]?.bonus??0}</span> &middot; Total: <span className="text-purple-700 font-bold">{bonusMap[sel.id]?.total??(sel.score??0)}</span></div>
                      </div>
                    </div>
                  )}

                  {detailTab==='joinlink' && (()=>{
                    const code=sel.join_code||'';
                    return (
                      <div className="space-y-5">
                        <div>
                          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Join Code</label>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="font-mono font-bold text-2xl tracking-widest text-gray-800">{code||'-'}</span>
                            <button onClick={()=>navigator.clipboard.writeText(code)} className="text-purple-600 hover:text-purple-800 text-xs flex items-center gap-1"><Copy className="w-3.5 h-3.5"/>Copy</button>
                            <button onClick={async()=>{if(!(await confirm({ title: 'Regenerate code? Old code stops working.', tone: 'danger' })))return;await regenerateTeamCode(sel.id);await reloadClassTeams(activeClassId);}} className="text-purple-600 hover:text-purple-800 text-xs flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5"/>New code</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {detailTab==='settings' && (
                    <div className="space-y-5 max-w-sm">
                      <div>
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Team Name</label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="border rounded-lg px-3 py-2 text-sm bg-gray-50 flex-1">{sel.name}</span>
                          <button onClick={()=>onRename(sel)} className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded-lg transition">Rename</button>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Max Members</label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="border rounded-lg px-3 py-2 text-sm bg-gray-50 flex-1">{sel.max_members??5}</span>
                          <button onClick={()=>onMax(sel)} className="border text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition">Change</button>
                        </div>
                      </div>
                      <div className="border-t pt-5">
                        <button onClick={()=>onDel(sel)} className="text-red-500 hover:bg-red-50 text-sm flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 transition"><Trash2 className="w-4 h-4"/>Delete this team</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=>setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h3 className="text-lg font-bold">Create Team</h3>
              <button onClick={()=>setShowCreate(false)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5"/></button>
            </div>
            {err && <div className="mx-6 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-2">{err}</div>}
            {!activeClassId && <div className="mx-6 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-2">Please select a class first before creating teams.</div>}
            <div className="px-6 pb-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Single team</p>
              <div className="space-y-2">
                <div><label className="text-xs text-gray-500 mb-1 block">Team name</label><input className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 outline-none" placeholder="e.g. Alpha" value={name} onChange={e=>setName(e.target.value)}/></div>
                <div><label className="text-xs text-gray-500 mb-1 block">Max members per team</label><input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 outline-none" min={1} max={50} value={maxM} onChange={e=>setMaxM(e.target.value===""?"" as any:parseInt(e.target.value,10))}/></div>
                <button onClick={onAdd} disabled={!name.trim()||!activeClassId} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-sm py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition"><Plus className="w-4 h-4"/>Create team</button>
              </div>
            </div>
            <div className="flex items-center gap-3 px-6 py-2"><div className="flex-1 border-t"/><span className="text-xs text-gray-400">or</span><div className="flex-1 border-t"/></div>
            <div className="px-6 pb-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Bulk create</p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs text-gray-500 mb-1 block">Team name prefix</label><input className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 outline-none w-full" value={bulkPrefix} onChange={e=>setBulkPrefix(e.target.value)} placeholder="e.g. Team"/></div>
                  <div><label className="text-xs text-gray-500 mb-1 block">Number of teams</label><input type="number" className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 outline-none w-full" min={1} max={50} value={bulkN} onChange={e=>setBulkN(e.target.value===""?"" as any:parseInt(e.target.value,10))}/></div>
                </div>
                <div><label className="text-xs text-gray-500 mb-1 block">Max members per team</label><input type="number" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-300 outline-none" min={1} max={50} value={bulkMax} onChange={e=>setBulkMax(e.target.value===""?"" as any:parseInt(e.target.value,10))}/></div>
                <button onClick={onBulk} disabled={!activeClassId} className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm py-2.5 rounded-lg transition">Create {bulkN} teams</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

export default function Teams(){return <Suspense fallback={<p>Loading...</p>}><TeamsInner/></Suspense>;}
// force rebuild v2
