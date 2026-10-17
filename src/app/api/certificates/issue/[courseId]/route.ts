import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function makeSerial() {
  // KZN-YYYYMMDD-XXXX (8 random alnum)
  const d = new Date();
  const yyyymmdd = `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `KZN-${yyyymmdd}-${suffix}`;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;

  const svc = getServiceSupabase();

  // Already issued?
  const { data: existing } = await svc.from('lms_certificates').select('*').eq('course_id', courseId).eq('user_id', userId).maybeSingle();
  if (existing) return NextResponse.json({ certificate: existing, already: true });

  // Confirm enrollment
  const { data: enrol } = await svc.from('lms_enrollments').select('id').eq('course_id', courseId).eq('user_id', userId).maybeSingle();
  if (!enrol) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });

  // Check completion: all lessons complete
  const { data: lessons } = await svc.from('lms_lessons').select('id').eq('course_id', courseId);
  const totalLessons = (lessons || []).length;
  if (totalLessons === 0) return NextResponse.json({ error: 'Course has no lessons' }, { status: 400 });
  const { data: progress } = await svc.from('lms_lesson_progress').select('lesson_id').eq('course_id', courseId).eq('user_id', userId);
  const completed = (progress || []).length;
  if (completed < totalLessons) return NextResponse.json({ error: 'Course not fully completed', completed, totalLessons }, { status: 400 });

  // Resolve course + creator + learner display name
  const { data: course } = await svc.from('lms_courses').select('id, title, creator_id').eq('id', courseId).maybeSingle();
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
  const { data: creator } = await svc.from('lms_creators').select('display_name').eq('id', course.creator_id).maybeSingle();
  const { data: authUser } = await svc.schema('auth' as any).from('users').select('email, raw_user_meta_data').eq('id', userId).maybeSingle();
  const meta = (authUser as any)?.raw_user_meta_data || {};
  const learnerName = meta.full_name || meta.name || ((authUser as any)?.email ? String((authUser as any).email).split('@')[0] : 'Learner');

  // Generate unique serial (retry once on collision)
  let serial = makeSerial();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { error } = await svc.from('lms_certificates').insert({
      serial, course_id: courseId, user_id: userId,
      learner_name: learnerName, course_title: course.title, creator_display_name: (creator as any)?.display_name || 'Creator'
    });
    if (!error) break;
    if (error && /duplicate/i.test(error.message) && /serial/i.test(error.message)) { serial = makeSerial(); continue; }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { data: cert } = await svc.from('lms_certificates').select('*').eq('serial', serial).maybeSingle();
  return NextResponse.json({ certificate: cert, issued: true });
}
