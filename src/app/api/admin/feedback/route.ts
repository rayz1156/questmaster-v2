import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return { ok: false, status: 401 as const, supa };
  const { data: profile } = await supa.from('qm_profiles').select('role').eq('id', uid).single();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== 'admin' && role !== 'superadmin') return { ok: false, status: 403 as const, supa };
  return { ok: true as const, supa };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status });
  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  let q = auth.supa.from('qm_feedback').select('id,user_email,type,subject,message,page_url,status,created_at').order('created_at', { ascending: false }).limit(200);
  if (status) q = q.eq('status', status);
  if (type) q = q.eq('type', type);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Forbidden' }, { status: auth.status });
  const body = await req.json().catch(() => ({}));
  const { id, status } = body as { id?: string; status?: string };
  if (!id || !['open', 'in_review', 'resolved', 'closed'].includes(status ?? '')) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }
  const { error } = await auth.supa.from('qm_feedback').update({ status }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
