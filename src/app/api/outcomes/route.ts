import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const class_id = url.searchParams.get('class_id');
  if (!class_id) return NextResponse.json({ error: 'class_id required' }, { status: 400 });
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data, error } = await supa
    .from('qm_learning_outcomes')
    .select('id, class_id, code, label, description, created_at, updated_at')
    .eq('class_id', class_id)
    .order('code', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(req: NextRequest) {
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { class_id, code, label, description } = body as { class_id?: string; code?: string; label?: string; description?: string };
  if (!class_id || !label) return NextResponse.json({ error: 'class_id and label required' }, { status: 400 });
  const { data, error } = await supa
    .from('qm_learning_outcomes')
    .insert({ class_id, code: code || null, label, description: description || null, created_by: userData.user.id })
    .select('id, class_id, code, label, description, created_at, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
