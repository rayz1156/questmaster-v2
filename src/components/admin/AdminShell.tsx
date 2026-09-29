'use client';

// AdminShell.tsx
// Shell ruang kerja admin (V2-011b). Admin datang untuk tiga perkara: tahu
// apa yang perlu perhatian, cari seseorang dengan pantas, dan bertindak
// dengan selamat. Bar sisi 240px senyap, bar atas 64px dengan breadcrumb,
// carian dan menu akaun; pada skrin kecil bar sisi menjadi laci.
//
// Kawalan akses di sini hanyalah UX: data sebenar tetap dilindungi RLS
// dan RPC di pelayan. Profil bukan admin/superadmin atau digantung
// dihantar ke '/' dan kandungan tidak dirender.

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Map,
  ShieldCheck,
  ScrollText,
  MessageSquare,
  Settings,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  Menu as MenuIcon,
  X,
  Search,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { getSession, clearSession } from '@/lib/session';
import { LogoMark } from '@/components/Logo';
import { initials } from '@/components/admin/ui';
import type { Profile, User } from '@/lib/types';
import { getMyProfile, adminListAllSubmissions } from '@/lib/data';
import { supabase } from '@/lib/supabaseClient';

export interface CrumbAdmin {
  label: string;
  href?: string;
}

/** Item bar sisi; `lencana` merujuk kiraan yang dimuat sekali. */
const NAV = [
  { href: '/admin/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/classes', label: 'Classes', icon: GraduationCap },
  { href: '/admin/hunts', label: 'Activities', icon: Map },
  { href: '/admin/moderation', label: 'Moderation', icon: ShieldCheck, lencana: 'moderasi' as const },
  { href: '/admin/audit', label: 'Audit', icon: ScrollText },
  { href: '/admin/feedback', label: 'Feedback', icon: MessageSquare, lencana: 'maklumbalas' as const },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminShell({
  title,
  crumbs,
  actions,
  children,
}: {
  title?: string;
  crumbs?: CrumbAdmin[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [laciOpen, setLaciOpen] = useState(false);
  const [lencana, setLencana] = useState<{ moderasi: number | null; maklumbalas: number | null }>({
    moderasi: null,
    maklumbalas: null,
  });
  const menuRef = useRef<HTMLDivElement | null>(null);
  const carianRef = useRef<HTMLInputElement | null>(null);
  const [carian, setCarian] = useState('');

  // ===== Sesi, mengikut corak Shell.tsx =====
  useEffect(() => {
    let cancelled = false;
    let resolved = false;
    const apply = (u: User | null) => {
      if (cancelled) return;
      resolved = true;
      if (!u) {
        router.replace('/login');
        return;
      }
      setUser(u);
      getMyProfile().then((p) => {
        if (!cancelled) setProfile(p);
      });
    };
    const initial = getSession();
    if (initial) apply(initial);
    else {
      import('@/lib/supabase')
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
    window.addEventListener('qm-auth', onAuth);
    return () => {
      cancelled = true;
      window.removeEventListener('qm-auth', onAuth);
    };
  }, [router]);

  // ===== Kawalan akses: bukan admin aktif -> '/' =====
  const dibenarkan =
    !!user &&
    !!profile &&
    (profile.role === 'admin' || profile.role === 'superadmin') &&
    !profile.suspended;

  useEffect(() => {
    if (!user || !profile) return;
    if (!dibenarkan) router.replace('/');
  }, [user, profile, dibenarkan, router]);

  // ===== Lencana kiraan, dimuat sekali sahaja =====
  useEffect(() => {
    if (!dibenarkan) return;
    let cancelled = false;
    (async () => {
      // Moderasi: submission pending, tidak termasuk jawapan benih SEED::.
      try {
        const subs = await adminListAllSubmissions();
        if (!cancelled) {
          const n = subs.filter(
            (s) => s.status === 'pending' && !(typeof s.answer === 'string' && s.answer.startsWith('SEED::')),
          ).length;
          setLencana((l) => ({ ...l, moderasi: n }));
        }
      } catch {
        // gagal memuat: tiada lencana, jangan halang render
      }
      // Maklum balas: status sebenar ialah open/in_review/resolved/closed;
      // yang "baharu/terbuka" ialah open.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch('/api/admin/feedback', {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        if (res.ok) {
          const out = (await res.json()) as { items?: { status?: string }[] };
          const n = (out.items || []).filter((x) => x.status === 'open').length;
          if (!cancelled) setLencana((l) => ({ ...l, maklumbalas: n }));
        }
      } catch {
        // gagal memuat: tiada lencana
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dibenarkan]);

  // ===== Menu avatar: tutup pada klik luar dan Escape =====
  useEffect(() => {
    if (!menuOpen) return;
    const onAway = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onAway);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onAway);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  // Tutup menu dan laci setiap kali laluan berubah.
  useEffect(() => {
    setMenuOpen(false);
    setLaciOpen(false);
  }, [pathname]);

  // ===== Kekunci '/' memfokuskan kotak carian =====
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      const sasaran = e.target as HTMLElement | null;
      if (sasaran && (sasaran.tagName === 'INPUT' || sasaran.tagName === 'TEXTAREA' || sasaran.tagName === 'SELECT' || sasaran.isContentEditable)) return;
      e.preventDefault();
      carianRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hantarCarian = (e: React.FormEvent) => {
    e.preventDefault();
    const q = carian.trim();
    router.push(q ? `/admin/users?q=${encodeURIComponent(q)}` : '/admin/users');
  };

  const onLogout = () => {
    clearSession();
    router.replace('/login');
  };

  const aktif = (href: string) => pathname === href || !!pathname?.startsWith(href + '/');

  // ===== Kandungan bar sisi, dikongsi desktop dan laci =====
  const isiSisi = (
    <nav className="px-3 pb-4 space-y-1">
      {NAV.map((t) => {
        const Ikon = t.icon;
        const n = t.lencana ? lencana[t.lencana] : null;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition ${
              aktif(t.href)
                ? 'bg-[#F1EEFC] text-brand-purple font-semibold'
                : 'text-ink-muted hover:text-ink hover:bg-[#F7F7F9] font-medium'
            }`}
          >
            <Ikon className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.label}</span>
            {typeof n === 'number' && n > 0 && (
              <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-purple text-white text-[10px] font-semibold flex items-center justify-center">
                {n > 99 ? '99+' : n}
              </span>
            )}
          </Link>
        );
      })}
      <div className="h-px bg-hairline my-3" />
      <Link
        href="/help"
        className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-xl transition ${
          aktif('/help')
            ? 'bg-[#F1EEFC] text-brand-purple font-semibold'
            : 'text-ink-muted hover:text-ink hover:bg-[#F7F7F9] font-medium'
        }`}
      >
        <HelpCircle className="w-4 h-4 shrink-0" />
        <span>Help</span>
      </Link>
    </nav>
  );

  // ===== Rangka semasa memuat / tiada kebenaran =====
  if (!dibenarkan) {
    return (
      <div className="min-h-screen bg-canvas flex">
        <div className="hidden md:block w-[240px] shrink-0 bg-white border-r border-hairline p-4">
          <div className="h-7 w-32 bg-[#F4F4F6] rounded-lg animate-pulse mb-8" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-9 bg-[#F4F4F6] rounded-xl animate-pulse mb-2" />
          ))}
        </div>
        <div className="flex-1">
          <div className="h-16 bg-white border-b border-hairline px-6 flex items-center gap-4">
            <div className="h-9 w-48 bg-[#F4F4F6] rounded-xl animate-pulse" />
          </div>
          <div className="max-w-[1200px] px-6 py-6">
            <div className="h-8 w-40 bg-[#F4F4F6] rounded-lg animate-pulse mb-6" />
            <div className="h-48 bg-[#F4F4F6] rounded-2xl animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  const tanda = initials(profile?.display_name || user.display_name);

  return (
    <div className="min-h-screen bg-canvas flex">
      {/* ===== Bar sisi desktop ===== */}
      <aside className="hidden md:flex flex-col w-[240px] shrink-0 bg-white border-r border-hairline sticky top-0 h-screen">
        <div className="px-5 h-16 flex items-center border-b border-hairline shrink-0">
          <span className="inline-flex items-center gap-2.5">
            <LogoMark size={28} />
            <span className="text-[19px] font-semibold tracking-tight text-ink">Kuizen</span>
          </span>
        </div>
        <div className="px-5 pt-5 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Admin workspace
          </span>
        </div>
        <div className="flex-1 overflow-y-auto">{isiSisi}</div>
      </aside>

      {/* ===== Laci bar sisi pada skrin kecil ===== */}
      {laciOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setLaciOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] max-w-[85vw] bg-white border-r border-hairline flex flex-col">
            <div className="px-5 h-16 flex items-center justify-between border-b border-hairline shrink-0">
              <span className="inline-flex items-center gap-2.5">
                <LogoMark size={28} />
                <span className="text-[19px] font-semibold tracking-tight text-ink">Kuizen</span>
              </span>
              <button type="button" onClick={() => setLaciOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5 text-ink-muted" />
              </button>
            </div>
            <div className="px-5 pt-5 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
                Admin workspace
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">{isiSisi}</div>
          </aside>
        </div>
      )}

      {/* ===== Bahagian utama ===== */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Bar atas 64px */}
        <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-hairline">
          <div className="h-16 px-4 sm:px-6 flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setLaciOpen(true)}
              aria-label="Open menu"
              className="md:hidden shrink-0 p-2 -ml-1 rounded-xl text-ink-muted hover:text-ink hover:bg-[#F7F7F9]"
            >
              <MenuIcon className="w-5 h-5" />
            </button>

            {/* Breadcrumb */}
            {crumbs && crumbs.length > 0 && (
              <nav className="min-w-0 flex items-center gap-1.5 text-sm overflow-hidden">
                {crumbs.map((c, i) => (
                  <span key={`${c.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
                    {i > 0 && <ChevronRight className="w-4 h-4 text-ink-faint shrink-0" />}
                    {c.href ? (
                      <Link href={c.href} className="truncate text-ink-muted hover:text-ink transition">
                        {c.label}
                      </Link>
                    ) : (
                      <span className="truncate text-ink font-medium">{c.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}

            <div className="flex-1" />

            {/* Carian segerak */}
            <form onSubmit={hantarCarian} className="hidden sm:block relative w-48 lg:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
              <input
                ref={carianRef}
                value={carian}
                onChange={(e) => setCarian(e.target.value)}
                placeholder="Search Kuizen"
                aria-label="Search Kuizen"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#F4F4F6] border border-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:bg-white focus:border-brand-purple/40"
              />
            </form>

            {/* Menu akaun */}
            <div className="relative shrink-0" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-xl hover:bg-[#F4F4F6] transition"
              >
                <span className="w-9 h-9 rounded-full bg-[#EAE6FC] text-brand-purple text-[13px] font-semibold flex items-center justify-center">
                  {tanda}
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
                    href="/educator/classes"
                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-[#F7F7F9] transition"
                  >
                    <GraduationCap className="w-4 h-4 text-ink-faint" /> Back to educator view
                  </Link>
                  <div className="h-px bg-hairline my-1" />
                  <button
                    type="button"
                    onClick={onLogout}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink hover:bg-[#F7F7F9] transition"
                  >
                    <LogOut className="w-4 h-4 text-ink-faint" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Kandungan */}
        <main className="flex-1 w-full">
          <div className="max-w-[1200px] px-4 sm:px-6 py-6">
            {title && (
              <div className="flex items-start justify-between gap-4 mb-6">
                <h1 className="text-2xl font-semibold text-ink">{title}</h1>
                {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
