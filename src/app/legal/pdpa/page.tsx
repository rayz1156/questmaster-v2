import Link from 'next/link';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200"><div className="max-w-3xl mx-auto px-6 h-16 flex items-center"><Link href="/"><KuizenAcademyLogo height={32}/></Link></div></header>
      <div className="max-w-3xl mx-auto px-6 py-12 prose prose-slate">
        <p className="section-eyebrow">Legal</p>
        <h1 className="display-heading text-3xl mb-3">PDPA Statement</h1>
        <p className="text-slate-600">Last updated: 24 May 2026</p>
        <p>This PDPA Statement applies to your use of StafKita Akademi by Veltrix. Full document is being prepared.</p>
        <p className="text-slate-500 text-sm">StafKita Akademi is operated by Veltrix Technology Centre Sdn Bhd, an UPSI Spin-Off Initiative.</p>
      </div>
    </main>
  );
}
