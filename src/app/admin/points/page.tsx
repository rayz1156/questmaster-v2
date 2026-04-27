"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAllChallenges, adminUpdateChallenge, logAudit, type Challenge } from "@/lib/data";
import { Search, Save } from "lucide-react";
export default function Page() {
  const [rows, setRows] = useState<Challenge[]>([]);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const reload = async () => { const r = await adminListAllChallenges(); setRows(r); setDraft(Object.fromEntries(r.map(c => [c.id, c.points]))); };
  useEffect(() => { reload(); }, []);
  const filtered = rows.filter(r => !q || (r.title||'').toLowerCase().includes(q.toLowerCase()));
  async function save(c: Challenge) { const p = Number(draft[c.id]); if (Number.isNaN(p)) return; await adminUpdateChallenge(c.id, { points: p }); await logAudit('challenge_points','challenge',c.id,{ points: p }); reload(); }
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Points (Challenges)</h2>
      <div className="relative mb-3"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/><input className="input pl-9" placeholder="Search challenges..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      <div className="space-y-2">{filtered.map(c => (
        <div key={c.id} className="card">
          <div className="font-semibold">{c.title}</div>
          <div className="text-xs text-gray-500 mb-2">hunt {(c.hunt_id||'').slice(0,8)} · idx {c.order_idx}</div>
          <div className="flex gap-2 items-center">
            <label className="text-xs text-gray-500">Points</label>
            <input type="number" className="input w-24" value={draft[c.id] ?? c.points} onChange={e=>setDraft({...draft,[c.id]:Number(e.target.value)})}/>
            <button onClick={()=>save(c)} className="px-3 py-2 rounded-xl bg-black text-white text-sm flex items-center gap-1"><Save className="w-4 h-4"/>Save</button>
          </div>
        </div>))}</div>
    </Shell>
  );
}
