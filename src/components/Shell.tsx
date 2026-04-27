"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Trophy } from "lucide-react";
import { getSession, clearSession } from "@/lib/session";
import { User, Profile } from "@/lib/types";
import { getMyProfile } from "@/lib/data";

export default function Shell({ tabs, children }: { tabs: { href: string; label: string; icon?: React.ReactNode }[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    const apply = (u: User | null) => { if (cancelled) return; resolved = true; if (!u) { router.replace("/login"); } else { setUser(u); getMyProfile().then(p => { if (!cancelled) setProfile(p); }); } };
    const initial = getSession();
    if (initial) apply(initial);
    else {
      // Wait briefly for Supabase async session hydration before redirecting
      import("@/lib/supabase").then(({ supabase }) => supabase.auth.getUser()).then(() => { if (!resolved) apply(getSession()); }).catch(() => { if (!resolved) apply(null); });
      setTimeout(() => { if (!resolved) apply(getSession()); }, 1500);
    }
    const onAuth = () => { apply(getSession()); };
    window.addEventListener('qm-auth', onAuth);
    window.addEventListener('qm-brand', onAuth);
    return () => { cancelled = true; window.removeEventListener('qm-auth', onAuth); window.removeEventListener('qm-brand', onAuth); };
  }, [router]);
  if (!user) return null;
  const logoUrl = profile?.logo_url || null;
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-24 flex flex-col">
      <header className="bg-brand-gradient text-white p-5 rounded-b-3xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white/90 p-1" />
          ) : (
            <Trophy className="w-6 h-6" />
          )}
          <div>
            <div className="font-bold text-lg">QuestMaster</div>
            <div className="text-xs opacity-90">{user.display_name} · {user.role}</div>
          </div>
        </div>
        <button onClick={() => { clearSession(); router.replace("/login"); }} className="opacity-90 hover:opacity-100">
          <LogOut className="w-5 h-5" />
        </button>
      </header>
      <main className="p-4 flex-1">{children}</main>
      <footer className="text-center text-[11px] text-gray-400 py-3 px-4">
        Powered by <span className="font-semibold text-gray-500">Airiz Intelligence</span>
      </footer>
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t flex justify-around py-2">
        {tabs.map((t) => {
          const active = pathname === t.href;
          return (
            <Link key={t.href} href={t.href} className={`flex flex-col items-center text-xs px-2 py-1 ${active ? "text-brand-purple font-semibold" : "text-gray-500"}`}>
              {t.icon}
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
