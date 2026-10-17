import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ serial: string }> }) {
  const { serial } = await ctx.params;
  const svc = getServiceSupabase();
  const { data: cert } = await svc.from('lms_certificates').select('serial, learner_name, course_title, creator_display_name, issued_at, revoked_at, course_id').eq('serial', serial).maybeSingle();
  if (!cert) return NextResponse.json({ valid: false, error: 'Certificate not found' }, { status: 404 });
  if (cert.revoked_at) return NextResponse.json({ valid: false, error: 'Certificate revoked', certificate: cert });
  return NextResponse.json({ valid: true, certificate: cert });
}
