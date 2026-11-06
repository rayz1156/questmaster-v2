'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { WARNA_AVATAR, bacaRalat, ralatBM } from '@/components/arena/QuestionPopup';

const ABJAD = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Kod: huruf besar, hanya aksara sah, maks 6
function bersihKod(v: string): string {
  return v
    .toUpperCase()
    .split('')
    .filter((c) => ABJAD.includes(c))
    .join('')
    .slice(0, 6);
}

export default function ArenaJoinPage() {
  const router = useRouter();
  const [kod, setKod] = useState('');
  const [nama, setNama] = useState('');
  const [avatar, setAvatar] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const [ralat, setRalat] = useState<string | null>(null);

  useEffect(() => {
    // isi kod daripada ?code= jika ada
    try {
      const k = new URLSearchParams(window.location.search).get('code');
      if (k) setKod(bersihKod(k));
    } catch {
      /* abaikan */
    }
  }, []);

  async function masuk(e: FormEvent) {
    e.preventDefault();
    const code = bersihKod(kod);
    const n = nama.trim();
    if (code.length !== 6) {
      setRalat('Kod permainan mesti 6 aksara.');
      return;
    }
    if (!n) {
      setRalat('Sila isi nama samaran.');
      return;
    }
    setSibuk(true);
    setRalat(null);
    try {
      // token lama untuk sambung semula pemain yang sama
      let lama: string | undefined;
      try {
        const raw = localStorage.getItem('arena:' + code);
        if (raw) {
          const o = JSON.parse(raw) as { playerToken?: unknown };
          if (typeof o.playerToken === 'string') lama = o.playerToken;
        }
      } catch {
        /* abaikan */
      }
      const res = await fetch(`/api/arena/play/${code}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: n, avatar, playerToken: lama }),
      });
      const j: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setRalat(res.status === 404 ? 'Kod permainan tidak dijumpai. Semak semula kod anda.' : ralatBM(bacaRalat(j, res.status)));
        return;
      }
      const d = j as { playerId: string; playerToken: string; nickname: string };
      try {
        localStorage.setItem(
          'arena:' + code,
          JSON.stringify({ playerToken: d.playerToken, playerId: d.playerId, nickname: d.nickname }),
        );
      } catch {
        /* abaikan */
      }
      router.push('/arena/' + code);
    } catch {
      setRalat('Tiada sambungan internet. Cuba lagi.');
    } finally {
      setSibuk(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-indigo-600 to-violet-700 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-center text-3xl font-black text-white">Kuizen Arena</h1>
        <p className="mt-1 text-center text-indigo-100">Masukkan kod daripada guru anda</p>

        <form onSubmit={masuk} className="mt-6 space-y-5 rounded-2xl bg-white p-5 shadow-xl">
          <div>
            <label htmlFor="kod" className="text-sm font-semibold text-slate-700">
              Kod permainan
            </label>
            <input
              id="kod"
              value={kod}
              onChange={(e) => setKod(bersihKod(e.target.value))}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="ABC234"
              className="mt-1 w-full rounded-xl border-2 border-slate-200 px-4 py-4 text-center font-mono text-3xl font-bold uppercase tracking-[0.3em] focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="nama" className="text-sm font-semibold text-slate-700">
              Nama samaran
            </label>
            <input
              id="nama"
              value={nama}
              onChange={(e) => setNama(e.target.value.slice(0, 20))}
              maxLength={20}
              autoComplete="off"
              placeholder="Nama anda"
              className="mt-1 w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-lg focus:border-indigo-600 focus:outline-none"
            />
          </div>

          <div>
            <div className="text-sm font-semibold text-slate-700">Pilih avatar</div>
            <div className="mt-2 grid grid-cols-4 gap-3">
              {WARNA_AVATAR.map((w, i) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setAvatar(i)}
                  aria-label={'Avatar ' + (i + 1)}
                  aria-pressed={avatar === i}
                  className={clsx(
                    'mx-auto h-14 w-14 rounded-full border-4 transition',
                    avatar === i ? 'scale-110 border-slate-900' : 'border-white shadow',
                  )}
                  style={{ background: w }}
                />
              ))}
            </div>
          </div>

          {ralat && <p className="rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{ralat}</p>}

          <button
            type="submit"
            disabled={sibuk}
            className="w-full rounded-xl bg-indigo-600 py-4 text-xl font-bold text-white shadow hover:bg-indigo-700 disabled:opacity-60"
          >
            {sibuk ? 'Sedang masuk…' : 'Masuk'}
          </button>
        </form>
      </div>
    </main>
  );
}
