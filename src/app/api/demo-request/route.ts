import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.full_name || !body.work_email || !body.company_name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.work_email)) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    const supa = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { error } = await supa.from('lms_demo_requests').insert({
      full_name: String(body.full_name).slice(0, 200),
      work_email: String(body.work_email).toLowerCase().slice(0, 200),
      phone: body.phone ? String(body.phone).slice(0, 50) : null,
      company_name: String(body.company_name).slice(0, 200),
      company_size: body.company_size || null,
      industry: body.industry ? String(body.industry).slice(0, 100) : null,
      role_title: body.role_title ? String(body.role_title).slice(0, 100) : null,
      use_case: body.use_case ? String(body.use_case).slice(0, 2000) : null,
      hrdcorp_interest: !!body.hrdcorp_interest,
      source: 'website',
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
    });
    if (error) {
      console.error('demo-request insert failed', error);
      return NextResponse.json({ error: 'Could not save request' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
