'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Cert = { serial: string; learner_name: string; course_title: string; issued_at: string };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return (data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}) as Record<string, string>;
}

export default function CertificateBadge({ courseId, eligible }: { courseId: string; eligible: boolean }) {
  const [cert, setCert] = useState<Cert | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);

  async function issue() {
    setIssuing(true); setError(null);
    try {
      const r = await fetch(`/api/certificates/issue/${courseId}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(await authHeader()) }, body: '{}' });
      const j = await r.json();
      if (!r.ok) { setError(j.error || `HTTP ${r.status}`); return; }
      setCert(j.certificate as Cert);
    } catch (e: any) { setError(e?.message || 'Issue failed'); }
    finally { setIssuing(false); }
  }

  // Auto-issue when eligible flips true and no cert yet
  useEffect(() => { if (eligible && !cert && !issuing) { issue(); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eligible]);

  if (!eligible && !cert) return null;

  return (
    <div className="mt-6 border-2 border-emerald-200 rounded-2xl p-6 bg-gradient-to-br from-emerald-50 via-white to-teal-50">
      <div className="text-xs uppercase tracking-widest text-emerald-700 font-semibold">✨ Course completed</div>
      {cert ? (
        <>
          <div className="mt-2 text-lg font-semibold text-slate-900">Your certificate is ready</div>
          <div className="mt-1 text-sm text-slate-600">Serial: <span className="font-mono text-slate-800">{cert.serial}</span></div>
          <a href={`/certificate/${cert.serial}`} target="_blank" rel="noreferrer" className="inline-block mt-3 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">View certificate ↗</a>
        </>
      ) : (
        <>
          <div className="mt-2 text-sm text-slate-700">{issuing ? 'Issuing your certificate...' : 'Generating certificate...'}</div>
          {error && <div className="mt-2 text-sm text-rose-700">{error}</div>}
        </>
      )}
    </div>
  );
}
