import { LearnerCard, StatTile, ComplianceWidget } from '@/components/b2b';
export const dynamic = 'force-dynamic';
export default function ManagerHome() {
  return (
    <div className="max-w-7xl mx-auto p-8">
      <p className="section-eyebrow">Manager</p>
      <h1 className="display-heading text-3xl">Your team at a glance.</h1>
      <p className="text-slate-600 mt-1 mb-8">Marketing Department · 12 direct reports</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatTile label="Team Size" value="12" icon="👥" />
        <StatTile label="Active Learners" value="11/12" icon="✅" />
        <StatTile label="Avg Completion" value="78%" hint="+6% MoM" icon="📈" />
        <StatTile label="Overdue" value="3" hint="this week" icon="⚠️" />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold text-veltrix-900 mb-3">My team</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <LearnerCard name="Ahmad Razali" department="Marketing" programsActive={3} completionPct={67} lastActive="2 days ago" programs={[{name:'Compliance 101',status:'complete'},{name:'Leadership Track',status:'in_progress',progress:67}]} />
            <LearnerCard name="Sarah Lim" department="Marketing" programsActive={2} completionPct={92} lastActive="today" programs={[{name:'AML Essentials',status:'complete'},{name:'Advanced Excel',status:'in_progress',progress:84}]} />
            <LearnerCard name="Priya Devi" department="Marketing" programsActive={4} completionPct={45} lastActive="5 days ago" programs={[{name:'Compliance 101',status:'in_progress',progress:30},{name:'Brand Workshop',status:'not_started'}]} />
            <LearnerCard name="Wei Hong" department="Marketing" programsActive={1} completionPct={100} lastActive="today" programs={[{name:'Customer Service Mastery',status:'complete'}]} />
          </div>
        </div>
        <div>
          <ComplianceWidget overallPct={78} target={95} overdueCount={3} dueThisWeek={5} byDept={[{name:'Marketing',pct:78}]} />
        </div>
      </div>
    </div>
  );
}
