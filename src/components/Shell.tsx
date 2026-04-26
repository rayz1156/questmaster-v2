"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Trophy } from "lucide-react";
import { getSession, clearSession } from "@/lib/session";
import { User } from "@/lib/types";

export default function Shell({ tabs, children }: { tabs: { href: string; label: string; icon?: React.ReactNode }[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    const u = getSession();
    if (!u) router.replace("/login");
    else setUser(u);
  }, [router]);
  if (!user) return null;
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-20">
      <header className="bg-brand-gradient text-white p-5 rounded-b-3xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-6 h-6" />
          <div>
            <div className="font-bold text-lg">QuestMaster</div>
            <div className="text-xs opacity-90">{user.display_name} · {user.role}</div>
          </div>
        </div>
        <button onClick={() => { clearSession(); router.replace("/login"); }} className="opacity-90 hover:opacity-100">
          <LogOut className="w-5 h-5" />
        </button>
      </header>
      <main className="p-4">{children}</main>
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
