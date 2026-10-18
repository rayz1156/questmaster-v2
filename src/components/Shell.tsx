"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, HelpCircle, Menu, X } from "lucide-react";
import { getSession, clearSession } from "@/lib/session";
import type { User, Profile } from "@/lib/types";
import { getMyProfile } from "@/lib/data";
import { teks } from "@/i18n/teks";

type Tab = { href: string; label: string; icon?: React.ReactNode };

// Gaya bar sisi gelap StafKita (290px)
const SIDEBAR_CLASSES = "w-[290px] shrink-0 bg-[#101924] text-[#6e82a5]";

export default function Shell({ tabs, children }: { tabs: Tab[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
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
      // Tunggu sebentar untuk penghidratan sesi Supabase asinkron sebelum ubah hala
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
  // Tutup laci bila laluan berubah
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  if (!user) return null;
  const logoUrl = profile?.logo_url || null;
  const onLogout = () => {
    clearSession();
    router.replace("/login");
  };

  // ---------- Blok jenama (digunakan dalam kepala dan bar sisi) ----------
  const Brand = () => (
    <div className="flex items-center gap-3 min-w-0">
      {logoUrl ? (
        <img src={logoUrl} alt={teks.shell.logo} className="w-10 h-10 rounded object-contain bg-white/90 p-1" />
      ) : (
        <span className="w-10 h-10 rounded bg-[#6576ff] text-white flex items-center justify-center font-bold font-[Nunito,var(--font-nunito),sans-serif]">{teks.jenama.monogram}</span>
      )}
      <div className="min-w-0">
        <div className="font-bold text-lg leading-tight truncate text-white" style={{ fontFamily: "Nunito, var(--font-nunito), sans-serif" }}>
          {teks.jenama.nama}
        </div>
        <div className="text-xs text-[#6e82a5] truncate">
          {user.display_name} · {user.role}
        </div>
      </div>
    </div>
  );

  // ---------- Item navigasi ----------
  const navItem = (t: Tab, active: boolean) => (
    <Link
      key={t.href}
      href={t.href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition ${
        active ? "text-[#6576ff] bg-[#6576ff]/10" : "text-[#6e82a5] hover:text-white hover:bg-[#203247]"
      }`}
    >
      <span className={active ? "text-[#6576ff]" : "text-[#6e82a5]"}>{t.icon}</span>
      <span>{t.label}</span>
    </Link>
  );

  const helpActive = pathname === "/help" || pathname?.startsWith("/help/");
  const helpItem = (
    <Link
      href="/help"
      className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition ${
        helpActive ? "text-[#6576ff] bg-[#6576ff]/10" : "text-[#6e82a5] hover:text-white hover:bg-[#203247]"
      }`}
    >
      <span className={helpActive ? "text-[#6576ff]" : "text-[#6e82a5]"}><HelpCircle className="w-5 h-5" /></span>
      <span>{teks.shell.bantuan}</span>
    </Link>
  );
  const logoutItem = (
    <button
      onClick={onLogout}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium text-[#6e82a5] hover:text-white hover:bg-[#203247] transition"
    >
      <LogOut className="w-5 h-5" />
      <span>{teks.shell.logKeluar}</span>
    </button>
  );

  // ---------- Kandungan bar sisi ----------
  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-[#203247]">
        <Brand />
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {tabs.map((t) => navItem(t, pathname === t.href || pathname?.startsWith(t.href + "/")))}
        {helpItem}
      </nav>
      <div className="p-3 border-t border-[#203247]">{logoutItem}</div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex text-[#526484]">
      {/* ============ BAR SISI DESKTOP (1024px+) ============ */}
      <aside className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 ${SIDEBAR_CLASSES}`}>
        <SidebarContent />
      </aside>

      {/* ============ LACI MOBILE (<1024px) ============ */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside className={`relative flex flex-col h-full ${SIDEBAR_CLASSES} shadow-elevated`}>
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-4 text-[#6e82a5] hover:text-white"
              aria-label={teks.shell.tutupMenu}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ============ LAJUR UTAMA ============ */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[290px]">
        {/* ---- Kepala putih 65px ---- */}
        <header className="h-[65px] shrink-0 bg-white border-b border-[#e5e9f2] flex items-center justify-between px-4 lg:px-8 sticky top-0 z-40">
          <div className="lg:hidden flex items-center gap-3">
            <button onClick={() => setDrawerOpen(true)} className="p-2 text-[#526484]" aria-label={teks.shell.bukaMenu}>
              <Menu className="w-6 h-6" />
            </button>
            <span className="font-bold text-lg" style={{ fontFamily: "Nunito, var(--font-nunito), sans-serif" }}>
              {teks.jenama.bahagian1} <span className="text-[#6576ff]">{teks.jenama.bahagian2}</span>
            </span>
          </div>
          <div className="hidden lg:block text-sm font-semibold text-[#364a63]">
            {teks.jenama.nama}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-[#6e82a5] truncate max-w-[40vw]">{user.display_name}</span>
            <button onClick={onLogout} className="p-2 text-[#6e82a5] hover:text-[#e85347] transition" aria-label={teks.shell.logKeluar}>
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-10 lg:py-8">
          <div className="max-w-6xl mx-auto w-full">{children}</div>
        </main>

        <footer className="text-center text-xs text-[#8094ae] py-4">
          <span>&copy; {teks.jenama.nama}</span>
        </footer>
      </div>
    </div>
  );
}
