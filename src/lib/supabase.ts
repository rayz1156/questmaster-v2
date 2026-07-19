import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * "Remember me" support.
 * The login page calls setRememberMe(...) BEFORE signing in:
 *   true  (default) -> session persists in localStorage (survives closing the browser)
 *   false           -> session lives in sessionStorage only (cleared when the browser closes)
 * The adapter reads from both stores so existing sessions keep working either way,
 * and clears both on sign-out.
 */
const REMEMBER_KEY = 'qm-remember';
const isBrowser = typeof window !== 'undefined';

function rememberEnabled(): boolean {
  if (!isBrowser) return true;
  try { return window.localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
}

const dynamicStorage = {
  getItem: (key: string): string | null => {
    if (!isBrowser) return null;
    try { return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key); } catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    if (!isBrowser) return;
    try {
      if (rememberEnabled()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    } catch { /* storage may be unavailable (private mode quirks) */ }
  },
  removeItem: (key: string): void => {
    if (!isBrowser) return;
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch { /* ignore */ }
  },
};

/** Persist the user's "Remember me" choice. Call before signInWithPassword. */
export function setRememberMe(remember: boolean): void {
  if (!isBrowser) return;
  try { window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'); } catch { /* ignore */ }
}

export const supabase = createClient(url, anon, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'qm-auth',
    storage: dynamicStorage,
  },
});

export type Role = 'participant' | 'educator' | 'admin' | 'superadmin';

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
