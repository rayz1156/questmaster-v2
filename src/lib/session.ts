'use client';
import { useEffect, useState } from 'react';
import { supabase, Role } from './supabase';
import { useRouter } from 'next/navigation';
import type { User } from './types';

export type SessionInfo = { id: string; email: string; name: string; role: Role } | null;

let cachedUser: User | null = null;
let listenerAttached = false;

function toUser(u: any): User | null {
  if (!u) return null;
  // SECURITY: do not trust u.user_metadata.role — the user can set it via auth.updateUser({ data: { role } }).
  // Default to 'participant'; refreshUserRole() below resolves the authoritative role from lms_profiles.
  const role = ((cachedUser && cachedUser.id === u.id ? cachedUser.role : 'participant') as Role);
  const display_name = u.user_metadata?.name || (u.email?.split('@')[0] ?? 'User');
  return { id: u.id, email: u.email, display_name, role, xp: u.user_metadata?.xp ?? 1240, level: u.user_metadata?.level ?? 4 } as unknown as User;
}

async function refreshUserRole(userId: string) {
  try {
    const { data } = await supabase.from('lms_profiles').select('role').eq('id', userId).maybeSingle();
    const dbRole = (data && (data as any).role) as Role | undefined;
    if (dbRole && cachedUser && cachedUser.id === userId && cachedUser.role !== dbRole) {
      cachedUser = { ...cachedUser, role: dbRole } as User;
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('qm-auth'));
    }
  } catch { /* network/RLS errors leave role at safe default */ }
}

function ensureListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  supabase.auth.getUser().then(({ data }) => { cachedUser = toUser(data.user); window.dispatchEvent(new Event('qm-auth')); if (cachedUser) refreshUserRole(cachedUser.id); });
  supabase.auth.onAuthStateChange((_e, sess) => { cachedUser = toUser(sess?.user ?? null); window.dispatchEvent(new Event('qm-auth')); if (cachedUser) refreshUserRole(cachedUser.id); });
}

export function getSession(): User | null { ensureListener(); return cachedUser; }
export function setSession(_u: User | null) { /* no-op: managed by Supabase */ }
export async function clearSession() { cachedUser = null; await supabase.auth.signOut(); }
export async function signOut() { await clearSession(); }

export function useSession(requiredRole?: Role) {
  const [user, setUser] = useState<User | null>(cachedUser);
  const [loading, setLoading] = useState(!cachedUser);
  const router = useRouter();

  useEffect(() => {
    ensureListener();
    const apply = () => { setUser(cachedUser); setLoading(false); };
    window.addEventListener('qm-auth', apply);
    if (cachedUser) apply();
    else supabase.auth.getUser().then(({ data }) => { cachedUser = toUser(data.user); apply(); });
    return () => window.removeEventListener('qm-auth', apply);
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    const isAdminish = user.role==='admin' || user.role==='superadmin'; if (requiredRole && user.role !== requiredRole && !(requiredRole==='admin' && isAdminish)) router.replace((user.role==='educator'||user.role==='creator')?'/creator':isAdminish?'/admin/overview':'/participant/home');
  }, [loading, user, requiredRole, router]);

  return { session: user, user, loading };
}
