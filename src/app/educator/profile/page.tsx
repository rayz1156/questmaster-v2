"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import { useSession, signOut } from "@/lib/session";
import { getMyProfile, updateMyDisplayName, updateMyEmail, updateMyPassword, type Profile } from "@/lib/data";
import { supabase } from "@/lib/supabase";
import { GraduationCap, ListChecks, Users, BarChart3, User as UserIcon, LogOut, Save } from "lucide-react";
const tabs = [
  { href: "/educator/classes", label: "Classes", icon: <GraduationCap className="w-5 h-5"/> },
  { href: "/educator/activities", label: "Activities", icon: <ListChecks className="w-5 h-5"/> },
  { href: "/educator/teams", label: "Teams", icon: <Users className="w-5 h-5"/> },
  { href: "/educator/rankings", label: "Rankings", icon: <BarChart3 className="w-5 h-5"/> },
  { href: "/educator/profile", label: "Profile", icon: <UserIcon className="w-5 h-5"/> },
];
export default function Page() {
  const { user } = useSession('educator');
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!user) return; getMyProfile().then(pr => { setP(pr); setName(pr?.display_name||""); }); supabase.auth.getUser().then(({data})=>setEmail(data.user?.email||"")); }, [user]);
  async function saveName() { try { await updateMyDisplayName(name); setMsg("Username updated"); } catch(e:any){ setMsg(e.message);} }
  async function saveEmail() { try { await updateMyEmail(email); setMsg("Email update requested - check inbox"); } catch(e:any){ setMsg(e.message);} }
  async function savePw() { if(pw.length<6){setMsg("Password must be 6+ chars");return;} try { await updateMyPassword(pw); setPw(""); setMsg("Password updated"); } catch(e:any){ setMsg(e.message);} }
  return (
    <Shell tabs={tabs}>
      <h2 className="font-bold text-lg mb-3">Profile</h2>
      <div className="card mb-3"><div className="text-xs text-gray-500">Role</div><div>{p?.role}</div></div>
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
      <button onClick={()=>signOut()} className="mt-2 w-full py-2 rounded-xl bg-red-50 text-red-700 flex items-center justify-center gap-1"><LogOut className="w-4 h-4"/>Sign out</button>
    </Shell>
  );
}
