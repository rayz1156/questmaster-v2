import { LearnerCard, ProgramCard, CohortCard, ComplianceWidget, StatTile } from '@/components/b2b';

export const dynamic = 'force-dynamic';

export default function OrgOverview() {
  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p className="section-eyebrow">Overview</p>
          <h1 className="display-heading text-3xl">Good morning, L&D Team.</h1>
          <p className="text-slate-600 mt-1">Here's what's happening across Acme Corporation today.</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline text-sm">Export</button>
          <button className="btn-academy text-sm">+ New Program</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile label="Learners" value="247" hint="+12 this month" icon="👥" />
        <StatTile label="Active Programs" value="18" hint="5 mandatory" icon="📚" />
        <StatTile label="Completion Rate" value="89%" hint="+4% vs last quarter" icon="✅" />
        <StatTile label="Certificates Issued" value="1,250" hint="YTD" icon="🎓" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 space-y-6">
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-veltrix-900">Active Cohorts</h2>
              <a href="/org/cohorts" className="text-sm text-academy-700 font-semibold hover:underline">View all →</a>
            </div>
            <CohortCard
              name="Q1 2026 Onboarding Batch"
              memberCount={24}
              program="New Employee Orientation"
              startDate="Jan 15, 2026"
              weekCurrent={3}
              weekTotal={8}
              status="in_progress"
              milestones={[
                { label: 'Kickoff', weekNo: 1, done: true },
                { label: 'Module 1 quiz', weekNo: 3, done: true },
                { label: 'Mid-term assessment', weekNo: 5, done: false },
                { label: 'Certification exam', weekNo: 8, done: false },
              ]}
            />
          </section>
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-veltrix-900">Featured Programs</h2>
              <a href="/org/programs" className="text-sm text-academy-700 font-semibold hover:underline">View all →</a>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <ProgramCard
                category="Compliance"
                title="Anti-Money Laundering Essentials"
                hours={4}
                modules={12}
                hasCertificate
                hrdcorpClaimable
                assignedCount={47}
                completionPct={78}
                coverColor="#047857"
              />
              <ProgramCard
                category="Leadership"
                title="Leading High-Performing Teams"
                hours={12}
                modules={8}
                hasCertificate
                hrdcorpClaimable
                mbotRecognised
                assignedCount={32}
                completionPct={45}
                coverColor="#0f1e35"
              />
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-veltrix-900">Recent Learners</h2>
              <a href="/org/people" className="text-sm text-academy-700 font-semibold hover:underline">View all →</a>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <LearnerCard
                name="Ahmad Razali"
                department="Marketing"
                programsActive={3}
                completionPct={67}
                lastActive="2 days ago"
                programs={[
                  { name: 'Compliance 101', status: 'complete' },
                  { name: 'Leadership Track', status: 'in_progress', progress: 67 },
                  { name: 'Product Training', status: 'not_started' },
                ]}
              />
              <LearnerCard
                name="Sarah Lim"
                department="Finance"
                programsActive={2}
                completionPct={92}
                lastActive="today"
                programs={[
                  { name: 'AML Essentials', status: 'complete' },
                  { name: 'Advanced Excel', status: 'in_progress', progress: 84 },
                ]}
              />
            </div>
          </section>
        </div>
        <div>
          <ComplianceWidget
            overallPct={82}
            target={95}
            overdueCount={14}
            dueThisWeek={23}
            byDept={[
              { name: 'Finance', pct: 100 },
              { name: 'HR', pct: 92 },
              { name: 'Operations', pct: 64 },
              { name: 'Engineering', pct: 87 },
              { name: 'Sales', pct: 76 },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
