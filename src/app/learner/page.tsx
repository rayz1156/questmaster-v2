import Link from 'next/link';
import { ProgramCard, StatTile } from '@/components/b2b';

export const dynamic = 'force-dynamic';

export default function LearnerHome() {
  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="section-eyebrow">Learner</p>
          <h1 className="display-heading text-3xl">Welcome back, Ahmad.</h1>
          <p className="text-slate-600 mt-1">You have 2 programs in progress and 1 deadline this week.</p>
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile label="In Progress" value="2" icon="⏳" />
        <StatTile label="Completed" value="7" hint="this year" icon="✅" />
        <StatTile label="Certificates" value="5" icon="🎓" />
        <StatTile label="Hours Logged" value="48" hint="YTD" icon="⏱" />
      </div>
      <section className="mb-8">
        <h2 className="text-lg font-bold text-veltrix-900 mb-3">Continue learning</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <ProgramCard category="Compliance" title="Anti-Money Laundering Essentials" hours={4} modules={12} hasCertificate hrdcorpClaimable completionPct={67} coverColor="#6576ff" />
          <ProgramCard category="Leadership" title="Leading High-Performing Teams" hours={12} modules={8} hasCertificate mbotRecognised completionPct={32} coverColor="#0f1e35" />
          <ProgramCard category="Product" title="Q1 Product Training Update" hours={2} modules={5} completionPct={0} coverColor="#d97706" />
        </div>
      </section>
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-veltrix-900">Upcoming deadlines</h2>
          <Link href="/learner/calendar" className="text-sm text-academy-700 font-semibold hover:underline">View calendar →</Link>
        </div>
        <div className="surface-card divide-y divide-slate-100">
          {[{ p: 'AML Essentials', due: 'Friday', status: 'required' as const },{ p: 'Q1 Product Training', due: 'Next Monday', status: 'required' as const },{ p: 'Leadership Module 5', due: 'In 2 weeks', status: 'optional' as const }].map((d, i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div>
                <p className="font-semibold text-veltrix-900">{d.p}</p>
                <p className="text-xs text-slate-500">Due {d.due}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`compliance-pill ${d.status} !text-[10px]`}>{d.status}</span>
                <Link href="#" className="btn-academy text-xs !px-3 !py-1.5">Resume</Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
