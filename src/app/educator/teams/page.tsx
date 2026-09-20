"use client";
import { showPrompt, showConfirm } from '@/components/ui/promptModal';
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import RowMenu from "@/components/ui/RowMenu";
import { EDU_TABS } from '@/lib/eduTabs';
import Link from 'next/link';
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, Users, BarChart3, GraduationCap, Plus, Pencil, Trash2, User as UserIcon, Search, Copy, RefreshCw, ChevronRight, X, Settings, Link2, Activity } from "lucide-react";
import { listMyHunts, listTeams, createTeam, bulkCreateTeams, renameTeam, deleteTeam, setTeamMaxMembers, listMyClasses, listMyHuntsByClass, type Hunt, type Team, type Klass } from "@/lib/data";
import { regenerateTeamCode, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, addScoreAdjustment, type QuestCompletion, listTeamsByClass, createTeamForClass, bulkCreateTeamsForClass, listClassTeamScores, listTeamMembers } from '@/lib/data';
import { useConfirm } from '@/components/ui/ConfirmProvider';

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
  const [bulkMarkHuntId, setBulkMarkHuntId] = useState<string>("");
  const [memberCountByTeam, setMemberCountByTeam] = useState<Record<string,number>>({});
  // Mod pilih disembunyikan sehingga diminta. Kotak semak pada setiap baris
  // sepanjang masa menjadikan senarai kelihatan seperti borang.
  const [selectMode, setSelectMode] = useState(false);

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
  const onBulkMarkComplete = async () => { if(!selected.size || !bulkMarkHuntId) return; const h = hunts.find(x=>x.id===bulkMarkHuntId); if(!h) return; const ok = await showConfirm({ title: `Mark "${h.title}" complete for ${selected.size} team(s)?`, description: 'Each team will receive the activity points. Already-completed teams are skipped.', confirmLabel: 'Mark Complete' }); if(!ok) return; const ids = Array.from(selected); let okN=0, skipN=0, failN=0; for (const tid of ids) { const exists = completions.find(c=>c.hunt_id===bulkMarkHuntId && c.team_id===tid); if(exists){skipN++; continue;} try { await markTeamCompletion(bulkMarkHuntId, tid); okN++; } catch(e:any){ if(String(e?.message||'').toLowerCase().includes('duplicate')) skipN++; else failN++; } } await reloadCompletions(activeId); await reloadClassTeams(activeClassId); alert(`Bulk mark: ${okN} marked, ${skipN} already done, ${failN} failed.`); };

  const sel = teams.find(t=>t.id===selectedTeamId);
  const filtered = teams.filter(t=>!search||t.name?.toLowerCase().includes(search.toLowerCase())).sort((a:any,b:any)=>{
    if(sortBy==='members') return ((memberCountByTeam[b.id]??b.member_count??0))-((memberCountByTeam[a.id]??a.member_count??0));
    if(sortBy==='score') return (bonusMap[b.id]?.total||b.score||0)-(bonusMap[a.id]?.total||a.score||0);
    return (a.name||'').localeCompare(b.name||'');
  });

  const body = (
    <>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className={activeClassId ? "section-title" : "page-title"}>Teams</h2>
          {teams.length > 0 && (
            <p className="text-sm text-ink-muted mt-0.5">{teams.length} {teams.length === 1 ? "team" : "teams"}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!activeClassId && (
            <select className="input w-auto" value={activeClassId} onChange={e=>{setActiveClassId(e.target.value);setSelectedTeamId(null);}}>
              <option value="">All classes</option>
              {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {teams.length > 0 && (
            <button onClick={()=>setShowCreate(true)} className="btn-primary"><Plus className="w-4 h-4"/>Create team</button>
          )}
        </div>
      </div>

      {loading ? <p className="text-sm text-ink-muted">Loading teams…</p> : (
        <div className="grid gap-4">

          {/* ── LEFT: Team list ── */}
          <div className={`flex flex-col ${sel ? "hidden" : ""}`}>
            {teams.length === 0 ? (
              <div className="surface py-20 text-center">
                <div className="w-14 h-14 rounded-full bg-[#EAE6FC] flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-brand-purple"/>
                </div>
                <div className="section-title mb-1">Better learning, together.</div>
                <p className="text-sm text-ink-muted mb-5">
                  {activeClassId ? "Create a team to get started." : "Create a team in a class to get started."}
                </p>
                <button onClick={()=>setShowCreate(true)} className="btn-primary px-5">Create team</button>
                {!activeClassId && (
                  <p className="text-xs text-ink-faint mt-3">Choose a class when you create your team.</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none"/>
                    <input className="input pl-9" placeholder="Search teams..." value={search} onChange={e=>setSearch(e.target.value)}/>
                  </div>
                  <select value={sortBy} onChange={e=>setSortBy(e.target.value as any)} className="input w-auto">
                    <option value="name">Sort by name</option>
                    <option value="members">Sort by members</option>
                    <option value="score">Sort by points</option>
                  </select>
                  <button
                    onClick={()=>{ setSelectMode(v=>!v); setSelected(new Set()); }}
                    className={selectMode ? "btn-primary" : "btn-secondary"}
                  >
                    {selectMode ? "Done" : "Select"}
                  </button>
                </div>

                {selectMode && selected.size > 0 && (
                  <div className="flex items-center gap-3 flex-wrap rounded-xl bg-[#F5F3FE] px-4 py-2.5 mb-4">
                    <span className="text-sm text-ink">{selected.size} selected</span>
                    {hunts.length > 0 && (
                      <>
                        <select value={bulkMarkHuntId} onChange={e=>setBulkMarkHuntId(e.target.value)} className="input w-auto py-1.5 text-sm" data-testid="bulk-hunt-select">
                          <option value="">Choose activity…</option>
                          {hunts.map(h=>(<option key={h.id} value={h.id}>{h.title}</option>))}
                        </select>
                        <button onClick={onBulkMarkComplete} disabled={!bulkMarkHuntId} className="btn-quiet text-brand-purple disabled:opacity-40" data-testid="bulk-mark-btn">Mark complete</button>
                      </>
                    )}
                    <button onClick={toggleAll} className="btn-quiet">Select all</button>
                    <button onClick={onBulkDelete} className="btn-quiet text-[#C0392B] ml-auto"><Trash2 className="w-3.5 h-3.5"/>Delete</button>
                  </div>
                )}

                <div className="surface">
                  <div className="flex items-center gap-4 px-5 py-3 bg-[#FAFAFB]">
                    <div className="t-head flex-1">Team</div>
                    <div className="t-head w-36 text-right hidden sm:block">Members</div>
                    <div className="t-head w-20 text-right">Points</div>
                    <div className="w-8" />
                  </div>
                  {filtered.length === 0 && (
                    <div className="px-5 py-8 text-sm text-ink-muted text-center">No teams match that search.</div>
                  )}
                  {filtered.map(t=>{
                    const max = Number(t.max_members ?? 5);
                    const mc = (typeof memberCountByTeam[t.id]==="number")?memberCountByTeam[t.id]:((membersByTeam[t.id]||[]).length||t.member_count||0);
                    const sc = bonusMap[t.id]?.total ?? (t.score??0);
                    return (
                      <div
                        key={t.id}
                        onClick={()=>{ if(selectMode){ toggleOne(t.id); return; } setSelectedTeamId(t.id); setDetailTab('members'); }}
                        className="t-row flex items-center gap-4 px-5 py-3.5 cursor-pointer"
                      >
                        {selectMode && (
                          <input type="checkbox" checked={selected.has(t.id)} onChange={()=>toggleOne(t.id)} onClick={e=>e.stopPropagation()} className="w-4 h-4 accent-[#7057D9] shrink-0"/>
                        )}
                        <div className="flex-1 min-w-0 text-[15px] text-ink truncate">{t.name}</div>
                        <div className="w-36 hidden sm:flex items-center justify-end gap-2">
                          <span className="flex gap-0.5" aria-hidden>
                            {Array.from({ length: Math.min(max, 8) }).map((_, k) => (
                              <span key={k} className={`w-2.5 h-1.5 rounded-full ${k < mc ? "bg-brand-purple" : "bg-hairline"}`}/>
                            ))}
                          </span>
                          <span className="text-xs text-ink-muted tabular-nums whitespace-nowrap">{mc} of {max}</span>
                        </div>
                        <div className="w-20 text-right text-[15px] text-ink tabular-nums">{sc}</div>
                        <div onClick={e=>e.stopPropagation()}>
                          <RowMenu items={[
                            { label: "Open team", icon: <ChevronRight className="w-4 h-4"/>, onSelect: ()=>{ setSelectedTeamId(t.id); setDetailTab('members'); } },
                            { label: "Rename team", icon: <Pencil className="w-4 h-4"/>, onSelect: ()=>onRename(t) },
                            { label: "Change max members", icon: <Settings className="w-4 h-4"/>, onSelect: ()=>onMax(t) },
                            { label: "Delete team", icon: <Trash2 className="w-4 h-4"/>, danger: true, onSelect: ()=>onDel(t) },
                          ]}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── RIGHT: Detail panel ── */}
          <div className={`flex-1 min-w-0 overflow-hidden ${sel ? "block" : "hidden"}`}>
            {!sel ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-300">
                <Users className="w-12 h-12 mb-3"/>
                <p className="text-sm">Select a team to view details</p>
              </div>
            ) : (
              <div className="bg-white border rounded-xl shadow-sm flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b bg-gray-50/50">
                  <button onClick={()=>{setSelectedTeamId(null);}} className="inline-flex items-center gap-1 text-sm text-purple-700 hover:text-purple-900 mb-3">← Back to teams</button>
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
    </>
  );

  return (
    <Shell tabs={EDU_TABS}>
      {activeClassId
        ? <ClassShell classId={activeClassId} current="people">{body}</ClassShell>
        : body}
    </Shell>
  );
}

export default function Teams(){return <Suspense fallback={<p className="p-6 text-sm text-ink-muted">Loading…</p>}><TeamsInner/></Suspense>;}
// force rebuild v2
