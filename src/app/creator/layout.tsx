'use client';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Creator = { id: string; slug: string; display_name: string; is_published: boolean };

export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [creator, setCreator] = useState<Creator | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login?next=/creator'); return; }
      const { data } = await supabase
        .from('lms_creators')
        .select('id, slug, display_name, is_published')
        .eq('owner_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!data) {
        if (pathname !== '/creator/onboarding') router.replace('/creator/onboarding');
        setLoading(false);
        return;
      }
      setCreator(data as Creator);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router, pathname]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  }

  // Onboarding flow renders without sidebar
  if (pathname === '/creator/onboarding' || !creator) {
    return <div className="min-h-screen bg-slate-50">{children}</div>;
  }

  const nav = [
    { href: '/creator', label: 'Overview', icon: '▢' },
    { href: '/creator/courses', label: 'Courses', icon: '■' },
    { href: `/c/${creator.slug}`, label: 'View storefront', icon: '↗', external: true },
    { href: '/creator/settings', label: 'Settings', icon: '⚙' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <Link href="/" aria-label="Kuizen Academy home"><KuizenAcademyLogo variant="horizontal" height={30} /></Link>
          <div className="mt-1 text-xs text-slate-500 truncate">{creator.display_name}</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = !item.external && (item.href === '/creator' ? pathname === '/creator' : pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                target={item.external ? '_blank' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${active ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <span className="w-5 text-center text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-slate-100">
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/'); }}
            className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 rounded-lg"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}