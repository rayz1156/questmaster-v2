import Link from 'next/link';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';

const NAV = [
  { href: '/learner', label: 'My Programs', icon: '📚' },
  { href: '/learner/progress', label: 'My Progress', icon: '📈' },
  { href: '/learner/certificates', label: 'Certificates & Badges', icon: '🏆' },
  { href: '/learner/library', label: 'Learning Library', icon: '📖' },
  { href: '/learner/calendar', label: 'My Calendar', icon: '📅' },
];

export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/learner"><KuizenAcademyLogo variant="horizontal" height={32} /></Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-academy-700">
                <span>{n.icon}</span><span>{n.label}</span>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-academy-100 text-academy-700 font-bold flex items-center justify-center">AR</button>
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
