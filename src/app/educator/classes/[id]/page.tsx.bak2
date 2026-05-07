"use client";
import Shell from "@/components/Shell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ListChecks, Users, BarChart3, Settings as SettingsIcon, GraduationCap, Copy, Trash2, Link as LinkIcon , User as UserIcon, Pencil, Check, X, Share2, Mail, Inbox } from "lucide-react";
import { getClass, listClassMembers, removeClassMember, listClassInvites, createClassInvite, updateClass, Klass, ClassInvite } from "@/lib/data";
import EducatorsCard from "@/components/EducatorsCard";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
  { href: "/educator/settings", label: "Settings", icon: <SettingsIcon className="w-5 h-5"/> },
];

export default function ClassDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [klass, setKlass] = useState<Klass | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [invites, setInvites] = useState<ClassInvite[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const reload = async () => {
    const k = await getClass(id); setKlass(k);
    setMembers(await listClassMembers(id));
    setInvites(await listClassInvites(id));
  };
  useEffect(() => { reload(); }, [id]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!klass) return <Shell tabs={tabs}><p className="text-sm text-gray-500">Loading…</p></Shell>;
  return (
    <Shell tabs={tabs}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/classes" className="text-sm text-gray-500">← Classes</Link>
      </div>
      <div className="card mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: klass.color || '#6366f1' }}/>
          <div className="flex-1">{editingName ? (<div className="flex items-center gap-2"><input className="input flex-1" value={nameDraft} onChange={e=>setNameDraft(e.target.value)} autoFocus /><button className="btn-primary py-1 px-2 text-xs" disabled={busy || !nameDraft.trim()} onClick={async()=>{ const v=nameDraft.trim(); if(!v||v===klass.name){ setEditingName(false); return; } setBusy(true); setMsg(null); try{ await updateClass(klass.id,{ name: v }); setEditingName(false); await reload(); setMsg("Class renamed"); }catch(err:any){ setMsg(err.message||"Failed to rename"); } finally{ setBusy(false); } }}><Check className="w-4 h-4"/></button><button className="btn-secondary py-1 px-2 text-xs" onClick={()=>setEditingName(false)}><X className="w-4 h-4"/></button></div>) : (<div className="flex items-center gap-2"><div className="font-bold text-lg">{klass.name}</div><button title="Rename class" onClick={()=>{ setNameDraft(klass.name); setEditingName(true); }} className="text-gray-400 hover:text-gray-700"><Pencil className="w-3 h-3"/></button></div>)}{klass.description && <div className="text-xs text-gray-500">{klass.description}</div>}</div>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <Link href={`/educator/activities?classId=${klass.id}`} className="p-2 bg-gray-50 rounded-lg text-xs"><ListChecks className="w-4 h-4 mx-auto mb-1"/>Activities</Link>
          <Link href={`/educator/teams?classId=${klass.id}`} className="p-2 bg-gray-50 rounded-lg text-xs"><Users className="w-4 h-4 mx-auto mb-1"/>Teams</Link>
          <Link href={`/educator/rankings?classId=${klass.id}`} className="p-2 bg-gray-50 rounded-lg text-xs"><BarChart3 className="w-4 h-4 mx-auto mb-1"/>Rankings</Link>
          <Link href={`/educator/classes/${klass.id}/board`} className="p-2 bg-indigo-50 rounded-lg text-xs text-indigo-700"><LinkIcon className="w-4 h-4 mx-auto mb-1"/>Intro Board</Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
        <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-50 to-indigo-50 border-b border-violet-100">
          <Share2 className="w-4 h-4 text-violet-600"/>
          <div className="font-semibold text-gray-900">Share with participants</div>
        </div>
        <div className="p-5">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Class code</div>
          <div className="flex items-center gap-2">
            <code className="font-mono bg-gradient-to-br from-violet-50 to-indigo-50 border-2 border-violet-200 px-4 py-3 rounded-xl text-lg flex-1 text-center tracking-[0.3em] font-bold text-violet-900">{klass.join_code}</code>
            <button onClick={()=>{navigator.clipboard.writeText(klass.join_code); setMsg('Code copied');}} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white text-sm font-medium bg-gradient-to-br from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700 shadow-sm" aria-label="Copy code"><Copy className="w-4 h-4"/></button>
          </div>
          <div className="text-xs text-gray-500 mt-2">Participants enter this code at <span className="font-mono text-gray-700">/join</span> to join the class.</div>
          {msg && <div className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mt-3 inline-flex items-center gap-2"><Check className="w-3.5 h-3.5"/>{msg}</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
        <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
          <Users className="w-4 h-4 text-emerald-600"/>
          <div className="font-semibold text-gray-900">Members</div>
          <span className="ml-auto inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">{members.length}</span>
        </div>
        <div className="p-5">
        {members.length === 0 ?
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-2"><Users className="w-6 h-6 text-gray-300"/></div>
            <p className="text-sm text-gray-500">No members yet</p>
            <p className="text-xs text-gray-400 mt-1">Share the class code above to invite participants.</p>
          </div> :
          <div className="divide-y divide-gray-100">{members.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-3 py-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center text-violet-700 font-semibold text-sm">{(m.qm_profiles?.display_name || 'U').charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0"><div className="truncate text-sm font-medium text-gray-900">{m.qm_profiles?.display_name || (m.user_id ? ('User ' + String(m.user_id).slice(0,8)) : 'User')}</div><div className="text-xs text-gray-500 truncate">{m.qm_profiles?.email}</div></div>
              <button onClick={async()=>{ if(confirm('Remove this member?')){ await removeClassMember(id, m.user_id); reload(); }}} className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-red-600 hover:bg-red-50" aria-label="Remove member"><Trash2 className="w-4 h-4"/></button>
            </div>
          ))}</div>}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-4">
        <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100">
          <Inbox className="w-4 h-4 text-amber-600"/>
          <div className="font-semibold text-gray-900">Pending invites</div>
          <span className="ml-auto inline-flex items-center justify-center min-w-[1.5rem] h-6 px-2 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">{invites.filter(i=>!i.accepted_at).length}</span>
        </div>
        <div className="p-5">
        {invites.length === 0 ?
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-2"><Inbox className="w-6 h-6 text-gray-300"/></div>
            <p className="text-sm text-gray-500">No invites sent</p>
          </div> :
          <div className="divide-y divide-gray-100">{invites.map(inv => (
            <div key={inv.id} className="flex items-center gap-3 py-3">
              <Mail className="w-4 h-4 text-gray-400 shrink-0"/>
              <span className="flex-1 truncate text-sm text-gray-900">{inv.email || '(code)'}</span>
              <span className={inv.accepted_at ? 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200' : 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200'}>{inv.accepted_at ? <><Check className="w-3 h-3"/>Accepted</> : 'Pending'}</span>
            </div>
          ))}</div>}
        </div>
      </div>
    <EducatorsCard classId={id} /></Shell>
  );
}
