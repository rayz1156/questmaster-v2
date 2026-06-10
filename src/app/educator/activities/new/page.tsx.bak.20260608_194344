"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { createHuntInClass, listMyClasses, Klass } from "@/lib/data";
import Link from "next/link";

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [classes, setClasses] = useState<Klass[]>([]);
  const [classId, setClassId] = useState<string>(sp.get('classId') || "");
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listMyClasses().then(cs => { setClasses(cs); if (!classId && cs[0]) setClassId(cs[0].id); }); }, []);
  const submit = async () => {
    if (!title.trim()) { setErr("Title required"); return; }
    if (!classId) { setErr("Please select a class"); return; }
    setBusy(true); setErr(null);
    try { await createHuntInClass(classId, title.trim(), desc.trim()); router.push(`/educator/activities?classId=${classId}`); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-brand-gradient text-white p-5 rounded-b-3xl">
        <button onClick={()=>router.back()} className="mb-2 flex items-center gap-1 text-sm opacity-90"><ArrowLeft className="w-4 h-4"/>Back</button>
        <h1 className="text-xl font-bold">Create New Activity</h1>
      </div>
      <div className="p-4 space-y-3">
        {classes.length === 0 ? (
          <div className="card text-sm"><p className="text-gray-600 mb-2">You need to create a class first. Each activity belongs to a class.</p><Link href="/educator/classes" className="btn-primary inline-block py-2 px-3">Create a class</Link></div>
        ) : (<>
          <label className="text-xs text-gray-500">Class</label>
          <select value={classId} onChange={e=>setClassId(e.target.value)} className="input w-full">{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <input className="input" placeholder="Activity title" value={title} onChange={e=>setTitle(e.target.value)}/>
          <textarea className="input min-h-[100px]" placeholder="Description" value={desc} onChange={e=>setDesc(e.target.value)}/>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button disabled={busy} onClick={submit} className="btn-primary w-full flex items-center justify-center gap-1"><Check className="w-4 h-4"/>{busy ? "Creating…" : "Create Activity"}</button>
        </>)}
      </div>
    </div>
  );
}
export default function NewHunt() { return <Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading…</div>}><Inner/></Suspense>; }
