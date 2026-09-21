'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Halaman utama ialah halaman pemasaran awam, jadi ia mesti kekal sebagai
 * HTML yang boleh diindeks. Pengalihan untuk pengguna yang sudah log masuk
 * berlaku di sini, di sisi klien, selepas HTML itu dihantar.
 *
 * Perangkak enjin carian dan enjin jawapan tidak mempunyai sesi, jadi mereka
 * tidak pernah dialihkan dan sentiasa membaca halaman penuh.
 */
export default function LandingSessionCheck() {
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!alive || !data.session) return;
        const role = (data.session.user.user_metadata?.role as string) || 'participant';
        const dest =
          role === 'admin' || role === 'superadmin'
            ? '/admin/overview'
            : role === 'educator'
              ? '/educator/classes'
              : '/participant/home';
        window.location.replace(dest);
      } catch {
        /* tiada sesi, biarkan halaman awam dipaparkan */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return null;
}
