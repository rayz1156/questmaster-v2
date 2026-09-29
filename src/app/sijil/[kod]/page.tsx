/**
 * Halaman awam pengesahan sijil: /sijil/[kod]
 *
 * Memanggil qm_verify_certificate melalui klien anon Supabase di pelayan.
 * Hanya nama, program, tarikh dan pengeluar dipaparkan (PDPA: peserta
 * mungkin bawah umur). Metadata robots noindex. Label BM dengan terjemahan
 * Inggeris kecil di bawah setiap label.
 */
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export const metadata = {
  title: 'Sahkan Sijil | Verify Certificate - Kuizen',
  robots: { index: false, follow: false },
};

type Keputusan = {
  name_snapshot: string;
  program_snapshot: string;
  issued_at: string;
  issuer_name: string;
  status: string;
  revoked_at: string | null;
};

export default async function HalamanSahkanSijil({
  params,
}: {
  params: { kod: string };
}) {
  const kod = (params?.kod ?? '').toUpperCase();

  // Klien anon: hanya qm_verify_certificate yang boleh dicapai.
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await supa.rpc('qm_verify_certificate', { p_code: kod });
  const baris = (data ?? [])[0] as Keputusan | undefined;

  if (!baris) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-slate-800 mb-2">Sijil tidak ditemui</h1>
          <p className="text-sm text-slate-500 mb-1">Certificate not found</p>
          <p className="text-xs text-slate-400 font-mono break-all">{kod || '-'}</p>
        </div>
      </main>
    );
  }

  const sah = baris.status === 'valid';
  const tarikh = new Date(baris.issued_at).toLocaleDateString('ms-MY', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-md w-full">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
            sah
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${sah ? 'bg-green-500' : 'bg-red-500'}`} />
          {sah ? 'Sah' : `Dibatalkan${baris.revoked_at ? ` (${new Date(baris.revoked_at).toLocaleDateString('ms-MY')})` : ''}`}
        </div>
        <span className="sr-only">{sah ? 'Valid' : 'Revoked'}</span>

        <h1 className="mt-6 text-2xl font-semibold text-slate-900 break-words">
          {baris.name_snapshot}
        </h1>

        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-slate-500">Program <span className="text-slate-400 text-xs">/ Program</span></dt>
            <dd className="text-slate-900 font-medium">{baris.program_snapshot}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Tarikh <span className="text-slate-400 text-xs">/ Date</span></dt>
            <dd className="text-slate-900 font-medium">{tarikh}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Dikeluarkan oleh <span className="text-slate-400 text-xs">/ Issued by</span></dt>
            <dd className="text-slate-900 font-medium">{baris.issuer_name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Kod sijil <span className="text-slate-400 text-xs">/ Certificate code</span></dt>
            <dd className="font-mono text-slate-700">{kod}</dd>
          </div>
        </dl>

        <Link
          href="/"
          className="mt-8 inline-flex justify-center w-full rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-sm font-medium text-white"
        >
          Kuizen
        </Link>
      </div>
    </main>
  );
}
