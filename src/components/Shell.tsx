"use client";

/**
 * Shell aplikasi, semakan September 2026.
 *
 * Bar sisi gradien digantikan dengan satu bar atas setinggi 72px: wordmark
 * di kiri, tiga destinasi di tengah, Help dan avatar di kanan. Sebab: bar
 * sisi mengambil seperempat skrin untuk memaparkan tujuh pautan yang jarang
 * ditukar, sedangkan kandungan kelas memerlukan lebar itu.
 *
 * Tandatangan komponen ini TIDAK berubah. Ia masih menerima `tabs`, jadi
 * setiap halaman sedia ada yang memanggil <Shell tabs={EDU_TABS}> terus
 * mendapat rupa baharu tanpa disunting. Tiada ciri hilang semasa peralihan.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, HelpCircle, ChevronDown, User as UserIcon } from "lucide-react";
import { getSession, clearSession } from "@/lib/session";
import { LogoMark } from "@/components/Logo";
import type { User, Profile } from "@/lib/types";
import { getMyProfile } from "@/lib/data";

type Tab = {
  href: string;
  label: string;
  icon?: React.ReactNode;
  /** Awalan laluan tambahan yang masih dikira destinasi yang sama. */
  match?: string[];
};

/** Huruf awal untuk avatar. Tiada gambar rekaan. */
function initials(name?: string | null): string {
  const parts = String(name || "")
    .replace(/^(Dr|Dr\.|Prof|Prof\.|Mr|Ms|Mrs)\s+/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Shell({ tabs, children }: { tabs: Tab[]; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    const onAuth = () => apply(getSession());
    window.addEventListener("qm-auth", onAuth);
    window.addEventListener("qm-brand", onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("qm-auth", onAuth);
      window.removeEventListener("qm-brand", onAuth);
    };
  }, [router]);

  useEffect(() => {
    if (!menuOpen) return;
    const onAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [menuOpen]);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  if (!user) return null;

  const onLogout = () => {
    clearSession();
    router.replace("/login");
  };

  const mark = initials(profile?.display_name || user.display_name);
  const here = (href: string) => pathname === href || pathname?.startsWith(href + "/");
  const active = (href: string) => here(href);
  const activeTab = (t: Tab) => here(t.href) || (t.match || []).some(here);

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      {/* ===== Bar atas 72px ===== */}
      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-hairline">
        <div className="mx-auto max-w-shell px-5 h-[72px] flex items-center gap-6">
          <Link href="/educator/classes" className="shrink-0 inline-flex items-center gap-2.5" aria-label="Kuizen">
            {profile?.logo_url ? (
              <>
                {/* Logo tersuai pendidik, seperti shell lama. Tanda Kuizen kekal
                    di sebelahnya supaya pengguna masih tahu platform apa ini. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={profile.logo_url} alt="" className="h-7 w-auto max-w-[120px] object-contain" />
                <span className="w-px h-5 bg-hairline" />
                <LogoMark size={26} />
              </>
            ) : (
              <>
                <LogoMark size={28} />
                <span className="hidden sm:inline text-[19px] font-semibold tracking-tight text-ink">Kuizen</span>
              </>
            )}
          </Link>

          {/* Destinasi utama, di tengah pada skrin lebar. */}
          <nav className="hidden md:flex items-center gap-1 mx-auto h-full">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`relative h-full flex items-center px-3 text-[15px] transition ${
                  activeTab(t)
                    ? "text-brand-purple font-semibold"
                    : "text-ink-muted hover:text-ink font-medium"
                }`}
              >
                {t.label}
                {activeTab(t) && (
                  <span className="absolute left-3 right-3 bottom-0 h-[2px] bg-brand-purple rounded-full" />
                )}
              </Link>
            ))}
          </nav>

          <div className="ml-auto md:ml-0 flex items-center gap-1 shrink-0">
            <Link
              href="/help"
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition ${
                active("/help") ? "text-brand-purple font-semibold" : "text-ink-muted hover:text-ink"
              }`}
            >
              <HelpCircle className="w-4 h-4" /> Help
            </Link>

            <span className="hidden sm:block w-px h-5 bg-hairline mx-1" />

            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl hover:bg-[#F4F4F6] transition"
              >
                <span className="w-9 h-9 rounded-full bg-[#EAE6FC] text-brand-purple text-[13px] font-semibold flex items-center justify-center">
                  {mark}
                </span>
                <ChevronDown className="w-4 h-4 text-ink-faint" />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 bg-white rounded-2xl border border-hairline shadow-raised py-1.5 z-50"
                >
                  <div className="px-3.5 py-2.5">
                    <div className="text-sm font-semibold text-ink truncate">
                      {profile?.display_name || user.display_name}
                    </div>
                    <div className="text-xs text-ink-faint truncate">{user.role}</div>
                  </div>
                  <div className="h-px bg-hairline my-1" />
                  <Link
                    href="/educator/profile"
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-[#F7F7F9] transition"
                  >
                    <UserIcon className="w-4 h-4 text-ink-faint" /> Account settings
                  </Link>
                  <Link
                    href="/help"
                    className="sm:hidden flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-[#F7F7F9] transition"
                  >
                    <HelpCircle className="w-4 h-4 text-ink-faint" /> Help
                  </Link>
                  <div className="h-px bg-hairline my-1" />
                  <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-[#F7F7F9] transition"
                  >
                    <LogOut className="w-4 h-4 text-ink-faint" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigasi telefon: baris tatal, bukan bar bawah yang menutup kandungan. */}
        <nav className="md:hidden flex items-center gap-1 px-4 pb-2 overflow-x-auto">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition ${
                activeTab(t)
                  ? "bg-[#EAE6FC] text-brand-purple font-semibold"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1 w-full">
        <div className="mx-auto max-w-shell px-5 py-8">{children}</div>
      </main>

      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-shell px-5 py-5 text-center text-xs text-ink-faint tracking-wide">
          UPSI &nbsp;·&nbsp; AFK &nbsp;·&nbsp; Veltrix
        </div>
      </footer>
    </div>
  );
}
