'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { ArenaSet } from '@/lib/arena/types';

type SetRow = ArenaSet & { question_count: number };

function errText(j: unknown, status: number): string {
  if (j && typeof j === 'object') {
    const o = j as Record<string, unknown>;
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return 'Ralat ' + status;
}

export default function ArenaSetsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push('/login'); return; }
      setToken(session.access_token);
      try {
        const res = await fetch('/api/arena/sets', { headers: { Authorization: 'Bearer ' + session.access_token }, cache: 'no-store' });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errText(json, res.status));
        if (alive) setSets((json as { sets: SetRow[] }).sets ?? []);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  async function create() {
    if (!token || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/arena/sets', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errText(json, res.status));
      router.push('/educator/arena/' + (json as { set: ArenaSet }).set.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-600 p-6 text-white shadow">
        <h1 className="text-2xl font-bold">Kuizen Arena</h1>
        <p className="mt-1 text-sm text-indigo-100">Kuiz permainan gaya ZEP: 6 jenis soalan, 5 mod, peta 2D.</p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold text-slate-800">Cipta set baharu</h2>
        <div className="flex gap-2">
          <input className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            placeholder="Tajuk set, cth. Sains Tahun 5: Tenaga" value={title} maxLength={120}
            onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} />
          <button type="button" onClick={() => void create()} disabled={busy || !title.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            {busy ? 'Mencipta...' : 'Cipta'}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-slate-800">Set saya</h2>
        {loading ? (
          <p className="text-sm text-slate-500">Memuatkan...</p>
        ) : sets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Belum ada set. Cipta set pertama anda di atas.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {sets.map((s) => (
              <li key={s.id}>
                <Link href={'/educator/arena/' + s.id}
                  className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-indigo-400 hover:shadow">
                  <p className="font-semibold text-slate-800">{s.title}</p>
                  {s.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{s.description}</p>}
                  <p className="mt-2 text-xs text-slate-400">
                    {s.question_count} soalan · dikemas kini {new Date(s.updated_at).toLocaleDateString('ms-MY')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
