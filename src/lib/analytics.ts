// Lightweight client-side analytics for Kuizen.
// Soft-fails: never breaks the page if tracking fails.

import { supabase } from '@/lib/supabaseClient';

export type AnalyticsEvent =
  | 'page_view'
  | 'login'
  | 'logout'
  | 'quest_open'
  | 'quest_submit'
  | 'link_click'
  | 'class_join'
  | 'team_join'
  | 'leaderboard_view'
  | 'help_open'
  | 'feedback_submit';

function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sid = sessionStorage.getItem('qm_sid');
  if (!sid) {
    sid = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)) + '-' + Date.now();
    sessionStorage.setItem('qm_sid', sid);
  }
  return sid;
}

export async function track(
  event_type: AnalyticsEvent,
  payload?: { path?: string; class_id?: string; activity_id?: string; metadata?: Record<string, unknown> },
) {
  try {
    if (typeof window === 'undefined') return;
    const { data: { session } } = await supabase.auth.getSession();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const body = JSON.stringify({
      event_type,
      path: payload?.path ?? window.location.pathname,
      class_id: payload?.class_id ?? null,
      activity_id: payload?.activity_id ?? null,
      metadata: payload?.metadata ?? null,
      session_id: getSessionId(),
    });
    // Use keepalive so events fire even on page unload.
    fetch('/api/analytics/track', { method: 'POST', headers, body, keepalive: true }).catch(() => {});
  } catch {
    /* swallow */
  }
}
