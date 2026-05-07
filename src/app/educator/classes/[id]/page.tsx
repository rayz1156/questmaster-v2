"use client";
import Shell from "@/components/Shell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ListChecks, Users, BarChart3, Settings as SettingsIcon, GraduationCap, Copy, Trash2, Link as LinkIcon , User as UserIcon, Pencil, Check, X } from "lucide-react";
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
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Link href={`/educator/activities?classId=${klass.id}`} className="p-2 bg-gray-50 rounded-lg text-xs"><ListChecks className="w-4 h-4 mx-auto mb-1"/>Activities</Link>
          <Link href={`/educator/teams?classId=${klass.id}`} className="p-2 bg-gray-50 rounded-lg text-xs"><Users className="w-4 h-4 mx-auto mb-1"/>Teams</Link>
          <Link href={`/educator/rankings?classId=${klass.id}`} className="p-2 bg-gray-50 rounded-lg text-xs"><BarChart3 className="w-4 h-4 mx-auto mb-1"/>Rankings</Link>
        </div>
      </div>

      <div className="card mb-3">
        <div className="font-semibold mb-2">Share with participants</div>
        <div className="text-xs text-gray-500 mb-1">Class code</div>
        <div className="flex items-center gap-2 mb-3">
          <code className="font-mono bg-gray-100 px-3 py-2 rounded text-lg flex-1 text-center">{klass.join_code}</code>
          <button onClick={()=>{navigator.clipboard.writeText(klass.join_code); setMsg('Code copied');}} className="btn-primary py-2 px-3 text-sm flex items-center gap-1"><Copy className="w-4 h-4"/></button>
        </div>
        {msg && <div className="text-xs text-blue-700 mt-2">{msg}</div>}
      </div>

      <div className="card mb-3">
        <div className="font-semibold mb-2">Members ({members.length})</div>
        {members.length === 0 ? <p className="text-xs text-gray-500">No members yet.</p> :
          <div className="space-y-1">{members.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
              <div className="flex-1 min-w-0"><div className="truncate font-medium">{m.qm_profiles?.display_name || (m.user_id ? ('User ' + String(m.user_id).slice(0,8)) : 'User')}</div><div className="text-xs text-gray-500 truncate">{m.qm_profiles?.email}</div></div>
              <button onClick={async()=>{ if(confirm('Remove this member?')){ await removeClassMember(id, m.user_id); reload(); }}} className="text-red-600 px-2 py-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3"/></button>
            </div>
          ))}</div>}
      </div>

      <div className="card">
        <div className="font-semibold mb-2">Pending invites ({invites.filter(i=>!i.accepted_at).length})</div>
        {invites.length === 0 ? <p className="text-xs text-gray-500">No invites sent.</p> :
          <div className="space-y-1">{invites.map(inv => (
            <div key={inv.id} className="text-xs py-1 border-b last:border-0 flex items-center gap-2">
              <span className="flex-1 truncate">{inv.email || '(code)'}</span>
              <span className={inv.accepted_at ? 'text-green-600' : 'text-gray-400'}>{inv.accepted_at ? 'accepted' : 'pending'}</span>
            </div>
          ))}</div>}
      </div>
    <EducatorsCard classId={id} /></Shell>
  );
}
