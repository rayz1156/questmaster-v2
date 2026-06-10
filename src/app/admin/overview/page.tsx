"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListProfiles, adminListAllHunts, adminListAllSubmissions, adminListUsersMeta } from "@/lib/data";
export default function Page() {
  const [stats, setStats] = useState({ users: 0, educators: 0, hunts: 0, active: 0, subs: 0, pending: 0 });
  const [breakdown, setBreakdown] = useState({ approved: 0, pending: 0, rejected: 0 });
  useEffect(() => { (async () => {
    const [profiles, hunts, subs, meta] = await Promise.all([adminListProfiles(), adminListAllHunts(), adminListAllSubmissions(), adminListUsersMeta()]);
    const realSubsAll = subs.filter((x:any)=>!(typeof x.answer==="string" && x.answer.startsWith("SEED::")));
    setStats({
      users: profiles.length,
      educators: profiles.filter(p => p.role === 'educator').length,
      hunts: hunts.length,
      active: hunts.filter(h => h.status === 'active').length,
      subs: realSubsAll.length,
      pending: realSubsAll.filter(s => s.status === 'pending').length,
    });
    const susp = profiles.filter((x:any)=>x.suspended);
    const notSusp = profiles.filter((x:any)=>!x.suspended);
    const verified = notSusp.filter((x:any)=>meta[x.id] && meta[x.id].email_confirmed_at);
    const unverified = notSusp.filter((x:any)=>!(meta[x.id] && meta[x.id].email_confirmed_at));
    setBreakdown({ approved: verified.length, pending: unverified.length, rejected: susp.length });
  })(); }, []);
  const Card = ({ label, value }: { label: string; value: number }) => (
    <div className="card text-center"><div className="text-2xl font-bold">{value}</div><div className="text-xs text-gray-500 mt-1">{label}</div></div>
  );
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Overview</h2>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Card label="Users" value={stats.users}/>
        <Card label="Educators" value={stats.educators}/>
        <Card label="Activities" value={stats.hunts}/>
        <Card label="Active" value={stats.active}/>
        <Card label="Submissions" value={stats.subs}/>
        <Card label="Pending" value={stats.pending}/>
      </div>
      <h3 className="font-semibold text-sm text-gray-700 mb-2">User breakdown</h3>
        {(() => { const total = breakdown.approved + breakdown.pending + breakdown.rejected; const rows = [ { label: 'Email-verified', val: breakdown.approved, bar: 'bg-green-500', text: 'text-green-700' }, { label: 'Email not verified', val: breakdown.pending, bar: 'bg-yellow-500', text: 'text-yellow-700' }, { label: 'Suspended / removed', val: breakdown.rejected, bar: 'bg-red-500', text: 'text-red-700' } ]; return (
          <div className="card space-y-3">
            {rows.map(r => (
              <div key={r.label}>
                <div className="flex justify-between text-xs mb-1"><span className={`font-semibold ${r.text}`}>{r.label}</span><span className="text-gray-500">{r.val}{total ? ` · ${Math.round(r.val/total*100)}%` : ''}</span></div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${r.bar} rounded-full`} style={{ width: total ? `${r.val/total*100}%` : '0%' }}/></div>
              </div>
            ))}
            <div className="text-xs text-gray-400 pt-1">Total users: {total}</div>
          </div>
        ); })()}
    </Shell>
  );
}
