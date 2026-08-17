"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListProfiles, adminUpdateProfile, adminListUsersMeta, adminDeleteUser, logAudit, adminSetClassLimits, adminListEducatorClasses, adminListParticipantClasses, type Profile, type UserMeta } from "@/lib/data";
import { Search } from "lucide-react";
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { supabase } from '@/lib/supabaseClient';

function fmt(d: string | null | undefined) {
  if (!d) return "Never";
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}

export default function Page() {
  const [users, setUsers] = useState<Profile[]>([]);
  const confirm = useConfirm();
  const [meta, setMeta] = useState<Record<string, UserMeta>>({});
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<'all'|'participant'|'educator'|'admin'>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [classCache, setClassCache] = useState<Record<string, any>>({});
  const [limitDraft, setLimitDraft] = useState<Record<string, { owned: string; coed: string }>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [alsoApprove, setAlsoApprove] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const reload = async () => {
    setUsers(await adminListProfiles());
    setMeta(await adminListUsersMeta());
  };
  useEffect(() => { reload(); }, []);
  const filtered = users.filter(u => (roleFilter === "all" || u.role === roleFilter)).filter(u => !q || (u.display_name || "").toLowerCase().includes(q.toLowerCase()) || u.role.includes(q.toLowerCase()) || (meta[u.id]?.email || "").toLowerCase().includes(q.toLowerCase()));
  const unverified = filtered.filter(u => { const m = meta[u.id]; return m && m.email && !m.email_confirmed_at; });
  const toggleSelected = (id: string) => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const setRole = async (u: Profile, role: 'participant'|'educator'|'admin'|'superadmin') => {
    await adminUpdateProfile(u.id, { role }); await logAudit('role_change', 'profile', u.id, { from: u.role, to: role }); reload();
  };
  const toggleExpand = async (u: Profile) => {
    if (expanded === u.id) { setExpanded(null); return; }
    setExpanded(u.id);
    if (!classCache[u.id]) {
      try {
        if (u.role === 'participant') {
          const joined = await adminListParticipantClasses(u.id);
          setClassCache(c => ({ ...c, [u.id]: { joined } }));
        } else {
          const { owned, coEducator } = await adminListEducatorClasses(u.id);
          setClassCache(c => ({ ...c, [u.id]: { owned, coEducator } }));
        }
      } catch (e: any) { alert('Failed to load classes: ' + (e?.message || e)); }
    }
  };
  const saveLimits = async (u: Profile) => {
    const d = limitDraft[u.id] || { owned: String(u.max_classes_owned ?? ''), coed: String(u.max_classes_as_coeducator ?? '') };
    const parse = (v: string) => v.trim() === '' ? null : Math.max(0, parseInt(v, 10) || 0);
    try {
      await adminSetClassLimits(u.id, parse(d.owned), parse(d.coed));
      await logAudit('set_class_limits', 'profile', u.id, { owned: parse(d.owned), coed: parse(d.coed) });
      reload();
      alert('Class limits updated.');
    } catch (e: any) { alert('Failed to save limits: ' + (e?.message || e)); }
  };
  const toggleSuspend = async (u: Profile) => {
    await adminUpdateProfile(u.id, { suspended: !u.suspended });
    await logAudit(u.suspended ? 'unsuspend' : 'suspend', 'profile', u.id); reload();
  };
  const toggleApprove = async (u: Profile) => {
    await adminUpdateProfile(u.id, { approved: !u.approved });
    await logAudit(u.approved ? 'unapprove' : 'approve', 'profile', u.id); reload();
  };
  const toggleCapability = async (u: Profile, key: 'can_upload_files' | 'can_upload_videos') => {
    const next = !((u as any)[key]);
    await adminUpdateProfile(u.id, { [key]: next } as any);
    await logAudit(next ? 'enable_capability' : 'disable_capability', 'profile', u.id, { capability: key });
    reload();
  };
  const removeUser = async (u: Profile) => {
    if (!(await confirm({ title: `Permanently delete user "${u.display_name || u.id.slice(0,8)}"? This cannot be undone.`, tone: 'danger' }))) return;
    try {
      await adminDeleteUser(u.id);
      await logAudit('delete_user', 'profile', u.id);
      reload();
    } catch (e: any) {
      alert('Delete failed: ' + (e?.message || e));
    }
  };
  const resendVerification = async (u: Profile) => {
    const email = meta[u.id]?.email;
    if (!email) { alert('No email on file for this user.'); return; }
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) throw error;
      alert('Verification email resent to ' + email);
    } catch (e: any) {
      alert('Resend failed: ' + (e?.message || e));
    }
  };
  /**
   * Menandakan emel sah tanpa pengguna mengklik pautan.
   *
   * Kerja sebenar berlaku di /api/admin/users/verify dengan service_role.
   * Klien sengaja tidak boleh melakukannya sendiri: memintas pengesahan emel
   * ialah keupayaan admin, bukan keupayaan pelayar.
   */
  const verifyEmails = async (ids: string[]) => {
    if (ids.length === 0) return;
    const siapa = ids.length > 1 ? `${ids.length} pengguna` : 'pengguna ini';
    if (!(await confirm({ title: `Tandakan emel ${siapa} sebagai sah${alsoApprove ? ', dan luluskan sekali' : ''}?` }))) return;
    setVerifying(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/users/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ userIds: ids, alsoApprove }),
      });
      const out = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(out?.error || `HTTP ${res.status}`);
      const gagal = (out.results || []).filter((r: any) => !r.ok);
      alert(
        `Disahkan ${out.ok}/${out.total}.` +
        (gagal.length ? '\nGagal:\n' + gagal.map((f: any) => `${String(f.id).slice(0, 8)}: ${f.error}`).join('\n') : '')
      );
      setSelected(new Set());
      reload();
    } catch (e: any) {
      alert('Verify failed: ' + (e?.message || e));
    } finally {
      setVerifying(false);
    }
  };
  const exportCsv = () => {
    const esc = (v:any) => { const str = v==null?"":String(v); return /[",\n]/.test(str) ? '"'+str.replace(/"/g,'""')+'"' : str; };
    const headers = ["Name","Username","Email","Role","Email verified","Suspended","Approved","Registered"];
    const rows = users.map(u => { const m = meta[u.id]; return [
      u.display_name || "", (u as any).username || "", m?.email || "", u.role,
      m?.email_confirmed_at ? "Yes" : "No", u.suspended ? "Yes" : "No", u.approved ? "Yes" : "No",
      fmt(m?.created_at || u.created_at)
    ].map(esc).join(","); });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kuizen-users-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
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
      <div className="flex items-center gap-2 mb-3"><div className="relative flex-1">
        <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/>
        <input className="input pl-9" placeholder="Search users…" value={q} onChange={e=>setQ(e.target.value)}/></div>
        <select value={roleFilter} onChange={e=>setRoleFilter(e.target.value as any)} className="text-sm border rounded px-2 py-2">
          <option value="all">All roles</option>
          <option value="participant">Participant</option>
          <option value="educator">Educator</option>
          <option value="admin">Admin</option>
        </select><div>
      </div><button onClick={exportCsv} className="text-xs px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 whitespace-nowrap">Export CSV</button></div>
      {unverified.length > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <span className="font-semibold text-amber-900">{unverified.length} belum sahkan emel</span>
          <button onClick={()=>setSelected(new Set(unverified.map(x=>x.id)))} className="px-2 py-1 rounded bg-white border">Pilih semua</button>
          {selected.size > 0 && <button onClick={()=>setSelected(new Set())} className="px-2 py-1 rounded bg-white border">Kosongkan</button>}
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={alsoApprove} onChange={e=>setAlsoApprove(e.target.checked)} />
            Juga luluskan
          </label>
          <button disabled={selected.size === 0 || verifying} onClick={()=>verifyEmails(Array.from(selected))} className="px-3 py-1.5 rounded-lg bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-40">
            {verifying ? 'Sedang sahkan...' : `Sahkan yang dipilih (${selected.size})`}
          </button>
        </div>
      )}
      <div className="space-y-2">{filtered.map(u => {
        const m = meta[u.id];
        return (
        <div key={u.id} className="card">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-semibold">{u.display_name || u.id.slice(0,8)}</div>
              <div className="text-xs text-gray-500">{u.role}{u.suspended?' · suspended':''}{!u.approved?' · pending approval':''}</div>
              {m?.email && <div className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">{m.email}{m.email_confirmed_at ? <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-semibold">✓ Verified</span> : <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-semibold">Unverified</span>}</div>}
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
            {m && !m.email_confirmed_at && m.email && <button onClick={()=>resendVerification(u)} className="text-xs px-2 py-1 rounded bg-gray-100">Resend verification</button>}
            {m && !m.email_confirmed_at && m.email && <button onClick={()=>verifyEmails([u.id])} disabled={verifying} className="text-xs px-2 py-1 rounded bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-40">Sahkan emel</button>}
            {m && !m.email_confirmed_at && m.email && <label className="text-xs px-2 py-1 rounded bg-gray-100 flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={selected.has(u.id)} onChange={()=>toggleSelected(u.id)} />Pilih</label>}
          </div>
          {(u.role === 'educator' || u.role === 'admin') && (
            <div className="mt-2 flex items-end gap-2 flex-wrap text-xs">
              <label className="flex flex-col">Max classes (own)
                <input type="number" min={0} className="border rounded px-2 py-1 w-24"
                  value={(limitDraft[u.id]?.owned) ?? String(u.max_classes_owned ?? '')}
                  onChange={e=>setLimitDraft(d=>({ ...d, [u.id]: { owned: e.target.value, coed: d[u.id]?.coed ?? String(u.max_classes_as_coeducator ?? '') } }))}/>
              </label>
              <label className="flex flex-col">Max as co-educator
                <input type="number" min={0} className="border rounded px-2 py-1 w-24"
                  value={(limitDraft[u.id]?.coed) ?? String(u.max_classes_as_coeducator ?? '')}
                  onChange={e=>setLimitDraft(d=>({ ...d, [u.id]: { coed: e.target.value, owned: d[u.id]?.owned ?? String(u.max_classes_owned ?? '') } }))}/>
              </label>
              <button onClick={()=>saveLimits(u)} className="px-2 py-1 rounded bg-blue-100 text-blue-700">Save limits</button>
            </div>
          )}
          {(u.role === 'educator' || u.role === 'admin' || u.role === 'superadmin') && (
            <div className="mt-2 flex items-center gap-4 flex-wrap text-xs bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
              <span className="font-semibold text-violet-800">Upload permissions</span>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="accent-violet-600 w-4 h-4"
                  checked={!!(u as any).can_upload_files}
                  onChange={()=>toggleCapability(u, 'can_upload_files')} />
                Files (FileLu)
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" className="accent-violet-600 w-4 h-4"
                  checked={!!(u as any).can_upload_videos}
                  onChange={()=>toggleCapability(u, 'can_upload_videos')} />
                Videos (Bunny Stream)
              </label>
              {(u.role === 'admin' || u.role === 'superadmin') && <span className="text-violet-500">Admins always allowed</span>}
            </div>
          )}
          <button onClick={()=>toggleExpand(u)} className="text-xs px-2 py-1 rounded bg-gray-100 mt-2">
            {expanded === u.id ? 'Hide classes' : (u.role === 'participant' ? 'View joined classes' : 'View classes')}
          </button>
          {expanded === u.id && (
            <div className="mt-2 text-xs border-t pt-2">
              {!classCache[u.id] ? <div className="text-gray-500">Loading…</div> : (
                u.role === 'participant' ? (
                  (classCache[u.id].joined || []).length === 0
                    ? <div className="text-gray-500">No joined classes.</div>
                    : <div><div className="font-semibold mb-1">Joined classes ({classCache[u.id].joined.length})</div>
                        {classCache[u.id].joined.map((c:any)=>(
                          <div key={c.id} className="flex items-center gap-2 py-0.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{background:c.color||'#6366f1'}}/>
                            <span>{c.name}</span>
                            <span className="text-gray-400">· joined {fmt(c.joined_at)}{c.ended_at ? ' · ended' : ''}{c.is_archived ? ' · archived' : ''}</span>
                          </div>
                        ))}
                      </div>
                ) : (
                  <div className="space-y-2">
                    <div><div className="font-semibold mb-1">Created (owner) ({(classCache[u.id].owned||[]).length})</div>
                      {(classCache[u.id].owned||[]).length === 0 ? <div className="text-gray-500">None.</div> :
                        classCache[u.id].owned.map((c:any)=>(
                          <div key={c.id} className="flex items-center gap-2 py-0.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{background:c.color||'#6366f1'}}/>
                            <span>{c.name}</span>
                            <span className="text-gray-400">· {fmt(c.created_at)}{c.ended_at ? ' · ended' : ''}{c.is_archived ? ' · archived' : ''}</span>
                          </div>
                        ))}
                    </div>
                    <div><div className="font-semibold mb-1">Co-educator ({(classCache[u.id].coEducator||[]).length})</div>
                      {(classCache[u.id].coEducator||[]).length === 0 ? <div className="text-gray-500">None.</div> :
                        classCache[u.id].coEducator.map((c:any)=>(
                          <div key={c.id} className="flex items-center gap-2 py-0.5">
                            <span className="inline-block w-2 h-2 rounded-full" style={{background:c.color||'#6366f1'}}/>
                            <span>{c.name}</span>
                            <span className="text-gray-400">· {c.member_role || 'co-educator'}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      );})}</div>
    </Shell>
  );
}
