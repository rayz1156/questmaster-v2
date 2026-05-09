/**
 * Supabase server client + auth/ownership helpers for API routes.
 *
 * IMPORTANT: This app stores the Supabase session in the browser's
 * localStorage (storageKey 'qm-auth' in src/lib/supabase.ts) and NOT in
 * cookies. Therefore the standard @supabase/ssr cookie pattern doesn't
 * find a session. To authenticate API requests we read the access_token
 * from an `Authorization: Bearer <token>` header that the client sends.
 *
 * Falls back to cookie-based auth when no header is present, for any
 * routes that may rely on it (e.g. existing /api/classes/[id]/invite).
 */
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

function bearerFromReq(req?: NextRequest | Request | null): string | null {
  if (!req) return null;
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/** Build a Supabase client for use in route handlers.
 *  If a Bearer token is present on the request, the client is bound to
 *  that user (RLS will see auth.uid()). Otherwise we fall back to the
 *  cookie-based @supabase/ssr client. */
export function getRouteSupabase(req?: NextRequest | Request | null) {
  const token = bearerFromReq(req);
  if (token) {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    );
  }
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
    },
  );
}

export async function requireUser(req?: NextRequest | Request | null) {
  const supa = getRouteSupabase(req);
  const { data } = await supa.auth.getUser();
  const user = data.user;
  if (!user) {
    return { user: null, supa, response: NextResponse.json({ error: 'Not authed' }, { status: 401 }) as NextResponse };
  }
  return { user, supa, response: null as NextResponse | null };
}

/** Verify the current user owns the class (educator). */
export async function requireClassOwner(req: NextRequest | Request | null, classId: string) {
  const auth = await requireUser(req);
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
export async function requireClassMember(req: NextRequest | Request | null, classId: string) {
  const auth = await requireUser(req);
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
