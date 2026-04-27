"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAllSubmissions, reviewSubmission, logAudit, type Submission } from "@/lib/data";
export default function Page() {
  const [subs, setSubs] = useState<Submission[]>([]);
  const reload = async () => setSubs(await adminListAllSubmissions());
  useEffect(() => { reload(); }, []);
  const act = async (s: Submission, status: 'approved'|'rejected') => {
    await reviewSubmission(s.id, status);
    await logAudit('moderation_override', 'submission', s.id, { from: s.status, to: status });
    reload();
  };
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Moderation</h2>
      <p className="text-xs text-gray-500 mb-3">Override educator decisions on any submission.</p>
      <div className="space-y-2">{subs.map(s => (
        <div key={s.id} className="card">
          <div className="flex justify-between items-center">
            <div className="font-mono text-sm">{s.answer || '—'}</div>
            <span className={`text-xs px-2 py-1 rounded-full ${s.status==='approved'?'bg-green-100 text-green-700':s.status==='rejected'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>{s.status}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">{new Date(s.created_at).toLocaleString()}</div>
          <div className="flex gap-2 mt-2">
            <button onClick={()=>act(s,'approved')} className="flex-1 text-xs py-1 rounded bg-green-600 text-white">Approve</button>
            <button onClick={()=>act(s,'rejected')} className="flex-1 text-xs py-1 rounded bg-red-600 text-white">Reject</button>
          </div>
        </div>))}</div>
    </Shell>
  );
}
