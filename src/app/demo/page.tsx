'use client';
import { useState } from 'react';
import Link from 'next/link';
import { BRANDING } from '@/lib/branding.config';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';

export default function DemoPage() {
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    full_name: '', work_email: '', phone: '', company_name: '',
    company_size: '', industry: '', role_title: '', use_case: '', hrdcorp_interest: false,
  });
  function up<K extends keyof typeof form>(k: K, v: any) {
    setForm(p => ({ ...p, [k]: v }));
    if (err) setErr('');
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true); setErr('');
    try {
      const r = await fetch('/api/demo-request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (!r.ok) { const j = await r.json().catch(()=>({})); throw new Error(j.error || 'Submission failed'); }
      setOk(true);
    } catch (e: any) { setErr(e.message || 'Submission failed'); }
    finally { setSubmitting(false); }
  }
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/"><KuizenAcademyLogo variant="horizontal" height={36} /></Link>
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-academy-700">Sign in</Link>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <span className="section-eyebrow">Book a demo</span>
        <h1 className="display-heading text-3xl sm:text-4xl mb-3">See StafKita Akademi in action.</h1>
        <p className="text-lg text-slate-600 mb-8">A Veltrix consultant will reach out within one business day to schedule a 30-minute walkthrough tailored to your industry.</p>
        {ok ? (
          <div className="surface-card p-8 text-center">
            <div className="text-5xl mb-3">✓</div>
            <h2 className="text-2xl font-bold text-veltrix-900 mb-2">Request received.</h2>
            <p className="text-slate-600 mb-5">We’ll be in touch shortly at <strong>{form.work_email}</strong>.</p>
            <Link href="/" className="btn-outline">← Back to home</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="surface-card p-6 sm:p-8 space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" required><input required value={form.full_name} onChange={e=>up('full_name', e.target.value)} className="input" /></Field>
              <Field label="Work email" required><input required type="email" value={form.work_email} onChange={e=>up('work_email', e.target.value)} className="input" /></Field>
              <Field label="Phone"><input value={form.phone} onChange={e=>up('phone', e.target.value)} className="input" /></Field>
              <Field label="Company" required><input required value={form.company_name} onChange={e=>up('company_name', e.target.value)} className="input" /></Field>
              <Field label="Company size"><select value={form.company_size} onChange={e=>up('company_size', e.target.value)} className="input"><option value="">Select…</option><option>1-50</option><option>51-200</option><option>201-1000</option><option>1001-5000</option><option>5000+</option></select></Field>
              <Field label="Industry"><input value={form.industry} onChange={e=>up('industry', e.target.value)} className="input" placeholder="e.g. Banking, Healthcare" /></Field>
              <Field label="Your role"><input value={form.role_title} onChange={e=>up('role_title', e.target.value)} className="input" placeholder="e.g. Head of L&D" /></Field>
              <Field label="&nbsp;"><label className="inline-flex items-center gap-2 text-sm text-slate-700 mt-2"><input type="checkbox" checked={form.hrdcorp_interest} onChange={e=>up('hrdcorp_interest', e.target.checked)} /> HRDCorp claim is a priority</label></Field>
            </div>
            <Field label="What are you hoping to solve?"><textarea value={form.use_case} onChange={e=>up('use_case', e.target.value)} className="input min-h-[110px]" placeholder="Onboarding, compliance, leadership development…" /></Field>
            {err && <div className="text-sm text-danger bg-danger-soft px-3 py-2 rounded-lg">{err}</div>}
            <button type="submit" disabled={submitting} className="btn-academy w-full text-base disabled:opacity-60">{submitting ? 'Sending…' : 'Request a demo'}</button>
            <p className="text-xs text-slate-500 text-center">By submitting, you agree to be contacted by Veltrix Sdn Bhd. We respect PDPA § your privacy.</p>
          </form>
        )}
      </div>
      <style jsx global>{`
        .input { width: 100%; padding: 0.625rem 0.875rem; border-radius: 0.625rem; border: 1px solid #cbd5e1; background: white; font-size: 0.9375rem; transition: border-color 150ms ease; }
        .input:focus { outline: none; border-color: #6576ff; box-shadow: 0 0 0 3px rgba(101,118,255,0.15); }
      `}</style>
    </main>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-slate-700 mb-1.5" dangerouslySetInnerHTML={{__html: label + (required ? ' <span style=\"color:#dc2626\">*</span>' : '')}} />
      {children}
    </label>
  );
}
