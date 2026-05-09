"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ListChecks, Users, BarChart3, Settings as SettingsIcon, GraduationCap, Copy, Trash2, Link as LinkIcon, User as UserIcon, Pencil, Check, X, Mail, Inbox, Search, ShieldCheck, UserPlus, ChevronDown, MoreHorizontal } from "lucide-react";
import Shell from "@/components/Shell";
import { getClass, listClassMembers, removeClassMember, listClassInvites, updateClass, Klass, ClassInvite } from "@/lib/data";
import EducatorsCard from "@/components/EducatorsCard";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

const AVATAR_PALETTE = [
  { bg: "bg-indigo-100", fg: "text-indigo-700" },
  { bg: "bg-sky-100", fg: "text-sky-700" },
  { bg: "bg-amber-100", fg: "text-amber-700" },
  { bg: "bg-emerald-100", fg: "text-emerald-700" },
  { bg: "bg-pink-100", fg: "text-pink-700" },
  { bg: "bg-violet-100", fg: "text-violet-700" },
  { bg: "bg-rose-100", fg: "text-rose-700" },
  { bg: "bg-teal-100", fg: "text-teal-700" },
];

function paletteFor(seed: string){
  let h = 0; for(let i=0;i<seed.length;i++){ h = (h*31 + seed.charCodeAt(i)) >>> 0; }
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initialsOf(name: string){
  if(!name) return "U";
  const parts = name.trim().split(/\s+/);
  if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
}

function formatJoined(iso?: string|null){
  if(!iso) return "—";
  try{
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }catch{ return "—"; }
}

function formatLastActive(iso?: string|null){
  if(!iso) return "—";
  try{
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate()-1);
    const isYest = d.toDateString() === yest.toDateString();
    const time = d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});
    if(sameDay) return `Today, ${time}`;
    if(isYest) return `Yesterday, ${time}`;
    return d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) + `, ${time}`;
  }catch{ return "—"; }
}

type SortKey = "recent" | "name" | "joined";

export default function ClassDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [klass, setKlass] = useState<Klass | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<ClassInvite[]>([]);
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("recent");

  const reload = async () => {
    const k = await getClass(id); setKlass(k);
    setMembers(await listClassMembers(id));
    setInvites(await listClassInvites(id));
  };
  useEffect(() => { reload(); }, [id]);

  const pendingInvites = invites.filter(i => !i.accepted_at).length;

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let arr = [...members];
    if(q){
      arr = arr.filter(m => {
        const name = (m.qm_profiles?.display_name || "").toLowerCase();
        const email = (m.qm_profiles?.email || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }
    if(sortBy === "name"){
      arr.sort((a,b) => (a.qm_profiles?.display_name||"").localeCompare(b.qm_profiles?.display_name||""));
    } else if (sortBy === "joined"){
      arr.sort((a,b) => new Date(a.joined_at||0).getTime() - new Date(b.joined_at||0).getTime());
    } else {
      arr.sort((a,b) => new Date(b.joined_at||0).getTime() - new Date(a.joined_at||0).getTime());
    }
    return arr;
  }, [members, search, sortBy]);

  if (!klass) return <Shell tabs={tabs}><p className="text-sm text-gray-500">Loading…</p></Shell>;

  return (
    <Shell tabs={tabs}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/classes" className="text-sm text-gray-500 hover:text-gray-700">← Classes</Link>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl shrink-0" style={{ background: klass.color || '#6366f1' }}/>
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input className="input flex-1" value={nameDraft} onChange={e=>setNameDraft(e.target.value)} autoFocus />
                <button className="btn-primary py-1 px-2 text-xs" disabled={busy || !nameDraft.trim()} onClick={async()=>{ const v=nameDraft.trim(); if(!v||v===klass.name){ setEditingName(false); return; } setBusy(true); setMsg(null); try{ await updateClass(klass.id,{ name: v }); setEditingName(false); await reload(); setMsg("Class renamed"); }catch(err:any){ setMsg(err.message||"Failed to rename"); } finally{ setBusy(false); } }}><Check className="w-4 h-4"/></button>
                <button className="btn-secondary py-1 px-2 text-xs" onClick={()=>setEditingName(false)}><X className="w-4 h-4"/></button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="font-bold text-xl text-gray-900 truncate">{klass.name}</div>
                <button title="Rename class" onClick={()=>{ setNameDraft(klass.name); setEditingName(true); }} className="text-gray-400 hover:text-gray-700"><Pencil className="w-3.5 h-3.5"/></button>
              </div>
            )}
            {klass.description && <div className="text-xs text-gray-500 mt-0.5">{klass.description}</div>}
          </div>
        </div>

        {/* Tab pills */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Link href={`/educator/activities?classId=${klass.id}`} className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition text-sm">
            <ListChecks className="w-5 h-5"/><span>Activities</span>
          </Link>
          <Link href={`/educator/teams?classId=${klass.id}`} className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition text-sm">
            <Users className="w-5 h-5"/><span>Teams</span>
          </Link>
          <Link href={`/educator/rankings?classId=${klass.id}`} className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition text-sm">
            <BarChart3 className="w-5 h-5"/><span>Rankings</span>
          </Link>
          <Link href={`/educator/classes/${klass.id}/board`} className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition text-sm relative">
            <LinkIcon className="w-5 h-5"/><span className="font-medium">Intro Board</span>
            <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-indigo-600 rounded-full"/>
          </Link>
              <Link href={`/educator/classes/${klass.id}/learning-board`} className="flex flex-col items-center justify-center gap-1 px-3 py-3 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition text-sm">
                <LinkIcon className="w-5 h-5"/><span className="font-medium">Learning Board</span>
              </Link>
        </div>
      </div>

      {/* Invite participants */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-indigo-600"/>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900">Invite participants</div>
            <div className="text-xs text-gray-500">Share this class code with your students to join.</div>
          </div>
        </div>
        <div className="flex items-stretch gap-3">
          <div className="flex-1 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 flex items-center justify-center font-mono text-lg tracking-[0.3em] font-bold text-gray-800">{klass.join_code}</div>
          <button onClick={()=>{ navigator.clipboard.writeText(klass.join_code); setMsg('Code copied'); }} className="inline-flex items-center justify-center gap-2 px-5 rounded-xl text-white text-sm font-medium bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-sm">
            <Copy className="w-4 h-4"/> Copy
          </button>
        </div>
        {msg && <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mt-3 inline-flex items-center gap-2"><Check className="w-3.5 h-3.5"/>{msg}</div>}
      </div>

      {/* Stats: Members + Active educators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
            <Users className="w-6 h-6 text-violet-600"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">Members</div>
            <div className="text-2xl font-bold text-gray-900 leading-tight">{members.length}</div>
            <div className="text-xs text-gray-500">Students in this class</div>
          </div>
          <a href="#member-list" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1 shrink-0">View member list <span aria-hidden>→</span></a>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-sky-600"/>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">Active educators</div>
            <div className="text-2xl font-bold text-gray-900 leading-tight">1</div>
            <div className="text-xs text-gray-500">Educators with access</div>
          </div>
        </div>
      </div>

      {/* Member list */}
      <div id="member-list" className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-5 border-b border-gray-100">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0"><Users className="w-5 h-5 text-indigo-600"/></div>
            <div>
              <div className="font-semibold text-gray-900">Member list</div>
              <div className="text-xs text-gray-500">View and manage students in this class.</div>
            </div>
          </div>
          <div className="flex items-center gap-2 md:w-auto w-full">
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search members" className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"/>
            </div>
            <div className="relative">
              <select value={sortBy} onChange={e=>setSortBy(e.target.value as SortKey)} className="appearance-none pl-3 pr-9 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="recent">Sort by: Recently joined</option>
                <option value="name">Sort by: Name</option>
                <option value="joined">Sort by: Oldest joined</option>
              </select>
              <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"/>
            </div>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-2"><Users className="w-6 h-6 text-gray-300"/></div>
            <p className="text-sm text-gray-500">{members.length === 0 ? "No members yet — share the class code above to invite participants." : "No members match your search."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="text-left font-medium px-5 py-3">Name</th>
                  <th className="text-left font-medium px-5 py-3">Email</th>
                  <th className="text-left font-medium px-5 py-3">Status</th>
                  <th className="text-left font-medium px-5 py-3">Joined</th>
                  <th className="text-left font-medium px-5 py-3">Last active</th>
                  <th className="px-5 py-3"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredMembers.map((m:any) => {
                  const name = m.qm_profiles?.display_name || (m.user_id ? ('User ' + String(m.user_id).slice(0,8)) : 'User');
                  const email = m.qm_profiles?.email || '';
                  const seed = m.user_id || name;
                  const pal = paletteFor(String(seed));
                  const inactive = false; // placeholder - no last_active field yet
                  return (
                    <tr key={m.user_id} className="hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full ${pal.bg} ${pal.fg} flex items-center justify-center text-xs font-semibold shrink-0`}>{initialsOf(name)}</div>
                          <div className="font-medium text-gray-900 truncate">{name}</div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-gray-600 truncate">{email}</td>
                      <td className="px-5 py-3">
                        {inactive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200"><span className="w-1.5 h-1.5 rounded-full bg-gray-400"/>Inactive</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>Active</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-gray-700">{formatJoined(m.joined_at)}</td>
                      <td className="px-5 py-3 text-gray-700">{formatLastActive(m.qm_profiles?.last_active_at || m.joined_at)}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={async()=>{ if(confirm('Remove this member?')){ await removeClassMember(id, m.user_id); reload(); } }} title="Remove member" className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><MoreHorizontal className="w-4 h-4"/></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Educator management bar */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 mb-4 flex flex-col md:flex-row md:items-center gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0"><ShieldCheck className="w-5 h-5 text-indigo-600"/></div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900">Educator management</div>
            <div className="text-xs text-gray-500">Manage educators who can access and help run this class.</div>
          </div>
        </div>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0"><Mail className="w-5 h-5 text-amber-600"/></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Pending educator invites ({pendingInvites})</div>
            <div className="text-xs text-gray-500">{pendingInvites === 0 ? 'No pending invites' : `${pendingInvites} pending invite${pendingInvites===1?'':'s'}`}</div>
          </div>
        </div>
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0"><UserPlus className="w-5 h-5 text-emerald-600"/></div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900">Invite a co-educator</div>
            <div className="text-xs text-gray-500">Invite a co-educator to collaborate.</div>
          </div>
        </div>
        <a href="#educators-section" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-sm shrink-0">
          <UserPlus className="w-4 h-4"/> Invite
        </a>
      </div>

      {/* Detailed educators (existing component) */}
      <div id="educators-section">
        <EducatorsCard classId={id} />
      </div>
    </Shell>
  );
}
