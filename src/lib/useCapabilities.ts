'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Client-side mirror of the server capability gate. Fetches the current
 * user's upload capabilities so components can show the right tab state
 * (upload field vs. "not enabled by admin" notice) BEFORE the user tries.
 * Admins/superadmins are treated as always-enabled.
 */
export type Capabilities = { canUploadFiles: boolean; canUploadVideos: boolean; isAdmin: boolean; loaded: boolean };

export function useCapabilities(): Capabilities {
  const [caps, setCaps] = useState<Capabilities>({ canUploadFiles: false, canUploadVideos: false, isAdmin: false, loaded: false });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        const uid = u?.user?.id;
        if (!uid) { if (alive) setCaps(c => ({ ...c, loaded: true })); return; }
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
  }, []);
  return caps;
}
