import Link from 'next/link';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
const NAV = [
  { href: '/manager', label: 'My Team', icon: '👥' },
  { href: '/manager/assign', label: 'Assign Programs', icon: '📎' },
  { href: '/manager/requests', label: 'Approvals', icon: '✅' },
  { href: '/manager/reports', label: 'Team Reports', icon: '📊' },
];
export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/manager"><KuizenAcademyLogo variant="horizontal" height={32} /></Link>
            <span className="compliance-pill optional !text-[10px]">Manager view</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-academy-700">
                <span>{n.icon}</span><span>{n.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
