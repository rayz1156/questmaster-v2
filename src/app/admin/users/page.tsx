"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListProfiles, adminUpdateProfile, logAudit, type Profile } from "@/lib/data";
import { Search } from "lucide-react";
export default function Page() {
  const [users, setUsers] = useState<Profile[]>([]); const [q, setQ] = useState("");
  const reload = async () => setUsers(await adminListProfiles());
  useEffect(() => { reload(); }, []);
  const filtered = users.filter(u => !q || (u.display_name || '').toLowerCase().includes(q.toLowerCase()) || u.role.includes(q.toLowerCase()));
  const setRole = async (u: Profile, role: 'participant'|'educator'|'admin') => {
    await adminUpdateProfile(u.id, { role }); await logAudit('role_change', 'profile', u.id, { from: u.role, to: role }); reload();
  };
  const toggleSuspend = async (u: Profile) => {
    await adminUpdateProfile(u.id, { suspended: !u.suspended });
    await logAudit(u.suspended ? 'unsuspend' : 'suspend', 'profile', u.id); reload();
  };
  const toggleApprove = async (u: Profile) => {
    await adminUpdateProfile(u.id, { approved: !u.approved });
    await logAudit(u.approved ? 'unapprove' : 'approve', 'profile', u.id); reload();
  };
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Users</h2>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/>
        <input className="input pl-9" placeholder="Search users…" value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
      <div className="space-y-2">{filtered.map(u => (
        <div key={u.id} className="card">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-semibold">{u.display_name || u.id.slice(0,8)}</div>
              <div className="text-xs text-gray-500">{u.role}{u.suspended?' · suspended':''}{!u.approved?' · pending approval':''}</div>
            </div>
            <select value={u.role} onChange={e=>setRole(u, e.target.value as any)} className="text-xs border rounded px-2 py-1">
              <option value="participant">participant</option>
              <option value="educator">educator</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={()=>toggleSuspend(u)} className="text-xs px-2 py-1 rounded bg-gray-100">{u.suspended ? 'Unsuspend' : 'Suspend'}</button>
            {!u.approved && <button onClick={()=>toggleApprove(u)} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Approve</button>}
          </div>
        </div>))}</div>
    </Shell>
  );
}
