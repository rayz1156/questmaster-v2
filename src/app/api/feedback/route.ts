import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';
import { ralatJson } from '@/lib/i18n/ralatApi';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const type = String(body.type || 'other');
    const subject = String(body.subject || '').trim();
    const message = String(body.message || '').trim();
    const email = body.email ? String(body.email).trim() : null;
    const page_url = body.page_url ? String(body.page_url).slice(0, 500) : null;

    if (!subject || !message) {
      return ralatJson('Subject and message are required.', 400);
    }
    if (subject.length > 200 || message.length > 4000) {
      return ralatJson('Subject or message too long.', 400);
    }
    if (!['bug', 'idea', 'question', 'other'].includes(type)) {
      return ralatJson('Invalid type.', 400);
    }

    const supa = getRouteSupabase(req);
    const { data: userData } = await supa.auth.getUser();
    const user_id = userData?.user?.id || null;
    const user_email = userData?.user?.email || email || null;

    const ua = req.headers.get('user-agent')?.slice(0, 300) || null;

    const { error } = await supa.from('qm_feedback').insert({
      user_id,
      user_email,
      type,
      subject,
      message,
      page_url,
      user_agent: ua,
      status: 'open',
    });

    if (error) {
      console.error('feedback insert failed', error);
      return ralatJson('Could not save feedback.', 500);
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return ralatJson(msg, 500);
  }
}
