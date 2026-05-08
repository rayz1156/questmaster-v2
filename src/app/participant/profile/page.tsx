"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Compass, Trophy, User as UserIcon, LogOut, Save, Users, Trash2, AlertTriangle} from "lucide-react";
import Shell from "@/components/Shell";
import { useSession, signOut } from "@/lib/session";
import { getMyProfile, updateMyDisplayName, updateMyEmail, updateMyPassword, softDeleteMyAccount, type Profile } from "@/lib/data";
import { supabase } from "@/lib/supabase";
const tabs = [
  { href: '/participant/home', label: 'Home', icon: <Home className="w-5 h-5" /> },
  { href: '/participant/activities', label: 'Activities', icon: <Compass className="w-5 h-5" /> },
  { href: '/participant/teams', label: 'Teams', icon: <Users className="w-5 h-5" /> },
  { href: '/participant/rankings', label: 'Ranking', icon: <Trophy className="w-5 h-5" /> },
  { href: '/participant/profile', label: 'Profile', icon: <UserIcon className="w-5 h-5" /> },
];
export default function Page() {
  const { user } = useSession('participant');
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();
  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [delConfirmText, setDelConfirmText] = useState("");
  const [delBusy, setDelBusy] = useState(false);
  async function deleteAccount() {
    if (delConfirmText.trim() !== "DELETE") { setMsg("Type DELETE to confirm"); return; }
    setDelBusy(true);
    try {
      await softDeleteMyAccount();
      router.replace("/login");
    } catch(e:any) { setMsg(e.message || "Failed to delete account"); setDelBusy(false); }
  }
  useEffect(() => { if (!user) return; getMyProfile().then(pr => { setP(pr); setName(pr?.display_name||""); }); supabase.auth.getUser().then(({data})=>setEmail(data.user?.email||"")); }, [user]);
  async function saveName() { try { await updateMyDisplayName(name); setMsg("Username updated"); } catch(e:any){ setMsg(e.message);} }
  async function saveEmail() { try { await updateMyEmail(email); setMsg("Email update requested - check inbox"); } catch(e:any){ setMsg(e.message);} }
  async function savePw() { if(pw.length<6){setMsg("Password must be 6+ chars");return;} try { await updateMyPassword(pw); setPw(""); setMsg("Password updated"); } catch(e:any){ setMsg(e.message);} }
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Profile</h2>
      <div className="card mb-3">
        <div className="text-xs text-gray-500">Role</div><div>{p?.role}</div>
      </div>
      {msg && <div className="card mb-3 text-sm text-blue-700 bg-blue-50">{msg}</div>}
      <div className="card mb-3">
        <label className="text-xs text-gray-500">Username</label>
        <input className="w-full border rounded-lg px-3 py-2 mt-1" value={name} onChange={e=>setName(e.target.value)} />
        <button onClick={saveName} className="mt-2 px-3 py-2 rounded-xl bg-black text-white text-sm flex items-center gap-1"><Save className="w-4 h-4"/>Save username</button>
      </div>
      <div className="card mb-3">
        <label className="text-xs text-gray-500">Email</label>
        <input type="email" className="w-full border rounded-lg px-3 py-2 mt-1" value={email} onChange={e=>setEmail(e.target.value)} />
        <button onClick={saveEmail} className="mt-2 px-3 py-2 rounded-xl bg-black text-white text-sm flex items-center gap-1"><Save className="w-4 h-4"/>Save email</button>
      </div>
      <div className="card mb-3">
        <label className="text-xs text-gray-500">New password</label>
        <input type="password" className="w-full border rounded-lg px-3 py-2 mt-1" value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 6 characters" />
        <button onClick={savePw} className="mt-2 px-3 py-2 rounded-xl bg-black text-white text-sm flex items-center gap-1"><Save className="w-4 h-4"/>Change password</button>
      </div>

              <div className="card mb-3 border border-red-200 bg-red-50">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-1"><AlertTriangle className="w-4 h-4"/>Danger zone</div>
                <div className="text-xs text-red-700/80 mb-2">Deleting your account will deactivate it. You will be signed out and lose access. Contact an administrator if you change your mind.</div>
                {!showDelConfirm ? (
                  <button onClick={()=>{setShowDelConfirm(true); setMsg("");}} className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm flex items-center gap-1"><Trash2 className="w-4 h-4"/>Delete account</button>
                ) : (
                  <div>
                    <label className="text-xs text-red-700">Type <b>DELETE</b> to confirm</label>
                    <input value={delConfirmText} onChange={e=>setDelConfirmText(e.target.value)} className="w-full border border-red-300 rounded-lg px-3 py-2 mt-1" placeholder="DELETE" />
                    <div className="flex gap-2 mt-2">
                      <button disabled={delBusy} onClick={deleteAccount} className="px-3 py-2 rounded-xl bg-red-600 text-white text-sm flex items-center gap-1 disabled:opacity-50"><Trash2 className="w-4 h-4"/>{delBusy ? "Deleting..." : "Confirm delete"}</button>
                      <button disabled={delBusy} onClick={()=>{setShowDelConfirm(false); setDelConfirmText("");}} className="px-3 py-2 rounded-xl bg-white border text-sm">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
      <button onClick={()=>signOut()} className="mt-2 w-full py-2 rounded-xl bg-red-50 text-red-700 flex items-center justify-center gap-1"><LogOut className="w-4 h-4"/>Sign out</button>
    </Shell>
  );
}
