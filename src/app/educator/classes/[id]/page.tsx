"use client";
import Shell from "@/components/Shell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ListChecks, Users, BarChart3, Settings as SettingsIcon, GraduationCap, Copy, Trash2, Mail, QrCode, Link as LinkIcon , User as UserIcon } from "lucide-react";
import { getClass, listClassMembers, removeClassMember, listClassInvites, createClassInvite, Klass, ClassInvite } from "@/lib/data";

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
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const reload = async () => {
    const k = await getClass(id); setKlass(k);
    setMembers(await listClassMembers(id));
    setInvites(await listClassInvites(id));
  };
  useEffect(() => { reload(); }, [id]);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const directLink = klass ? `${origin}/participant/join?code=${klass.join_code}` : '';
  const onCreateLink = async () => {
    const inv = await createClassInvite(id, null);
    await navigator.clipboard.writeText(`${origin}/join/${inv.token}`);
    setMsg("Invite link copied to clipboard");
    reload();
  };
  const onSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/classes/${id}/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed');
      setMsg(`Invite emailed to ${email.trim()}`);
      setEmail("");
      reload();
    } catch (err: any) { setMsg(err.message || 'Failed'); }
    finally { setBusy(false); }
  };
  if (!klass) return <Shell tabs={tabs}><p className="text-sm text-gray-500">Loading…</p></Shell>;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(directLink)}`;
  return (
    <Shell tabs={tabs}>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/educator/classes" className="text-sm text-gray-500">← Classes</Link>
      </div>
      <div className="card mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg shrink-0" style={{ background: klass.color || '#6366f1' }}/>
          <div className="flex-1"><div className="font-bold text-lg">{klass.name}</div>{klass.description && <div className="text-xs text-gray-500">{klass.description}</div>}</div>
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
        <div className="text-xs text-gray-500 mb-1">Direct link</div>
        <div className="flex items-center gap-2 mb-3">
          <input readOnly value={directLink} className="input flex-1 text-xs"/>
          <button onClick={()=>{navigator.clipboard.writeText(directLink); setMsg('Link copied');}} className="btn-primary py-2 px-3 text-sm"><LinkIcon className="w-4 h-4"/></button>
        </div>
        <div className="flex gap-2 mb-3">
          <button onClick={()=>setShowQr(!showQr)} className="btn-primary py-2 px-3 text-sm flex items-center gap-1 flex-1 justify-center"><QrCode className="w-4 h-4"/>{showQr ? 'Hide' : 'Show'} QR</button>
          <button onClick={onCreateLink} className="btn-primary py-2 px-3 text-sm flex items-center gap-1 flex-1 justify-center"><LinkIcon className="w-4 h-4"/>One-time link</button>
        </div>
        {showQr && <div className="flex justify-center mb-3"><img src={qrUrl} alt="QR" className="rounded border"/></div>}
        <form onSubmit={onSendEmail} className="flex gap-2">
          <input type="email" required placeholder="participant@email.com" className="input flex-1" value={email} onChange={e=>setEmail(e.target.value)}/>
          <button disabled={busy} className="btn-primary py-2 px-3 text-sm flex items-center gap-1"><Mail className="w-4 h-4"/>{busy?'…':'Invite'}</button>
        </form>
        {msg && <div className="text-xs text-blue-700 mt-2">{msg}</div>}
      </div>

      <div className="card mb-3">
        <div className="font-semibold mb-2">Members ({members.length})</div>
        {members.length === 0 ? <p className="text-xs text-gray-500">No members yet.</p> :
          <div className="space-y-1">{members.map((m: any) => (
            <div key={m.user_id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
              <div className="flex-1 min-w-0"><div className="truncate font-medium">{m.qm_profiles?.display_name || 'User'}</div><div className="text-xs text-gray-500 truncate">{m.qm_profiles?.email}</div></div>
              <button onClick={async()=>{ if(confirm('Remove this member?')){ await removeClassMember(id, m.user_id); reload(); }}} className="text-red-600 px-2 py-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3"/></button>
            </div>
          ))}</div>}
      </div>

      <div className="card">
        <div className="font-semibold mb-2">Pending invites ({invites.filter(i=>!i.accepted_at).length})</div>
        {invites.length === 0 ? <p className="text-xs text-gray-500">No invites sent.</p> :
          <div className="space-y-1">{invites.map(inv => (
            <div key={inv.id} className="text-xs py-1 border-b last:border-0 flex items-center gap-2">
              <span className="flex-1 truncate">{inv.email || '(direct link)'}</span>
              <span className={inv.accepted_at ? 'text-green-600' : 'text-gray-400'}>{inv.accepted_at ? 'accepted' : 'pending'}</span>
            </div>
          ))}</div>}
      </div>
    </Shell>
  );
}
