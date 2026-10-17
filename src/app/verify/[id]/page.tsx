import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { KuizenAcademyLogo } from '@/components/branding/KuizenAcademyLogo';

export const dynamic = 'force-dynamic';

async function fetchCert(id: string) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data } = await supa.from('lms_certificates').select('*').eq('id', id).maybeSingle();
    return data;
  } catch { return null; }
}

export default async function VerifyPage({ params }: { params: { id: string } }) {
  const cert = await fetchCert(params.id);
  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/"><KuizenAcademyLogo variant="horizontal" height={32}/></Link>
          <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Certificate Verification</span>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-12">
        {cert ? (
          <div className="surface-card p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-12 h-12 rounded-full bg-success-soft text-success flex items-center justify-center text-2xl font-bold">✓</span>
              <div>
                <h1 className="text-2xl font-bold text-veltrix-900">Valid Certificate</h1>
                <p className="text-sm text-slate-600">This certificate is genuine and was issued by Kuizen Academy.</p>
              </div>
            </div>
            <dl className="grid sm:grid-cols-2 gap-4 mb-6">
              <Row k="Issued to" v={cert.learner_name || cert.learner_id}/>
              <Row k="Program" v={cert.program_name || cert.course_id}/>
              <Row k="Completion date" v={cert.completed_at ? new Date(cert.completed_at).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}) : '—'}/>
              <Row k="Issuer" v={'Kuizen Academy by Veltrix'}/>
              <Row k="Certificate ID" v={cert.id} mono/>
              {cert.serial && <Row k="Serial" v={cert.serial} mono/>}
            </dl>
            {Array.isArray(cert.accreditations) && cert.accreditations.length > 0 && (
              <div className="mb-6">
                <p className="text-xs uppercase font-semibold tracking-wider text-slate-500 mb-2">Accreditations</p>
                <div className="flex flex-wrap gap-2">
                  {cert.accreditations.map((a: string) => (<span key={a} className="compliance-pill required !text-[10px]">{a}</span>))}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              {cert.pdf_url && <a href={cert.pdf_url} className="btn-academy text-sm" target="_blank" rel="noopener">View PDF</a>}
              <Link href={`/certificate/${cert.id}`} className="btn-outline text-sm">View Certificate</Link>
            </div>
          </div>
        ) : (
          <div className="surface-card p-8 text-center">
            <div className="text-5xl mb-3">✗</div>
            <h1 className="text-2xl font-bold text-danger mb-2">Certificate not found</h1>
            <p className="text-slate-600 mb-5">We could not verify a certificate with ID <code className="bg-slate-100 px-2 py-0.5 rounded">{params.id}</code>. If you received a verification link, please check the URL is correct.</p>
            <Link href="/" className="btn-outline text-sm">← Back to home</Link>
          </div>
        )}
        <p className="text-center text-xs text-slate-500 mt-8">Kuizen Academy · A Veltrix Technology Center Product</p>
      </div>
    </main>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div><dt className="text-xs uppercase tracking-wider text-slate-500 font-semibold mb-0.5">{k}</dt><dd className={`text-veltrix-900 ${mono ? 'font-mono text-xs' : 'font-semibold'}`}>{v}</dd></div>
  );
}
