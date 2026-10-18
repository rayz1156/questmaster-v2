import Link from 'next/link';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';
import { teks } from '@/i18n/teks';
export const dynamic = 'force-dynamic';
export default function Page() {
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200"><div className="max-w-3xl mx-auto px-6 h-16 flex items-center"><Link href="/"><KuizenAcademyLogo height={32}/></Link></div></header>
      <div className="max-w-3xl mx-auto px-6 py-12 prose prose-slate">
        <p className="section-eyebrow">{teks.undang.pinggir}</p>
        <h1 className="display-heading text-3xl mb-3">{teks.undang.terma}</h1>
        <p className="text-slate-600">{teks.undang.dikemaskini}</p>
        <p>{teks.undang.termaTeks(teks.jenama.nama)}</p>
        <p className="text-slate-500 text-sm">{teks.undang.dikendali(teks.jenama.nama)}</p>
      </div>
    </main>
  );
}
