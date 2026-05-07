"use client";
import Shell from "@/components/Shell";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ListChecks, Users, BarChart3, Plus, Trash2, GraduationCap, Copy , User as UserIcon } from "lucide-react";
import { listMyClasses, createClass, deleteClass, Klass } from "@/lib/data";

const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];

export default function EduClasses() {
  const [classes, setClasses] = useState<Klass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = async () => { try { setClasses(await listMyClasses()); } catch (e: any) { setErr(e.message || 'Failed to load'); } finally { setLoading(false); } };
  useEffect(() => { reload(); }, []);
  const onCreate = async () => {
    setErr(null);
    if (!name.trim()) { setErr('Class name is required'); return; }
    setBusy(true);
    try {
      await createClass(name.trim(), desc.trim() || undefined, color);
      setName(""); setDesc(""); setShowNew(false);
      await reload();
    } catch (e: any) {
      setErr(e.message || 'Failed to create class');
    } finally { setBusy(false); }
  };
  const onDelete = async (k: Klass) => {
    if (!confirm(`Delete class "${k.name}"? All its activities will be deleted too.`)) return;
    try { await deleteClass(k.id); await reload(); } catch (e: any) { setErr(e.message || 'Delete failed'); }
  };
  return (
    <Shell tabs={tabs}>
      <div className="flex justify-between items-center mb-3">
        <h2 className="page-title">My Classes</h2>
        <button onClick={() => { setShowNew(!showNew); setErr(null); }} className="btn-primary flex items-center gap-1 py-2 px-3 text-sm"><Plus className="w-4 h-4"/>New Class</button>
      </div>
      {showNew && (
        <div className="card mb-3 space-y-2">
          <input className="input w-full" placeholder="Class name (e.g. Form 2A Geography)" value={name} onChange={e=>setName(e.target.value)} required/>
          <input className="input w-full" placeholder="Description (optional)" value={desc} onChange={e=>setDesc(e.target.value)}/>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Color</label>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-10 h-8 rounded"/>
            <button type="button" disabled={busy} onClick={onCreate} className="btn-primary ml-auto py-1 px-3 text-sm">{busy ? 'Creating…' : 'Create'}</button>
          </div>
          {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        </div>
      )}
      {!showNew && err && <div className="text-xs text-red-600 mb-2">{err}</div>}
      {loading ? <p className="text-sm text-gray-500">Loading…</p> :
        classes.length === 0 ? <p className="text-sm text-gray-500">No classes yet. Create one to organise your activities, teams and rankings.</p> :
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {classes.map(k => (
            <div key={k.id} className="card">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: k.color || '#6366f1' }}/>
                  <div className="min-w-0 flex-1">
                    <Link href={`/educator/classes/${k.id}`} className="font-semibold truncate block">{k.name}</Link>
                    {k.description && <div className="text-xs text-gray-500 truncate">{k.description}</div>}
                  </div>
                </div>
                <button onClick={()=>onDelete(k)} className="text-red-600 hover:bg-red-50 rounded-lg px-2 py-1"><Trash2 className="w-4 h-4"/></button>
              </div>
              <div className="text-xs text-gray-400 mt-2 flex items-center gap-2">
                Code: <code className="font-mono bg-gray-100 px-2 py-0.5 rounded">{k.join_code}</code>
                <button onClick={()=>navigator.clipboard.writeText(k.join_code)} className="text-blue-600 flex items-center gap-1"><Copy className="w-3 h-3"/>copy</button>
                <Link href={`/educator/classes/${k.id}`} className="ml-auto text-brand-purple font-semibold">Manage →</Link>
              </div>
            </div>
          ))}
        </div>
      }
    </Shell>
  );
}
