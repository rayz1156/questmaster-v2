"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAuditLog } from "@/lib/data";
export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { adminListAuditLog().then(setRows); }, []);
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Audit Log</h2>
      {rows.length === 0 ? <p className="text-sm text-gray-500">No entries yet.</p> :
        <div className="space-y-1">{rows.map(r => (
          <div key={r.id} className="card text-xs">
            <div className="flex justify-between"><span className="font-semibold">{r.action}</span><span className="text-gray-400">{new Date(r.created_at).toLocaleString()}</span></div>
            <div className="text-gray-500">actor {(r.actor_id||'').slice(0,8)} · {r.target_type || '-'} {(r.target_id||'').slice(0,8)}</div>
            {r.meta && <div className="font-mono text-gray-400">{JSON.stringify(r.meta)}</div>}
          </div>))}</div>}
    </Shell>
  );
}
