"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import { setSession } from "@/lib/session";
import { Role } from "@/lib/types";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const quick = (r: Role) => {
    setSession(r);
    router.push(`/${r}/${r === "admin" ? "overview" : r === "educator" ? "activities" : "home"}`);
  };
  return (
    <div className="min-h-screen bg-brand-gradient flex flex-col items-center px-6 pt-16 pb-10">
      <div className="flex flex-col items-center text-white mb-8">
        <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center mb-4">
          <Trophy className="w-10 h-10 text-yellow-300" />
        </div>
        <h1 className="text-3xl font-bold">QuestMaster</h1>
        <p className="opacity-90">Epic Quest Adventures</p>
      </div>
      <div className="card w-full max-w-md">
        <h2 className="text-2xl font-bold mb-1">Welcome back 👋</h2>
        <p className="text-gray-500 mb-5">Sign in to your account to continue</p>
        <label className="text-xs font-semibold text-gray-500">EMAIL ✉️</label>
        <input className="input mb-4" placeholder="you@example.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <label className="text-xs font-semibold text-gray-500">PASSWORD 🔒</label>
        <input type={show?"text":"password"} className="input" placeholder="••••••••" value={pass} onChange={(e)=>setPass(e.target.value)} />
        <button onClick={()=>setShow(s=>!s)} className="text-brand-purple text-sm font-semibold mt-2">{show?"Hide":"Show"} password</button>
        <button onClick={()=>quick("participant")} className="btn-primary w-full mt-4">Sign In →</button>
        <div className="mt-6">
          <div className="text-xs font-semibold text-gray-500 mb-2">QUICK DEMO LOGIN</div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={()=>quick("participant")} className="py-2 rounded-xl border border-brand-purple text-brand-purple text-sm font-semibold">Participant</button>
            <button onClick={()=>quick("educator")} className="py-2 rounded-xl border border-brand-purple text-brand-purple text-sm font-semibold">Educator</button>
            <button onClick={()=>quick("admin")} className="py-2 rounded-xl border border-brand-purple text-brand-purple text-sm font-semibold">Admin</button>
          </div>
        </div>
      </div>
    </div>
  );
}
