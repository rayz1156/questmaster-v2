'use client';
import { useEffect, useState } from 'react';
import { supabase, setRememberMe } from './supabase';

/**
 * Log masuk melalui pembekal luar.
 *
 * Butang Google tidak dikawal oleh bendera dalam kod. Ia bertanya kepada
 * GoTrue sendiri melalui /auth/v1/settings sama ada google dihidupkan, dan
 * hanya muncul kalau ya. Sebabnya: kalau ia bergantung pada pemboleh ubah
 * persekitaran aplikasi, ada dua tempat yang mesti diselaraskan dan satu
 * hari nanti butang itu akan wujud tanpa pembekal di belakangnya. Satu
 * sumber kebenaran lebih selamat.
 *
 * Log masuk Google tidak perlu pengesahan emel: GoTrue menandakan emel
 * daripada pembekal OAuth sebagai sudah disahkan, jadi tiada emel dihantar
 * dan tiada langkah tambahan untuk pengguna.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let cache: Promise<Set<string>> | null = null;

/** Nama pembekal yang benar-benar hidup pada pelayan auth. Dicache sekali. */
export function enabledProviders(): Promise<Set<string>> {
  if (!cache) {
    cache = (async () => {
      try {
        const r = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: ANON } });
        if (!r.ok) return new Set<string>();
        const j = await r.json();
        const ext = (j?.external || {}) as Record<string, unknown>;
        return new Set(Object.keys(ext).filter((k) => ext[k] === true));
      } catch {
        return new Set<string>();
      }
    })();
  }
  return cache;
}

/** true sebaik sahaja pelayan auth mengesahkan Google dihidupkan. */
export function useProvider(name: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    enabledProviders().then((s) => { if (alive) setOn(s.has(name)); });
    return () => { alive = false; };
  }, [name]);
  return on;
}

/**
 * Mulakan aliran Google.
 *
 * `role` hanya dibawa daripada skrin daftar, dan hanya digunakan sekali pada
 * akaun yang benar-benar baharu (lihat /auth/callback). `next` dibawa supaya
 * pengguna kembali ke halaman yang mereka cuba buka tadi.
 *
 * prompt=select_account penting untuk makmal dan bengkel: tanpanya Google
 * terus guna akaun terakhir pada mesin itu, dan peserta kedua log masuk
 * sebagai peserta pertama tanpa sedar.
 */
export async function signInWithGoogle(opts?: { role?: 'participant' | 'educator'; next?: string }) {
  setRememberMe(true);
  const params = new URLSearchParams();
  if (opts?.role === 'educator') params.set('role', 'educator');
  if (opts?.next && opts.next.startsWith('/') && !opts.next.startsWith('//')) params.set('next', opts.next);
  const qs = params.toString();
  const redirectTo = `${window.location.origin}/auth/callback${qs ? `?${qs}` : ''}`;
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
}
