'use client';
// KZ-031: halaman integrasi Pay untuk pencipta. Jana kunci API
// (dipaparkan sekali sahaja), senarai kunci (nama, awalan, guna terakhir)
// dan pembatalan kunci. Teks ikut lapisan jenama (BM StafKita / EN Veltrix).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { teks, LOKAL } from '@/i18n/teks';

type KunciApi = {
  id: string;
  label: string;
  key_prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};

function tarikhNil(v: string | null): string {
  if (!v) return teks.integrasi.gunaBelum;
  try {
    return new Date(v).toLocaleDateString(LOKAL, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return teks.integrasi.gunaBelum;
  }
}

export default function IntegrasiPage() {
  const [senarai, setSenarai] = useState<KunciApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState('');
  const [menjana, setMenjana] = useState(false);
  const [kunciBaru, setKunciBaru] = useState<string | null>(null);
  const [disalin, setDisalin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function token(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function muat() {
    setLoading(true);
    const h = { 'Content-Type': 'application/json' } as Record<string, string>;
    const t = await token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    const res = await fetch('/api/creator/kunci-api', { headers: h });
    if (res.ok) {
      const data = await res.json();
      setSenarai(data.kunci ?? []);
    } else {
      setError(teks.integrasi.ralat);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await muat();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function jana() {
    setError(null);
    setMenjana(true);
    setDisalin(false);
    const h = { 'Content-Type': 'application/json' } as Record<string, string>;
    const t = await token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    const res = await fetch('/api/creator/kunci-api', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({ label }),
    });
    setMenjana(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || teks.integrasi.ralat);
      return;
    }
    const data = await res.json();
    // Kunci penuh dipaparkan SEKALI sahaja; DB simpan awalan + cincangan
    setKunciBaru(data.kunci);
    setLabel('');
    await muat();
  }

  async function batalkan(id: string) {
    if (!confirm(teks.integrasi.sahBatalkan)) return;
    setError(null);
    const h = { 'Content-Type': 'application/json' } as Record<string, string>;
    const t = await token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    const res = await fetch('/api/creator/kunci-api', {
      method: 'PATCH',
      headers: h,
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error || teks.integrasi.ralat);
      return;
    }
    await muat();
  }

  async function salin() {
    if (!kunciBaru) return;
    try {
      await navigator.clipboard.writeText(kunciBaru);
      setDisalin(true);
      setTimeout(() => setDisalin(false), 1500);
    } catch {
      // Pelayar tanpa clipboard: pengguna boleh pilih teks secara manual
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <h1 className="text-2xl font-bold text-slate-900">{teks.integrasi.tajuk}</h1>
      <p className="mt-1 text-sm text-slate-600">{teks.integrasi.penerangan}</p>

      {error && (
        <div className="mt-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
          {error}
        </div>
      )}

      {kunciBaru && (
        <div className="mt-6 bg-violet-50 border border-violet-200 rounded-xl p-4">
          <p className="text-sm font-medium text-violet-900">{teks.integrasi.kunciDipapar}</p>
          <div className="mt-3 flex items-center gap-3">
            <code className="flex-1 px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm font-mono break-all">
              {kunciBaru}
            </code>
            <button
              type="button"
              onClick={salin}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:opacity-95"
            >
              {disalin ? teks.integrasi.disalin : teks.integrasi.salin}
            </button>
            <button
              type="button"
              onClick={() => setKunciBaru(null)}
              className="px-3 py-2 rounded-lg text-sm text-violet-700 hover:bg-violet-100"
            >
              {teks.integrasi.tutup}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6">
        <label className="text-sm font-medium text-slate-700">{teks.integrasi.labelKunci}</label>
        <div className="mt-1 flex items-center gap-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={teks.integrasi.labelPlaceholder}
            maxLength={120}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={jana}
            disabled={menjana || !label.trim()}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:opacity-95 disabled:opacity-50"
          >
            {menjana ? teks.integrasi.menjana : teks.integrasi.butangJana}
          </button>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">{teks.integrasi.senaraiTajuk}</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : senarai.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">{teks.integrasi.tiadaKunci}</p>
        ) : (
          <div className="mt-4 space-y-2">
            {senarai.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{k.label}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">{k.key_prefix}…</p>
                </div>
                <div className="hidden sm:block text-right text-xs text-slate-500">
                  <p>{teks.integrasi.lajurDicipta}: {tarikhNil(k.created_at)}</p>
                  <p>{teks.integrasi.lajurGuna}: {tarikhNil(k.last_used_at)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {k.revoked_at ? (
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-medium">
                      {teks.integrasi.statusDibatalkan}
                    </span>
                  ) : (
                    <>
                      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                        {teks.integrasi.statusAktif}
                      </span>
                      <button
                        type="button"
                        onClick={() => batalkan(k.id)}
                        className="text-xs text-rose-600 hover:text-rose-700 hover:underline"
                      >
                        {teks.integrasi.butangBatalkan}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
