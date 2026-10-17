import Link from 'next/link';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <div className="p-8 max-w-7xl">
      <p className="section-eyebrow">Billing</p>
      <h1 className="display-heading text-3xl mb-2">Billing</h1>
      <p className="text-slate-600 mb-8">Manage and track Billing for your organization.</p>
      <div className="surface-card p-12 text-center">
        <div className="text-5xl mb-3">🚧</div>
        <h2 className="text-xl font-bold text-veltrix-900 mb-2">Billing page coming soon</h2>
        <p className="text-slate-600 mb-5">This section is being built. Use the Overview to see live data.</p>
        <Link href="/org" className="btn-academy text-sm">← Back to Overview</Link>
      </div>
    </div>
  );
}
