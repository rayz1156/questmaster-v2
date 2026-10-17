import Link from 'next/link';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';

const NAV = [
  { href: '/org', label: 'Overview', icon: '🏠' },
  { href: '/org/people', label: 'People', icon: '👥' },
  { href: '/org/programs', label: 'Programs', icon: '📚' },
  { href: '/org/cohorts', label: 'Cohorts', icon: '🎯' },
  { href: '/org/reports', label: 'Reports', icon: '📊' },
  { href: '/org/certifications', label: 'Certifications', icon: '🏆' },
  { href: '/org/settings', label: 'Settings', icon: '⚙️' },
  { href: '/org/billing', label: 'Billing', icon: '💳' },
];

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 shrink-0 bg-veltrix-900 text-slate-100 flex flex-col">
        <div className="px-5 py-5 border-b border-veltrix-800">
          <KuizenAcademyLogo variant="horizontal" color="mono-light" height={32} />
        </div>
        <div className="px-5 py-4 border-b border-veltrix-800">
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Organization</p>
          <p className="text-sm font-bold text-white mt-0.5 truncate">Acme Corporation</p>
          <p className="text-[11px] text-slate-400">Enterprise · 247 learners</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(item => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-veltrix-800 hover:text-white transition">
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-veltrix-800 space-y-0.5">
          <Link href="/help" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-veltrix-800 hover:text-white"><span>🆘</span><span>Support</span></Link>
          <Link href="/docs" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-veltrix-800 hover:text-white"><span>📖</span><span>Documentation</span></Link>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        {children}
      </main>
    </div>
  );
}
