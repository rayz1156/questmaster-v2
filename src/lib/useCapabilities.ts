'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Client-side mirror of the server capability gate. Fetches the current
 * user's upload capabilities so components can show the right tab state
 * (upload field vs. "not enabled by admin" notice) BEFORE the user tries.
 * Admins/superadmins are treated as always-enabled.
 *
 * KZ-017: jika classId diberi, keupayaan diambil daripada
 * GET /api/classes/[classId]/upload-capabilities supaya kebenaran PEMILIK
 * KELAS diambil kira (contoh: pelajar dalam kelas milik pendidik pelan
 * unlimited). Jika tiada classId atau panggilan gagal, jatuh kembali kepada
 * profil sendiri (gelagat lama).
 */
export type Capabilities = { canUploadFiles: boolean; canUploadVideos: boolean; isAdmin: boolean; loaded: boolean };

export function useCapabilities(classId?: string | null): Capabilities {
  const [caps, setCaps] = useState<Capabilities>({ canUploadFiles: false, canUploadVideos: false, isAdmin: false, loaded: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) { if (alive) setCaps(c => ({ ...c, loaded: true })); return; }

        // KZ-017: keupayaan berkesan dalam konteks kelas, auth Bearer seperti
        // authedFetch sedia ada (sesi localStorage 'qm-auth', bukan kuki).
        if (classId) {
          const { data: { session } } = await supabase.auth.getSession();
          const token = session?.access_token;
          if (token) {
            const res = await fetch(`/api/classes/${encodeURIComponent(classId)}/upload-capabilities`, {
              headers: { Authorization: `Bearer ${token}` },
              cache: 'no-store',
            });
            if (res.ok) {
              const j = await res.json();
              if (!alive) return;
              setCaps({
                canUploadFiles: j.canUploadFiles === true,
                canUploadVideos: j.canUploadVideos === true,
                isAdmin: j.isAdmin === true,
                loaded: true,
              });
              return;
            }
            // Route gagal: jatuh kembali kepada profil sendiri di bawah.
          }
        }

        const { data } = await supabase.from('qm_profiles').select('role, can_upload_files, can_upload_videos').eq('id', uid).maybeSingle();
        if (!alive) return;
        const role = (data as any)?.role;
        const isAdmin = role === 'admin' || role === 'superadmin';
        setCaps({
          canUploadFiles: isAdmin || (data as any)?.can_upload_files === true,
          canUploadVideos: isAdmin || (data as any)?.can_upload_videos === true,
          isAdmin,
          loaded: true,
        });
      } catch {
        if (alive) setCaps(c => ({ ...c, loaded: true }));
      }
    })();
    return () => { alive = false; };
  }, [classId]);
  return caps;
}
