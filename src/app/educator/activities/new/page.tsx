'use client';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, GraduationCap, ListChecks, Users, BarChart3, Activity, User as UserIcon } from 'lucide-react';
import { listMyClasses, createHuntInClass, updateQuestDetails, type Klass } from '@/lib/data';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [classes, setClasses] = useState<Klass[]>([]);
  const [classId, setClassId] = useState<string>(sp.get('classId') || "");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<'draft'|'active'|'archived'>('draft');
  const [instructions, setInstructions] = useState("");
  const [link1, setLink1] = useState("");
  const [link2, setLink2] = useState("");
  const [submissionLink, setSubmissionLink] = useState("");
  const [points, setPoints] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { listMyClasses().then(cs => { setClasses(cs); if (!classId && cs[0]) setClassId(cs[0].id); }); }, []);
  const submit = async () => {
    if (!title.trim()) { setErr("Title required"); return; }
    if (!classId) { setErr("Please select a class"); return; }
    setBusy(true); setErr(null);
    try {
      const hunt = await createHuntInClass(classId, title.trim(), desc.trim());
      await updateQuestDetails(hunt.id, {
        description: desc.trim() || null,
        status,
        instructions: instructions.trim() || null,
        link1: link1.trim() || null,
        link2: link2.trim() || null,
        submission_link: submissionLink.trim() || null,
        points: Number(points) || 0,
      });
      router.push(`/educator/activities/${hunt.id}`);
    } catch (e: any) { setErr(e.message); setBusy(false); }
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
          <label className="text-sm block"><div className="text-gray-600 mb-1">Class</div>
            <select value={classId} onChange={e=>setClassId(e.target.value)} className="input w-full">{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          </label>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Title</div>
            <input className="input w-full" placeholder="Activity title" value={title} onChange={e=>setTitle(e.target.value)}/>
          </label>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Status</div>
            <select className="input w-full" value={status} onChange={e=>setStatus(e.target.value as any)}>
              <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
            </select>
          </label>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Short description</div>
            <input className="input w-full" value={desc} onChange={e=>setDesc(e.target.value)}/>
          </label>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Instructions</div>
            <textarea className="input w-full min-h-[100px]" placeholder="What teams need to do to complete this quest..." value={instructions} onChange={e=>setInstructions(e.target.value)}/>
          </label>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Instruction Link 1 (any URL)</div>
            <input className="input w-full" value={link1} onChange={e=>setLink1(e.target.value)} placeholder="https://drive.google.com/..."/>
          </label>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Instruction Link 2 (any URL)</div>
            <input className="input w-full" value={link2} onChange={e=>setLink2(e.target.value)} placeholder="https://youtu.be/..."/>
          </label>
          <div className="mt-2 p-3 rounded-lg border bg-purple-50/40 space-y-2">
            <div className="text-sm font-semibold text-purple-800">Submission link (optional)</div>
            <div className="text-xs text-gray-600">When set, the activity board replaces team-column submissions with this link (Google Drive, Dropbox, Padlet, etc).</div>
          <div className="text-xs text-gray-500">Prefer students to post their work directly inside Kuizen? Leave this blank and create a <span className="font-medium">Kuizen submission board</span> from the manage page after you save this activity.</div>
            <label className="text-sm block"><div className="text-gray-600 mb-1">Submission URL</div>
              <input className="input w-full" type="url" value={submissionLink} onChange={e=>setSubmissionLink(e.target.value)} placeholder="https://drive.google.com/drive/folders/..."/>
            </label>
          </div>
          <label className="text-sm block"><div className="text-gray-600 mb-1">Completion points</div>
            <input type="number" min={0} max={1000} className="input w-full" value={points} onChange={e=>setPoints(e.target.value === "" ? "" : String(parseInt(e.target.value, 10)))}/>
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button disabled={busy} onClick={submit} className="btn-primary w-full flex items-center justify-center gap-1"><Check className="w-4 h-4"/>{busy ? "Creating..." : "Create Activity"}</button>
        </>)}
      </div>
    </div>
  );
}

export default function NewHunt() { return <Shell tabs={EDU_TABS}><Suspense fallback={<div className="p-4 text-sm text-gray-500">Loading...</div>}><Inner/></Suspense></Shell>; }
