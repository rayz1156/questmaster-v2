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
  const role = (u.user_metadata?.role as Role) || 'participant';
  const name = u.user_metadata?.name || (u.email?.split('@')[0] ?? 'User');
  return { id: u.id, email: u.email, name, role, xp: u.user_metadata?.xp ?? 1240, level: u.user_metadata?.level ?? 4 } as unknown as User;
}

function ensureListener() {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  supabase.auth.getUser().then(({ data }) => { cachedUser = toUser(data.user); window.dispatchEvent(new Event('qm-auth')); });
  supabase.auth.onAuthStateChange((_e, s) => { cachedUser = toUser(s?.user ?? null); window.dispatchEvent(new Event('qm-auth')); });
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
    if (requiredRole && user.role !== requiredRole) router.replace(`/${user.role}/home`);
  }, [loading, user, requiredRole, router]);

  return { session: user, user, loading };
}
