"use client";
/**
 * Teams pendidik, rupa v3 KZ-022.
 *
 * Senarai kumpulan guna DataTable kit (InitialTile, kotak semak pilihan,
 * menu tindakan, penomboran pelanggan); panel butiran guna Card + Tabs kit
 * (tab keadaan); modal cipta guna Modal kit. Semua fungsi data dan
 * pengendali tidak berubah; e-mel ahli kekal dipapar seperti jadual lama
 * (bukan medan baharu).
 */
import { showPrompt, showConfirm } from '@/components/ui/promptModal';
import Shell from "@/components/Shell";
import ClassShell from "@/components/ClassShell";
import { EDU_TABS } from '@/lib/eduTabs';
import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, Search, Copy, RefreshCw, Settings, Users, Link2 } from "lucide-react";
import { listMyHunts, renameTeam, deleteTeam, setTeamMaxMembers, listMyClasses, listMyHuntsByClass, type Hunt, type Klass } from "@/lib/data";
import { regenerateTeamCode, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, addScoreAdjustment, type QuestCompletion, listTeamsByClass, createTeamForClass, bulkCreateTeamsForClass, listClassTeamScores, listTeamMembers } from '@/lib/data';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useBahasa } from "@/lib/i18n/BahasaProvider";
import { terjemahBilangan } from "@/lib/i18n";
import {
  Avatar,
  Button,
  Card,
  CardHead,
  DataTable,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHead,
  Select,
  Tabs,
  type DataColumn,
} from "@/components/ui";

type DTab = 'members' | 'scores' | 'joinlink' | 'settings';

/** Ahli kumpulan seperti yang dikembalikan listTeamMembers. */
type Ahli = { user_id: string; profile?: { display_name?: string | null; email?: string | null } | null; role?: string | null };

/** Baris kumpulan daripada listTeamsByClass (lajur qm_teams). */
type Kumpulan = {
  id: string;
  name: string;
  max_members?: number | null;
  score?: number | null;
  member_count?: number | null;
  join_code?: string | null;
};

function TeamsInner() {
  const sp = useSearchParams();
  const classIdParam = sp.get('classId');
  const { t, bahasa } = useBahasa();
  const [classes, setClasses] = useState<Klass[]>([]);
  const confirm = useConfirm();
  const [activeClassId, setActiveClassId] = useState<string>(classIdParam || '');
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [teams, setTeams] = useState<Kumpulan[]>([]);
  const [bonusMap, setBonusMap] = useState<Record<string,{bonus:number,total:number,task:number}>>({});
  const [showBonusForm, setShowBonusForm] = useState<string|null>(null);
  const [bonusInput, setBonusInput] = useState("");
  const [bonusReason, setBonusReason] = useState("Bonus");
  const [membersByTeam, setMembersByTeam] = useState<Record<string, Ahli[]>>({});
  const [memLoading, setMemLoading] = useState<Record<string, boolean>>({});
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [maxM, setMaxM] = useState<number | "">(5);
  const [bulkN, setBulkN] = useState<number | "">(4);
  const [bulkPrefix, setBulkPrefix] = useState('');
  const [bulkMax, setBulkMax] = useState<number | "">(5);
  const [selectedTeamId, setSelectedTeamId] = useState<string|null>(null);
  const [detailTab, setDetailTab] = useState<DTab>('members');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name'|'members'|'score'>('name');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMarkHuntId, setBulkMarkHuntId] = useState<string>("");
  const [memberCountByTeam, setMemberCountByTeam] = useState<Record<string,number>>({});
  const [halaman, setHalaman] = useState(1);
  // Mod pilih disembunyikan sehingga diminta. Kotak semak pada setiap baris
  // sepanjang masa menjadikan senarai kelihatan seperti borang.
  const [selectMode, setSelectMode] = useState(false);

  const reloadClassTeams = useCallback(async (classId: string) => {
    try {
      const teamsRes = (classId ? await listTeamsByClass(classId) : []) as Kumpulan[];
      setTeams(teamsRes);
      try {
        if (classId) {
          const { supabase } = await import('@/lib/supabaseClient');
          const { data: cnts } = await supabase.rpc('qm_team_member_counts', { p_class_id: classId });
          if (cnts) {
            const map: Record<string, number> = {};
            for (const r of cnts as { team_id: string; cnt: number }[]) map[r.team_id] = Number(r.cnt) || 0;
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
    } catch(e:unknown){ setErr(e instanceof Error ? e.message : t('educator.teams.loadFailed')); }
  }, [t]);
  const reloadCompletions = useCallback(async () => {
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
  useEffect(() => { reloadCompletions(); }, [activeId, reloadCompletions]);
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
    listTeamMembers(selectedTeamId).then(ms => setMembersByTeam(m=>({...m,[selectedTeamId]:ms as Ahli[]})))
    .catch(()=>{}).finally(() => setMemLoading(m=>({...m,[selectedTeamId]:false})));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId]);

  const onAdd = async () => { if (!name.trim()||!activeClassId) return; try { await createTeamForClass(activeClassId,name.trim(),typeof maxM === "number" ? maxM : 5); setName(''); await reloadClassTeams(activeClassId); setShowCreate(false); } catch(e:unknown){ setErr(e instanceof Error ? e.message : t('educator.teams.createFailed')); } };
  const onBulk = async () => { if (!activeClassId||typeof bulkN !== "number"||bulkN<1) return; try { await bulkCreateTeamsForClass(activeClassId,bulkN,bulkPrefix.trim()||t('common.team'),typeof bulkMax === "number" ? bulkMax : 5); await reloadClassTeams(activeClassId); setShowCreate(false); } catch(e:unknown){ setErr(e instanceof Error ? e.message : t('educator.teams.createBulkFailed')); } };
  // Parameter kumpulan dinamakan `pas` supaya tidak berlanggar dengan fungsi t().
  const onRename = async (pas: Kumpulan) => { const n = await showPrompt({ title: t('educator.teams.renameTitle'), initialValue: pas.name, confirmLabel: t('educator.classDetail.save') }); if(n && n.trim()) { await renameTeam(pas.id, n.trim()); reloadClassTeams(activeClassId); } };
  const onMax = async (pas: Kumpulan) => { const n = await showPrompt({ title: t('educator.teams.maxMembersTitle'), initialValue: String(pas.max_members ?? 5), inputType: 'number', confirmLabel: t('educator.classDetail.save') }); if(n) { await setTeamMaxMembers(pas.id, parseInt(n, 10) || 5); reloadClassTeams(activeClassId); } };
  const onDel = async (pas: Kumpulan) => { const ok = await showConfirm({ title: t('educator.teams.deleteTeamTitle', { nama: pas.name }), description: t('educator.teams.cannotUndo'), confirmLabel: t('educator.teams.deleteLabel'), tone: 'danger' }); if(ok) { await deleteTeam(pas.id); reloadClassTeams(activeClassId); if(selectedTeamId===pas.id) setSelectedTeamId(null); } };
  const toggleOne = (id:string) => setSelected(p=>{ const s=new Set(p); if(s.has(id)) s.delete(id); else s.add(id); return s; });
  const toggleAll = () => setSelected(p=>p.size===teams.length?new Set():new Set(teams.map(pas=>pas.id)));
  const onBulkDelete = async () => { if(!selected.size) return; const ok = await showConfirm({ title: t('educator.teams.deleteCountTitle', { n: selected.size }), description: t('educator.teams.cannotUndo'), confirmLabel: t('educator.teams.deleteLabel'), tone: 'danger' }); if(!ok) return; await Promise.all(Array.from(selected).map(id=>deleteTeam(id))); await reloadClassTeams(activeClassId); };
  const onBulkMarkComplete = async () => { if(!selected.size || !bulkMarkHuntId) return; const h = hunts.find(x=>x.id===bulkMarkHuntId); if(!h) return; const ok = await showConfirm({ title: t('educator.teams.markCompleteTitle', { nama: h.title, n: selected.size }), description: t('educator.teams.markCompleteDesc'), confirmLabel: t('educator.teams.markCompleteLabel') }); if(!ok) return; const ids = Array.from(selected); let okN=0, skipN=0, failN=0; for (const tid of ids) { const exists = completions.find(c=>c.hunt_id===bulkMarkHuntId && c.team_id===tid); if(exists){skipN++; continue;} try { await markTeamCompletion(bulkMarkHuntId, tid); okN++; } catch(e:unknown){ if(String((e as { message?: string })?.message||'').toLowerCase().includes('duplicate')) skipN++; else failN++; } } await reloadCompletions(); await reloadClassTeams(activeClassId); alert(t('educator.teams.bulkResult', { siap: okN, sedia: skipN, gagal: failN })); };

  const sel = teams.find(t=>t.id===selectedTeamId);
  const filtered = teams.filter(t=>!search||t.name?.toLowerCase().includes(search.toLowerCase())).sort((a: Kumpulan, b: Kumpulan)=>{
    if(sortBy==='members') return ((memberCountByTeam[b.id]??b.member_count??0))-((memberCountByTeam[a.id]??a.member_count??0));
    if(sortBy==='score') return (bonusMap[b.id]?.total||b.score||0)-(bonusMap[a.id]?.total||a.score||0);
    return (a.name||'').localeCompare(b.name||'');
  });

  const lajurKumpulan: DataColumn<Kumpulan>[] = [
    {
      key: "team",
      header: t('common.team'),
      // Parameter kumpulan dinamakan `pas` supaya tidak berlanggar dengan fungsi t().
      render: (pas: Kumpulan, i: number) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={pas.name || "?"} size="md" index={i} />
          <span className="text-[14px] font-medium text-ink truncate">{pas.name}</span>
        </span>
      ),
    },
    {
      key: "members",
      header: t('educator.teams.colMembers'),
      hideOnMobile: true,
      className: "text-right",
      render: (pas: Kumpulan) => {
        const max = Number(pas.max_members ?? 5);
        const mc = (typeof memberCountByTeam[pas.id]==="number")?memberCountByTeam[pas.id]:((membersByTeam[pas.id]||[]).length||pas.member_count||0);
        return (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <span className="flex gap-0.5" aria-hidden="true">
              {Array.from({ length: Math.min(max, 8) }).map((_, k) => (
                <span key={k} className={`w-2.5 h-1.5 rounded-full ${k < mc ? "bg-brand-purple" : "bg-[#e5e9f2]"}`} />
              ))}
            </span>
            <span className="text-xs text-ink-muted tabular-nums">{t('educator.people.membersOf', { penuh: mc, maks: max })}</span>
          </span>
        );
      },
    },
    {
      key: "points",
      header: t('common.points'),
      className: "text-right",
      render: (pas) => (
        <span className="text-[13px] font-medium text-ink tabular-nums">{bonusMap[pas.id]?.total ?? (pas.score??0)}</span>
      ),
    },
  ];

  const body = (
    <>
      {activeClassId ? (
        <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
          <div>
            <h2 className="section-title">{t('educator.teams.heading')}</h2>
            {teams.length > 0 && (
              <p className="text-sm text-ink-muted mt-0.5">{terjemahBilangan(bahasa, 'educator.people.teamsCountOne', 'educator.people.teamsCountOther', teams.length, { n: teams.length })}</p>
            )}
          </div>
          {teams.length > 0 && (
            <Button onClick={()=>setShowCreate(true)}><Plus className="w-4 h-4"/>{t('educator.teams.createTeam')}</Button>
          )}
        </div>
      ) : (
        <PageHead
          title={t('educator.teams.heading')}
          description={teams.length > 0 ? terjemahBilangan(bahasa, 'educator.people.teamsCountOne', 'educator.people.teamsCountOther', teams.length, { n: teams.length }) : undefined}
          primaryAction={teams.length > 0 ? { label: t('educator.teams.createTeam'), icon: <Plus className="w-4 h-4" />, onSelect: () => setShowCreate(true) } : undefined}
        />
      )}
      {!activeClassId && (
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <Select className="w-auto" value={activeClassId} onChange={e=>{setActiveClassId(e.target.value);setSelectedTeamId(null);}} aria-label={t('educator.teams.filterByClassAria')}>
            <option value="">{t('educator.teams.allClasses')}</option>
            {classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
      )}

      {loading ? <p className="text-sm text-ink-muted">{t('educator.teams.loadingTeams')}</p> : (
        <div className="grid gap-4">

          {/* ── LEFT: Team list ── */}
          <div className={`flex flex-col ${sel ? "hidden" : ""}`}>
            {teams.length === 0 ? (
              <div className="bg-white rounded-[4px] shadow-card">
                <EmptyState
                  icon={<Users className="w-6 h-6" />}
                  title={t('educator.people.teamsEmptyTitle')}
                  text={activeClassId ? t('educator.people.teamsEmptyText') : t('educator.teams.emptyTextNoClass')}
                  actionLabel={t('educator.teams.createTeam')}
                  onAction={()=>setShowCreate(true)}
                />
                {!activeClassId && (
                  <p className="text-xs text-ink-faint pb-5">{t('educator.teams.chooseClassHint')}</p>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 flex-wrap mb-4">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none"/>
                    <input className="input pl-9" placeholder={t('educator.people.searchTeams')} value={search} onChange={e=>setSearch(e.target.value)} aria-label={t('educator.people.searchTeamsAria')}/>
                  </div>
                  <Select value={sortBy} onChange={e=>setSortBy(e.target.value as 'name'|'members'|'score')} aria-label={t('educator.teams.sortByAria')} className="w-auto">
                    <option value="name">{t('educator.teams.sortByName')}</option>
                    <option value="members">{t('educator.teams.sortByMembers')}</option>
                    <option value="score">{t('educator.teams.sortByPoints')}</option>
                  </Select>
                  <Button variant={selectMode ? "primary" : "outline"} onClick={()=>{ setSelectMode(v=>!v); setSelected(new Set()); }}>
                    {selectMode ? t('educator.teams.done') : t('educator.teams.select')}
                  </Button>
                </div>

                {selectMode && selected.size > 0 && (
                  <div className="flex items-center gap-3 flex-wrap rounded-[4px] bg-[#f5f3fe] px-4 py-2.5 mb-4 border border-[#ebe2ff]">
                    <span className="text-sm text-ink">{t('educator.teams.nSelected', { n: selected.size })}</span>
                    {hunts.length > 0 && (
                      <>
                        <select value={bulkMarkHuntId} onChange={e=>setBulkMarkHuntId(e.target.value)} className="input w-auto py-1.5 text-sm" data-testid="bulk-hunt-select">
                          <option value="">{t('educator.teams.chooseActivity')}</option>
                          {hunts.map(h=>(<option key={h.id} value={h.id}>{h.title}</option>))}
                        </select>
                        <button onClick={onBulkMarkComplete} disabled={!bulkMarkHuntId} className="btn-quiet text-brand-purple disabled:opacity-40" data-testid="bulk-mark-btn">{t('educator.teams.markComplete')}</button>
                      </>
                    )}
                    <button onClick={toggleAll} className="btn-quiet">{t('educator.teams.selectAll')}</button>
                    <button onClick={onBulkDelete} className="btn-quiet text-[#C0392B] ml-auto"><Trash2 className="w-3.5 h-3.5"/>{t('educator.teams.deleteLabel')}</button>
                  </div>
                )}

                <DataTable
                  label={t('educator.teams.tableLabel')}
                  columns={lajurKumpulan}
                  rows={filtered}
                  rowKey={(pas)=>pas.id}
                  selectable={selectMode}
                  selectedIds={selected}
                  onToggleSelect={toggleOne}
                  onToggleAll={(semua)=>setSelected(semua?new Set(teams.map(pas=>pas.id)):new Set())}
                  onRowClick={(pas)=>{ if(selectMode){ toggleOne(pas.id); return; } setSelectedTeamId(pas.id); setDetailTab('members'); }}
                  menuItems={(pas)=>[
                    { label: t('educator.teams.menuOpen'), icon: <Link2 className="w-4 h-4"/>, onSelect: ()=>{ setSelectedTeamId(pas.id); setDetailTab('members'); } },
                    { label: t('educator.teams.menuRename'), icon: <Pencil className="w-4 h-4"/>, onSelect: ()=>onRename(pas) },
                    { label: t('educator.teams.menuMax'), icon: <Settings className="w-4 h-4"/>, onSelect: ()=>onMax(pas) },
                    { label: t('educator.teams.menuDelete'), icon: <Trash2 className="w-4 h-4"/>, danger: true, onSelect: ()=>onDel(pas) },
                  ]}
                  menuLabel={t('educator.teams.menuLabel')}
                  halaman={halaman}
                  saizHalaman={10}
                  onHalaman={setHalaman}
                  empty={<EmptyState icon={<Users className="w-6 h-6" />} title={t('educator.people.noTeamsMatch')} text={t('educator.people.tryAnotherSearch')} />}
                />
              </>
            )}
          </div>

          {/* ── RIGHT: Detail panel ── */}
          <div className={`flex-1 min-w-0 overflow-hidden ${sel ? "block" : "hidden"}`}>
            {!sel ? null : (
              <Card padat className="flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 pt-5">
                  <Button variant="ghost" size="sm" onClick={()=>{setSelectedTeamId(null);}} className="mb-3">{t('educator.teams.backToTeams')}</Button>
                  <CardHead
                    title={sel.name}
                    subtitle={
                      <span>
                        {t('educator.teams.maxMembersWord', { maks: sel.max_members??5 })} &middot; {t('educator.teams.scoreWord')}: <span className="font-bold text-brand-purple">{bonusMap[sel.id]?.total??(sel.score??0)}</span>
                        {(bonusMap[sel.id]?.bonus??0)!==0 && <span className="text-kz-warn ml-1">{t('educator.teams.bonusInBrackets', { mata: bonusMap[sel.id]?.bonus })}</span>}
                      </span>
                    }
                    right={
                      <span className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={()=>onRename(sel)}><Pencil className="w-3.5 h-3.5"/>{t('educator.teams.rename')}</Button>
                        <Button variant="outline" size="sm" onClick={()=>onDel(sel)}><Trash2 className="w-3.5 h-3.5"/>{t('educator.teams.deleteLabel')}</Button>
                      </span>
                    }
                  />
                </div>
                {/* Sub-tabs: tab keadaan kit (onSelect) */}
                <div className="px-6">
                  <Tabs
                    items={[
                      { label: t('educator.teams.tabMembers'), onSelect: ()=>setDetailTab('members'), aktif: detailTab==='members' },
                      { label: t('educator.teams.tabScores'), onSelect: ()=>setDetailTab('scores'), aktif: detailTab==='scores' },
                      { label: t('educator.teams.tabJoinCode'), onSelect: ()=>setDetailTab('joinlink'), aktif: detailTab==='joinlink' },
                      { label: t('educator.teams.tabSettings'), onSelect: ()=>setDetailTab('settings'), aktif: detailTab==='settings' },
                    ]}
                  />
                </div>
                {/* Tab content */}
                <div className="flex-1 overflow-y-auto px-6 py-4">

                  {detailTab==='members' && (
                    <div>
                      <div className="text-sm text-ink-faint mb-3">{t('educator.teams.membersCount', { penuh: (membersByTeam[sel.id]||[]).length, maks: sel.max_members??5 })}</div>
                      {memLoading[sel.id] ? <p className="text-sm text-ink-faint">{t('educator.teams.loadingMembers')}</p> :
                        (membersByTeam[sel.id]||[]).length===0 ? <p className="text-ink-faint text-sm">{t('educator.teams.noMembersYet')}</p> : (
                          <DataTable
                            label={t('educator.teams.membersOfTable', { nama: sel.name })}
                            columns={[
                              {
                                key: "nama",
                                header: t('educator.people.colName'),
                                render: (mm: Ahli, i) => (
                                  <span className="flex items-center gap-3 py-2">
                                    <Avatar name={mm.profile?.display_name || t('common.user', { id: String(mm.user_id).slice(0,8) })} size="md" index={i} />
                                    <span className="text-[14px] font-bold text-ink truncate">{mm.profile?.display_name||t('common.user', { id: String(mm.user_id).slice(0,8) })}</span>
                                  </span>
                                ),
                              },
                              {
                                key: "emel",
                                header: t('educator.people.colEmail'),
                                hideOnMobile: true,
                                render: (mm: Ahli) => <span className="text-[13px] text-ink-faint truncate">{mm.profile?.email||'-'}</span>,
                              },
                              {
                                key: "peranan",
                                header: t('educator.teams.colRole'),
                                render: (mm: Ahli) => (
                                  mm.role&&mm.role!=='member'
                                    ? <span className="text-[12px] font-medium bg-[#ebe2ff] text-brand-purple px-1.5 py-0.5 rounded-[3px]">{mm.role}</span>
                                    : null
                                ),
                              },
                            ]}
                            rows={membersByTeam[sel.id]||[]}
                            rowKey={(mm)=>mm.user_id}
                          />
                        )}
                    </div>
                  )}

                  {detailTab==='scores' && (
                    <div className="space-y-4">
                      <div className="text-sm text-ink-faint mb-1">{t('educator.teams.markFor')} <strong className="text-ink">{sel.name}</strong>{t('educator.teams.markForColon')}</div>
                      {hunts.length === 0 ? <p className="text-sm text-ink-faint">{t('educator.teams.noActivities')}</p> :
                        hunts.map(h => {
                          const done = completions.find(c => c.hunt_id === h.id && c.team_id === sel.id);
                          return (
                            <div key={h.id} className={`flex items-center gap-3 p-3 rounded-[4px] border transition ${done ? 'bg-[#e6fcf6] border-[#1ee0ac]/40' : 'bg-canvas border-hairline'}`}>
                              <input type="checkbox" checked={!!done} onChange={async()=>{
                                try { if(done){if(!(await confirm({ title: t('educator.teams.unmarkConfirm', { nama: h.title }), tone: 'danger' })))return;await unmarkTeamCompletion(h.id,sel.id);}else{await markTeamCompletion(h.id,sel.id);} await reloadCompletions(); await reloadClassTeams(activeClassId); }catch(e:unknown){if(!String((e as { message?: string })?.message||'').toLowerCase().includes('duplicate'))alert((e as { message?: string }).message||t('educator.teams.failedGeneric'));await reloadCompletions();}
                              }} className="w-5 h-5 accent-brand-purple shrink-0"/>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-ink">{h.title}</div>
                                <div className="text-xs text-ink-faint">{done ? t('educator.teams.completedPts', { mata: done.awarded_points||0 }) : h.points ? t('educator.teams.ptsOnCompletion', { mata: h.points }) : t('educator.teams.noPointsSet')}</div>
                              </div>
                              {done && <span className="text-kz-up text-xs font-semibold shrink-0">{t('educator.teams.doneBadge')}</span>}
                            </div>
                          );
                        })
                      }
                      <div className="border-t border-kz-line pt-4">
                {showBonusForm === sel.id ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input type="number" placeholder={t('educator.teams.bonusPointsPlaceholder')} value={bonusInput} onChange={e=>setBonusInput(e.target.value)} className="input rounded-[4px] px-3 py-2 text-sm flex-1" data-testid="bonus-points-input"/>
                    </div>
                    <input type="text" placeholder={t('educator.teams.reasonPlaceholder')} value={bonusReason} onChange={e=>setBonusReason(e.target.value)} className="input rounded-[4px] px-3 py-2 text-sm w-full" data-testid="bonus-reason-input"/>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={async()=>{
                        const n=parseInt(bonusInput,10);if(!Number.isFinite(n)||n===0)return;
                        // Bonus peringkat kelas: huntId null, tidak diikat pada aktiviti mana-mana.
                        try{await addScoreAdjustment(null,sel.id,n,bonusReason.trim()||undefined);await reloadClassTeams(activeClassId);}catch(e){alert((e as {message?:string}).message||t('educator.teams.addBonusFailed'));}
                        setBonusInput("");setBonusReason(t('educator.teams.bonusDefault'));setShowBonusForm(null);
                      }} data-testid="bonus-submit-btn">{t('educator.teams.submit')}</Button>
                      <Button variant="outline" size="sm" onClick={()=>{setShowBonusForm(null);setBonusInput("");setBonusReason(t('educator.teams.bonusDefault'));}}>{t('common.cancel')}</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" onClick={()=>{setShowBonusForm(sel.id);setBonusInput("");setBonusReason(t('educator.teams.bonusDefault'));}}><Plus className="w-4 h-4"/>{t('educator.teams.addBonusPoints')}</Button>
                )}
                        <div className="mt-3 text-sm text-ink-faint">{t('educator.teams.bonusWord')}: <span className="text-[#b98a0c] font-semibold">{bonusMap[sel.id]?.bonus??0}</span> &middot; {t('educator.teams.totalWord')}: <span className="font-bold text-brand-purple">{bonusMap[sel.id]?.total??(sel.score??0)}</span></div>
                      </div>
                    </div>
                  )}

                  {detailTab==='joinlink' && (()=>{
                    const code=sel.join_code||'';
                    return (
                      <div className="space-y-5">
                        <div>
                          <label className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint">{t('educator.teams.tabJoinCode')}</label>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="font-mono font-bold text-2xl tracking-widest text-ink">{code||'-'}</span>
                            <button onClick={()=>navigator.clipboard.writeText(code)} className="text-brand-purple hover:underline text-xs flex items-center gap-1"><Copy className="w-3.5 h-3.5"/>{t('educator.teams.copy')}</button>
                            <button onClick={async()=>{if(!(await confirm({ title: t('educator.teams.regenerateConfirm'), tone: 'danger' })))return;await regenerateTeamCode(sel.id);await reloadClassTeams(activeClassId);}} className="text-brand-purple hover:underline text-xs flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5"/>{t('educator.teams.newCode')}</button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {detailTab==='settings' && (
                    <div className="space-y-5 max-w-sm">
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint">{t('educator.teams.teamNameLabel')}</label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="input flex-1 bg-canvas">{sel.name}</span>
                          <Button size="sm" onClick={()=>onRename(sel)}>{t('educator.teams.rename')}</Button>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint">{t('educator.teams.maxMembersLabel')}</label>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="input flex-1 bg-canvas">{sel.max_members??5}</span>
                          <Button variant="outline" size="sm" onClick={()=>onMax(sel)}>{t('educator.teams.change')}</Button>
                        </div>
                      </div>
                      <div className="border-t border-kz-line pt-5">
                        <Button variant="outline" size="sm" onClick={()=>onDel(sel)}><Trash2 className="w-4 h-4"/>{t('educator.teams.deleteThisTeam')}</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      <Modal open={showCreate} onClose={()=>setShowCreate(false)} title={t('educator.teams.createTitle')}>
        {err && <div className="text-xs text-kz-down bg-[#fce4e2] rounded-[4px] px-3 py-2 mb-3">{err}</div>}
        {!activeClassId && <div className="text-xs text-kz-warn bg-[#fef6e0] rounded-[4px] px-3 py-2 mb-3">{t('educator.teams.selectClassFirst')}</div>}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint mb-2">{t('educator.teams.singleTeam')}</p>
          <div className="space-y-3">
            <Field label={t('educator.teams.nameLabel')} htmlFor="nama-kumpulan">
              <Input id="nama-kumpulan" placeholder={t('educator.teams.namePlaceholder')} value={name} onChange={e=>setName(e.target.value)}/>
            </Field>
            <Field label={t('educator.teams.maxMembersPerTeam')} htmlFor="maks-ahli">
              <Input id="maks-ahli" type="number" min={1} max={50} value={maxM} onChange={e=>setMaxM(e.target.value===""?"":parseInt(e.target.value,10))}/>
            </Field>
            <Button onClick={onAdd} disabled={!name.trim()||!activeClassId} className="w-full">
              <Plus className="w-4 h-4"/>{t('educator.teams.createTeam')}
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 my-4"><div className="flex-1 border-t border-kz-line"/><span className="text-xs text-ink-faint">{t('common.or')}</span><div className="flex-1 border-t border-kz-line"/></div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[2.2px] text-ink-faint mb-2">{t('educator.teams.bulkCreate')}</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('educator.teams.prefixLabel')} htmlFor="prefiks">
                <Input id="prefiks" value={bulkPrefix} onChange={e=>setBulkPrefix(e.target.value)} placeholder={t('educator.teams.prefixPlaceholder')}/>
              </Field>
              <Field label={t('educator.teams.numberOfTeams')} htmlFor="bil-kumpulan">
                <Input id="bil-kumpulan" type="number" min={1} max={50} value={bulkN} onChange={e=>setBulkN(e.target.value===""?"":parseInt(e.target.value,10))}/>
              </Field>
            </div>
            <Field label={t('educator.teams.maxMembersPerTeam')} htmlFor="maks-balk">
              <Input id="maks-balk" type="number" min={1} max={50} value={bulkMax} onChange={e=>setBulkMax(e.target.value===""?"":parseInt(e.target.value,10))}/>
            </Field>
            <Button onClick={onBulk} disabled={!activeClassId} className="w-full">{t('educator.teams.createNTeams', { n: typeof bulkN === "number" ? bulkN : 0 })}</Button>
          </div>
        </div>
      </Modal>
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

export default function Teams(){ const { t } = useBahasa(); return <Suspense fallback={<p className="p-6 text-sm text-ink-muted">{t('common.loadingDots')}</p>}><TeamsInner/></Suspense>; }