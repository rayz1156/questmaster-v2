"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, HelpCircle } from "lucide-react";
import { getSession, clearSession } from "@/lib/session";
import type { User, Profile } from "@/lib/types";
import { getMyProfile } from "@/lib/data";

type Tab = { href: string; label: string; icon?: React.ReactNode };

export default function Shell({ tabs, children }: { tabs: Tab[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    const apply = (u: User | null) => {
      if (cancelled) return;
      resolved = true;
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
        getMyProfile().then((p) => {
          if (!cancelled) setProfile(p);
        });
      }
    };
    const initial = getSession();
    if (initial) apply(initial);
    else {
      // Wait briefly for Supabase async session hydration before redirecting
      import("@/lib/supabase")
        .then(({ supabase }) => supabase.auth.getUser())
        .then(() => {
          if (!resolved) apply(getSession());
        })
        .catch(() => {
          if (!resolved) apply(null);
        });
      setTimeout(() => {
        if (!resolved) apply(getSession());
      }, 1500);
    }
    const onAuth = () => {
      apply(getSession());
    };
    window.addEventListener("qm-auth", onAuth);
    window.addEventListener("qm-brand", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("qm-auth", onAuth);
      window.removeEventListener("qm-brand", onAuth);
    };
  }, [router]);
  if (!user) return null;
  const logoUrl = profile?.logo_url || null;
  const onLogout = () => {
    clearSession();
    router.replace("/login");
  };

  // ---------- Brand block (re-used in mobile header + desktop sidebar) ----------
  const Brand = ({ desktop = false }: { desktop?: boolean }) => (
    <div className={`flex items-center gap-3 ${desktop ? "" : ""}`}>
      {logoUrl ? (
        <img src={logoUrl} alt="Logo" className="w-10 h-10 rounded-lg object-contain bg-white/90 p-1" />
      ) : (
        <img src="/logo-mark.svg" alt="Kuizen" className="w-10 h-10 rounded-lg" />
      )}
      <div className="min-w-0">
        <div className="font-bold text-lg leading-tight truncate">Kuizen</div>
        <div className="text-xs opacity-90 truncate">
          {user.display_name} · {user.role}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* ============ DESKTOP SIDEBAR (lg+) ============ */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 xl:w-72 lg:fixed lg:inset-y-0 lg:left-0 bg-brand-gradient text-white shadow-xl">
        <div className="p-5 border-b border-white/10">
          <Brand desktop />
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname?.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition ${
                  active
                    ? "bg-white text-brand-purple shadow-sm"
                    : "text-white/90 hover:bg-white/10"
                }`}
              >
                <span className={active ? "text-brand-purple" : "text-white"}>{t.icon}</span>
                <span>{t.label}</span>
              </Link>
            );
          })}
                <Link
          href="/help"
          className={`flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium transition mt-2 ${
            pathname === "/help" || pathname?.startsWith("/help/")
              ? "bg-white text-brand-purple shadow-sm"
              : "text-white/90 hover:bg-white/10"
          }`}
        >
          <span className={pathname === "/help" ? "text-brand-purple" : "text-white"}><HelpCircle className="w-5 h-5" /></span>
          <span>Help</span>
        </Link>
</nav>
        <div className="p-3 border-t border-white/10">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-base font-medium text-white/90 hover:bg-white/10 transition"
          >
            <LogOut className="w-5 h-5" /> Sign out
          </button>
          <div className="text-[11px] text-white/60 text-center mt-3">
            <span className="font-semibold">UPSI · AFK · Veltrix</span>
          </div>
        </div>
      </aside>

      {/* ============ MAIN COLUMN ============ */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64 xl:ml-72">
        {/* ---- Mobile header (hidden on lg+) ---- */}
        <header className="lg:hidden bg-brand-gradient text-white p-5 rounded-b-3xl flex items-center justify-between">
          <Brand />
          <button onClick={onLogout} className="opacity-90 hover:opacity-100" aria-label="Sign out">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-10 lg:py-8 pb-24 lg:pb-10">
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </main>

        <footer className="hidden lg:block text-center text-xs text-gray-400 py-4">
          <span className="font-semibold text-gray-500">UPSI · AFK · Veltrix</span>
        </footer>

        {/* ---- Mobile bottom tab bar (hidden on lg+) ---- */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t flex justify-around py-2 z-30">
          {tabs.map((t) => {
            const active = pathname === t.href || pathname?.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center text-xs px-2 py-1 ${
                  active ? "text-brand-purple font-semibold" : "text-gray-500"
                }`}
              >
                {t.icon}
                {t.label}
              </Link>
            );
          })}
                    <Link
              key="__help"
              href="/help"
              className={`flex flex-col items-center text-xs px-2 py-1 ${
                pathname === "/help" ? "text-brand-purple font-semibold" : "text-gray-500"
              }`}
            >
              <HelpCircle className="w-5 h-5" />
              Help
            </Link>
</nav>
      </div>
    </div>
  );
}
