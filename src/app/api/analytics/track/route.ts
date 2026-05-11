import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

const ALLOWED = new Set([
  'page_view', 'login', 'logout', 'quest_open', 'quest_submit',
  'link_click', 'class_join', 'team_join', 'leaderboard_view',
  'help_open', 'feedback_submit',
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event_type = String(body.event_type || '');
    if (!ALLOWED.has(event_type)) {
      return NextResponse.json({ ok: true, skipped: true });
    }
    const path = body.path ? String(body.path).slice(0, 300) : null;
    const class_id = body.class_id ? String(body.class_id) : null;
    const activity_id = body.activity_id ? String(body.activity_id) : null;
    const session_id = body.session_id ? String(body.session_id).slice(0, 64) : null;
    const metadata = body.metadata && typeof body.metadata === 'object' ? body.metadata : null;

    const supa = getRouteSupabase(req);
    const { data: userData } = await supa.auth.getUser();
    const user_id = userData?.user?.id || null;

    // Soft-fail: never break the page if analytics insert fails.
    const { error } = await supa.from('qm_analytics_events').insert({
      user_id,
      event_type,
      path,
      class_id,
      activity_id,
      session_id,
      metadata,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
    });
    if (error) {
      console.warn('analytics insert failed', error.message);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
