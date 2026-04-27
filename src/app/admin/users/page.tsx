"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListProfiles, adminUpdateProfile, adminListUsersMeta, adminDeleteUser, logAudit, type Profile, type UserMeta } from "@/lib/data";
import { Search } from "lucide-react";

function fmt(d: string | null | undefined) {
  if (!d) return "Never";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

export default function Page() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});
  const [q, setQ] = useState("");
  const reload = async () => {
    setUsers(await adminListProfiles());
    setMeta(await adminListUsersMeta());
  };
  useEffect(() => { reload(); }, []);
  const filtered = users.filter(u => !q || (u.display_name || "").toLowerCase().includes(q.toLowerCase()) || u.role.includes(q.toLowerCase()) || (meta[u.id]?.email || "").toLowerCase().includes(q.toLowerCase()));
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
  const removeUser = async (u: Profile) => {
    if (!confirm(`Permanently delete user "${u.display_name || u.id.slice(0,8)}"? This cannot be undone.`)) return;
    try {
      await adminDeleteUser(u.id);
      await logAudit('delete_user', 'profile', u.id);
      reload();
    } catch (e: any) {
      alert('Delete failed: ' + (e?.message || e));
    }
  };
  const pendingEducators = users.filter(u => u.role === 'educator' && !u.approved && !u.suspended);
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Users</h2>
      {pendingEducators.length > 0 && (
        <div className="card mb-3 border-2 border-yellow-300 bg-yellow-50">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold uppercase text-yellow-800">Pending Educator Approvals</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-200 text-yellow-900 font-bold">{pendingEducators.length}</span>
          </div>
          <div className="space-y-2">
            {pendingEducators.map(u => { const m = meta[u.id]; return (
              <div key={u.id} className="bg-white rounded-lg p-3 border border-yellow-200">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{u.display_name || u.id.slice(0,8)}</div>
                    {m?.email && <div className="text-xs text-gray-600 truncate">{m.email}</div>}
                    <div className="text-[11px] text-gray-500 mt-1">Registered: {fmt(m?.created_at || u.created_at)}</div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={()=>toggleApprove(u)} className="text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700">Approve</button>
                    <button onClick={()=>removeUser(u)} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 font-semibold hover:bg-red-200">Reject</button>
                  </div>
                </div>
              </div>
            ); })}
          </div>
        </div>
      )}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/>
        <input className="input pl-9" placeholder="Search users…" value={q} onChange={e=>setQ(e.target.value)}/>
      </div>
      <div className="space-y-2">{filtered.map(u => {
        const m = meta[u.id];
        return (
        <div key={u.id} className="card">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-semibold">{u.display_name || u.id.slice(0,8)}</div>
              <div className="text-xs text-gray-500">{u.role}{u.suspended?' · suspended':''}{!u.approved?' · pending approval':''}</div>
              {m?.email && <div className="text-xs text-gray-500">{m.email}</div>}
            </div>
            <select value={u.role} onChange={e=>setRole(u, e.target.value as any)} className="text-xs border rounded px-2 py-1">
              <option value="participant">participant</option>
              <option value="educator">educator</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="text-xs text-gray-600 mt-2 grid grid-cols-2 gap-x-2">
            <div><span className="text-gray-400">Registered:</span> {fmt(m?.created_at || u.created_at)}</div>
            <div><span className="text-gray-400">Last login:</span> {fmt(m?.last_sign_in_at)}</div>
          </div>
          <div className="flex gap-2 mt-2 flex-wrap">
            <button onClick={()=>toggleSuspend(u)} className="text-xs px-2 py-1 rounded bg-gray-100">{u.suspended ? 'Unsuspend' : 'Suspend'}</button>
            {!u.approved && <button onClick={()=>toggleApprove(u)} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Approve</button>}
            <button onClick={()=>removeUser(u)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Remove</button>
          </div>
        </div>
      );})}</div>
    </Shell>
  );
}
