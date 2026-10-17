'use client';
import * as React from 'react';
import Link from 'next/link';

// ===== Learner Card (admin/manager view) =====
export interface LearnerCardProps {
  name: string;
  department?: string;
  avatarUrl?: string;
  programsActive: number;
  completionPct: number;
  lastActive?: string;
  programs?: Array<{ name: string; status: 'complete' | 'in_progress' | 'not_started'; progress?: number }>;
  href?: string;
}
export function LearnerCard({ name, department, avatarUrl, programsActive, completionPct, lastActive, programs = [], href = '#' }: LearnerCardProps) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="surface-card p-5">
      <div className="flex items-start gap-3 mb-4">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-academy-100 text-academy-700 font-bold flex items-center justify-center">{initials}</div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-veltrix-900 truncate">{name}</h3>
          {department && <p className="text-xs text-slate-500">{department}</p>}
        </div>
        <Link href={href} className="text-xs text-academy-700 font-semibold hover:underline">View →</Link>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mb-4 bg-slate-50 rounded-lg p-3 border border-slate-200">
        <div><div className="text-slate-500">Programs</div><div className="font-bold text-veltrix-900 text-sm">{programsActive} active</div></div>
        <div><div className="text-slate-500">Completion</div><div className="font-bold text-veltrix-900 text-sm">{completionPct}%</div></div>
        <div><div className="text-slate-500">Last active</div><div className="font-bold text-veltrix-900 text-sm">{lastActive || '—'}</div></div>
      </div>
      {programs.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {programs.slice(0, 3).map(p => (
            <li key={p.name} className="flex items-center gap-2">
              <StatusDot status={p.status} />
              <span className="truncate flex-1 text-slate-700">{p.name}</span>
              {p.status === 'complete' && <span className="text-xs text-success font-semibold">complete</span>}
              {p.status === 'in_progress' && <span className="text-xs text-slate-500">{p.progress ?? 0}%</span>}
              {p.status === 'not_started' && <span className="text-xs text-slate-400">not started</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: 'complete' | 'in_progress' | 'not_started' }) {
  if (status === 'complete') return <span className="w-4 h-4 rounded-full bg-academy-700 text-white text-[10px] font-bold flex items-center justify-center">✓</span>;
  if (status === 'in_progress') return <span className="w-4 h-4 rounded-full border-2 border-academy-600 bg-academy-100" />;
  return <span className="w-4 h-4 rounded-full border-2 border-slate-300" />;
}

// ===== B2B Program Card =====
export interface ProgramCardProps {
  category: string;
  title: string;
  hours: number;
  modules: number;
  hasCertificate?: boolean;
  hrdcorpClaimable?: boolean;
  mbotRecognised?: boolean;
  assignedCount?: number;
  completionPct?: number;
  coverColor?: string;
  href?: string;
}
export function ProgramCard({ category, title, hours, modules, hasCertificate, hrdcorpClaimable, mbotRecognised, assignedCount, completionPct, coverColor = '#047857', href = '#' }: ProgramCardProps) {
  return (
    <div className="surface-card overflow-hidden flex flex-col">
      <div className="h-32 relative" style={{ background: `linear-gradient(135deg, ${coverColor}, #0f1e35)` }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, white 0px, transparent 60%)' }} />
        {hasCertificate && (
          <span className="absolute top-3 right-3 cert-badge text-[10px] !px-2 !py-1">🎓 Certificate</span>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <p className="text-[11px] uppercase tracking-wider font-bold text-academy-700 mb-1">{category}</p>
        <h3 className="font-bold text-lg text-veltrix-900 mb-3 leading-snug">{title}</h3>
        <div className="border-t border-slate-200 pt-3 space-y-1.5 text-sm text-slate-600 mb-3">
          <div className="flex items-center gap-2"><span>⏱</span><span>{hours} hours</span></div>
          <div className="flex items-center gap-2"><span>📚</span><span>{modules} modules</span></div>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {hrdcorpClaimable && <span className="compliance-pill required !text-[10px] !px-2">HRDCorp Claimable</span>}
          {mbotRecognised && <span className="compliance-pill completed !text-[10px] !px-2">MBOT Recognised</span>}
        </div>
        {(assignedCount !== undefined || completionPct !== undefined) && (
          <div className="text-xs text-slate-500 space-y-1 mb-3">
            {assignedCount !== undefined && <div>Assigned to: <strong className="text-veltrix-900">{assignedCount} learners</strong></div>}
            {completionPct !== undefined && (
              <div>
                Completion: <strong className="text-veltrix-900">{completionPct}%</strong>
                <div className="progress-track mt-1"><div className="progress-fill" style={{ width: `${completionPct}%` }} /></div>
              </div>
            )}
          </div>
        )}
        <Link href={href} className="btn-academy mt-auto text-sm w-full">Manage →</Link>
      </div>
    </div>
  );
}

// ===== Cohort View =====
export interface CohortCardProps {
  name: string;
  memberCount: number;
  program: string;
  startDate: string;
  weekCurrent?: number;
  weekTotal?: number;
  status?: 'upcoming' | 'in_progress' | 'completed';
  milestones?: Array<{ label: string; weekNo: number; done: boolean }>;
}
export function CohortCard({ name, memberCount, program, startDate, weekCurrent = 0, weekTotal = 8, status = 'in_progress', milestones = [] }: CohortCardProps) {
  const pct = weekTotal > 0 ? Math.min(100, Math.round((weekCurrent / weekTotal) * 100)) : 0;
  return (
    <div className="surface-card p-6">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-bold text-academy-700 mb-1">Cohort</p>
          <h3 className="font-bold text-xl text-veltrix-900">{name}</h3>
        </div>
        <span className={`compliance-pill ${status === 'in_progress' ? 'optional' : status === 'completed' ? 'completed' : 'required'} !text-[10px]`}>
          {status.replace('_', ' ')}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm mb-4">
        <div><dt className="text-slate-500 text-xs">Members</dt><dd className="font-semibold text-veltrix-900">{memberCount} learners</dd></div>
        <div><dt className="text-slate-500 text-xs">Program</dt><dd className="font-semibold text-veltrix-900 truncate">{program}</dd></div>
        <div><dt className="text-slate-500 text-xs">Started</dt><dd className="font-semibold text-veltrix-900">{startDate}</dd></div>
        <div><dt className="text-slate-500 text-xs">Progress</dt><dd className="font-semibold text-veltrix-900">Week {weekCurrent} of {weekTotal}</dd></div>
      </dl>
      <div className="relative mb-5">
        <div className="progress-track !h-2.5"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
        {milestones.length > 0 && (
          <div className="relative h-0">
            {milestones.map(m => (
              <span key={m.label} className="absolute -top-1.5 w-3 h-3 rounded-full border-2 border-white" style={{ left: `${(m.weekNo / weekTotal) * 100}%`, background: m.done ? '#d97706' : '#cbd5e1' }} title={m.label} />
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-outline text-xs !px-3 !py-1.5">View Members</button>
        <button className="btn-outline text-xs !px-3 !py-1.5">View Progress</button>
        <button className="btn-outline text-xs !px-3 !py-1.5">Send Reminder</button>
        <button className="btn-outline text-xs !px-3 !py-1.5">Export Report</button>
      </div>
    </div>
  );
}

// ===== Compliance Widget =====
export interface ComplianceWidgetProps {
  overallPct: number;
  target?: number;
  overdueCount: number;
  dueThisWeek: number;
  byDept: Array<{ name: string; pct: number }>;
}
export function ComplianceWidget({ overallPct, target = 95, overdueCount, dueThisWeek, byDept }: ComplianceWidgetProps) {
  return (
    <div className="surface-card p-6">
      <h3 className="font-bold text-veltrix-900 mb-1">Compliance Overview</h3>
      <p className="text-xs text-slate-500 mb-5">Required training completion across the organization</p>
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs text-slate-600">Overall completion</span>
          <span className="text-xs text-slate-500">target: {target}%</span>
        </div>
        <div className="progress-track !h-3"><div className="progress-fill" style={{ width: `${overallPct}%` }} /></div>
        <div className="text-2xl font-bold text-veltrix-900 mt-2">{overallPct}%</div>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-lg bg-danger-soft text-danger p-3"><div className="text-xs font-semibold uppercase">Overdue</div><div className="text-2xl font-bold mt-0.5">{overdueCount} <span className="text-xs font-normal">learners</span></div></div>
        <div className="rounded-lg bg-warning-soft text-warning p-3"><div className="text-xs font-semibold uppercase">Due this week</div><div className="text-2xl font-bold mt-0.5">{dueThisWeek} <span className="text-xs font-normal">learners</span></div></div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">By Department</p>
        <ul className="space-y-2">
          {byDept.map(d => (
            <li key={d.name}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-slate-700">{d.name}</span>
                <span className={`font-semibold ${d.pct < 70 ? 'text-danger' : d.pct < 90 ? 'text-warning' : 'text-success'}`}>
                  {d.pct}%{d.pct < 70 && ' ⚠️'}
                </span>
              </div>
              <div className="progress-track !h-1.5"><div className="progress-fill" style={{ width: `${d.pct}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-2 mt-5">
        <button className="btn-academy text-xs flex-1 !py-2">Send Reminders</button>
        <button className="btn-outline text-xs flex-1 !py-2">Generate Report</button>
      </div>
    </div>
  );
}

// ===== Stat Tile =====
export function StatTile({ label, value, hint, icon }: { label: string; value: string | number; hint?: string; icon?: string }) {
  return (
    <div className="surface-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500 font-semibold mb-2">
        {icon && <span className="text-base">{icon}</span>}
        {label}
      </div>
      <div className="text-3xl font-bold text-veltrix-900 leading-none">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-2">{hint}</div>}
    </div>
  );
}
