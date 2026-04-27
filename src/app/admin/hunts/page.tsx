"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAllHunts, updateHunt, deleteHunt, logAudit, type Hunt } from "@/lib/data";
export default function Page() {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const reload = async () => setHunts(await adminListAllHunts());
  useEffect(() => { reload(); }, []);
  const setStatus = async (h: Hunt, status: 'draft'|'active'|'archived') => {
    await updateHunt(h.id, { status }); await logAudit('hunt_status', 'hunt', h.id, { status }); reload();
  };
  const remove = async (h: Hunt) => {
    if (!confirm(`Delete "${h.title}"? This cannot be undone.`)) return;
    await deleteHunt(h.id); await logAudit('hunt_delete', 'hunt', h.id, { title: h.title }); reload();
  };
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">All Quests</h2>
      <div className="space-y-2">{hunts.map(h => (
        <div key={h.id} className="card">
          <div className="flex justify-between items-start">
            <div><div className="font-semibold">{h.title}</div>
              <div className="text-xs text-gray-500">{h.description}</div>
              <div className="text-xs text-gray-400 mt-1">code <code className="font-mono bg-gray-100 px-1 rounded">{h.invite_code}</code> · owner {h.owner_id.slice(0,8)}</div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${h.status==='active'?'bg-green-100 text-green-700':h.status==='draft'?'bg-gray-100':'bg-blue-100 text-blue-700'}`}>{h.status}</span>
          </div>
          <div className="flex gap-2 mt-2">
            {h.status !== 'active' && <button onClick={()=>setStatus(h,'active')} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Force-publish</button>}
            {h.status !== 'archived' && <button onClick={()=>setStatus(h,'archived')} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">Archive</button>}
            <button onClick={()=>remove(h)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Delete</button>
          </div>
        </div>))}</div>
    </Shell>
  );
}
