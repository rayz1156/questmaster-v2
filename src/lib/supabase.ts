import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cross-tab auth lock with hard timeout to prevent indefinite 'Loading...' hangs
// when another tab holds the Web Locks API entry (or crashed without releasing it).
// Falls back to running the function without exclusion after timeout ms.
const LMS_LOCK_TIMEOUT_MS = 3000;
async function lmsAuthLock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  if (typeof navigator === 'undefined' || !(navigator as any).locks) return fn();
  const locks = (navigator as any).locks;
  let timer: any;
  const timeoutP = new Promise<'__timeout__'>(res => { timer = setTimeout(() => res('__timeout__'), LMS_LOCK_TIMEOUT_MS); });
  const lockP = locks.request(name, async () => {
    clearTimeout(timer);
    return fn();
  });
  const winner = await Promise.race([lockP, timeoutP]);
  if (winner === '__timeout__') {
    // Lock held too long by another tab; proceed without exclusion to keep UI responsive.
    if (typeof console !== 'undefined') console.warn(`[lmsAuthLock] timed out waiting for ${name}; proceeding without lock.`);
    return fn();
  }
  return winner as R;
}

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'qm-auth', lock: lmsAuthLock },
});

export type Role = 'participant' | 'educator' | 'admin' | 'superadmin';

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
