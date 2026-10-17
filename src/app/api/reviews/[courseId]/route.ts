import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params;
  const svc = getServiceSupabase();
  const { data: reviews } = await svc.from('lms_reviews').select('id, user_id, rating, review_text, created_at').eq('course_id', courseId).eq('is_published', true).order('created_at', { ascending: false }).limit(50);
  const list = (reviews || []) as Array<{ id: string; user_id: string; rating: number; review_text: string | null; created_at: string }>;
  // Enrich with user display names from auth.users (raw_user_meta_data.full_name fallback to email prefix)
  const userIds = Array.from(new Set(list.map(r => r.user_id)));
  let nameById = new Map<string, string>();
  if (userIds.length) {
    const { data: users } = await svc.schema('auth' as any).from('users').select('id, email, raw_user_meta_data').in('id', userIds);
    for (const u of (users || []) as any[]) {
      const meta = u?.raw_user_meta_data || {};
      const name = meta.full_name || meta.name || (u.email ? String(u.email).split('@')[0] : 'Learner');
      nameById.set(u.id, name);
    }
  }
  const enriched = list.map(r => ({ id: r.id, rating: r.rating, review_text: r.review_text, created_at: r.created_at, reviewer_name: nameById.get(r.user_id) || 'Learner' }));
  const total = list.length;
  const avg = total > 0 ? Math.round((list.reduce((acc, r) => acc + Number(r.rating || 0), 0) / total) * 10) / 10 : 0;
  return NextResponse.json({ reviews: enriched, total, average: avg });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;
  const body = (await req.json().catch(() => ({}))) as { rating?: number; review_text?: string };
  const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating ?? 0))));
  if (rating < 1) return NextResponse.json({ error: 'Rating must be 1-5' }, { status: 400 });
  const reviewText = body.review_text ? body.review_text.toString().slice(0, 2000) : null;

  // Confirm enrollment
  const { data: enrol } = await supa.from('lms_enrollments').select('id').eq('course_id', courseId).eq('user_id', userId).maybeSingle();
  if (!enrol) return NextResponse.json({ error: 'Must be enrolled to review' }, { status: 403 });

  // Upsert
  const { data: existing } = await supa.from('lms_reviews').select('id').eq('course_id', courseId).eq('user_id', userId).maybeSingle();
  if (existing) {
    const { error } = await supa.from('lms_reviews').update({ rating, review_text: reviewText, updated_at: new Date().toISOString() }).eq('id', existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: existing.id, updated: true });
  }
  const { data: inserted, error } = await supa.from('lms_reviews').insert({ course_id: courseId, user_id: userId, rating, review_text: reviewText }).select('id').single();
  if (error || !inserted) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
  return NextResponse.json({ ok: true, id: inserted.id, created: true });
}
