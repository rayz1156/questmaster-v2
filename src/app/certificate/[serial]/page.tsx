import { notFound } from 'next/navigation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function fetchCert(serial: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://akademi.stafkita.com';
  try {
    const r = await fetch(`${base}/api/certificates/verify/${serial}`, { cache: 'no-store' });
    if (!r.ok && r.status !== 404) return null;
    return await r.json();
  } catch { return null; }
}

export default async function CertificatePage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial } = await params;
  const result = await fetchCert(serial);
  if (!result || result.valid === false && !result.certificate) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="text-rose-700 font-semibold text-lg">Certificate not found</div>
          <div className="text-sm text-slate-500 mt-2">Serial: <span className="font-mono">{serial}</span></div>
          <a href="/" className="inline-block mt-4 text-sm text-emerald-700 hover:underline">Back to StafKita Akademi</a>
        </div>
      </main>
    );
  }
  const cert = result.certificate as { serial: string; learner_name: string; course_title: string; creator_display_name: string; issued_at: string; revoked_at: string | null };
  const issued = new Date(cert.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const isValid = result.valid !== false && !cert.revoked_at;
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white border-2 border-emerald-200 rounded-2xl p-10 shadow-xl">
        <div className="text-center">
          <div className="text-xs uppercase tracking-widest text-emerald-700 font-semibold">StafKita Akademi · Certificate of Completion</div>
          <div className="mt-6 text-sm text-slate-500">This certifies that</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{cert.learner_name}</div>
          <div className="mt-4 text-sm text-slate-500">has successfully completed the course</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-700">{cert.course_title}</div>
          <div className="mt-4 text-sm text-slate-500">offered by</div>
          <div className="mt-1 text-base font-medium text-slate-800">{cert.creator_display_name}</div>
          <div className="mt-8 flex items-center justify-center gap-8 text-xs text-slate-500">
            <div><div className="font-medium text-slate-700">Issued</div><div>{issued}</div></div>
            <div><div className="font-medium text-slate-700">Serial</div><div className="font-mono">{cert.serial}</div></div>
          </div>
          <div className={`mt-6 inline-block px-3 py-1 rounded-full text-xs font-medium ${isValid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
            {isValid ? 'Valid' : 'Revoked'}
          </div>
        </div>
      </div>
    </main>
  );
}
