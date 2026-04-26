import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'qm-auth' },
});

export type Role = 'participant' | 'educator' | 'admin';

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}
