/**
 * Supabase server client + auth/ownership helpers for API routes.
 * Mirrors the pattern already used in src/app/api/classes/[id]/invite/route.ts.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export function getRouteSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => cookieStore.get(n)?.value,
        set() {},
        remove() {},
      },
    }
  );
}

export async function requireUser() {
  const supa = getRouteSupabase();
  const { data } = await supa.auth.getUser();
  const user = data.user;
  if (!user) {
    return { user: null, supa, response: NextResponse.json({ error: 'Not authed' }, { status: 401 }) as NextResponse };
  }
  return { user, supa, response: null as NextResponse | null };
}

/** Verify the current user owns the class (educator). */
export async function requireClassOwner(classId: string) {
  const auth = await requireUser();
  if (auth.response) return { ...auth, klass: null as null };
  const { data: klass } = await auth.supa
    .from('qm_classes')
    .select('id, name, owner_id')
    .eq('id', classId)
    .single();
  if (!klass || klass.owner_id !== auth.user!.id) {
    return {
      ...auth,
      klass: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as NextResponse,
    };
  }
  return { ...auth, klass };
}

/** Verify the current user is owner OR enrolled member of the class (read access). */
export async function requireClassMember(classId: string) {
  const auth = await requireUser();
  if (auth.response) return { ...auth, klass: null as null };
  const { data: klass } = await auth.supa
    .from('qm_classes')
    .select('id, name, owner_id')
    .eq('id', classId)
    .single();
  if (!klass) {
    return { ...auth, klass: null, response: NextResponse.json({ error: 'Not found' }, { status: 404 }) as NextResponse };
  }
  if (klass.owner_id === auth.user!.id) {
    return { ...auth, klass };
  }
  const { data: member } = await auth.supa
    .from('qm_class_members')
    .select('user_id')
    .eq('class_id', classId)
    .eq('user_id', auth.user!.id)
    .maybeSingle();
  if (!member) {
    return {
      ...auth,
      klass: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) as NextResponse,
    };
  }
  return { ...auth, klass };
}
