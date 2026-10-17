import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;

  // Verify creator owns this course
  const { data: course } = await supa.from('lms_courses').select('id, title, creator_id, lms_creators!inner(owner_id, display_name, slug)').eq('id', courseId).maybeSingle() as any;
  if (!course || course?.lms_creators?.owner_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const svc = getServiceSupabase();

  // Enrollments
  const { count: enrollmentsCount } = await svc.from('lms_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', courseId);

  // Total lessons
  const { data: lessons } = await svc.from('lms_lessons').select('id').eq('course_id', courseId);
  const totalLessons = (lessons || []).length;

  // Per-user progress (count lesson completions per user)
  const { data: progress } = await svc.from('lms_lesson_progress').select('user_id').eq('course_id', courseId);
  const completionsByUser = new Map<string, number>();
  for (const p of (progress || [])) completionsByUser.set(p.user_id, (completionsByUser.get(p.user_id) || 0) + 1);
  let fullyCompleted = 0;
  for (const n of Array.from(completionsByUser.values())) { if (totalLessons > 0 && n >= totalLessons) fullyCompleted++; }
  const completionRate = (enrollmentsCount && enrollmentsCount > 0) ? Math.round((fullyCompleted / enrollmentsCount) * 100) : 0;

  // Reviews
  const { data: reviews } = await svc.from('lms_reviews').select('rating').eq('course_id', courseId).eq('is_published', true);
  const revCount = (reviews || []).length;
  const avgRating = revCount > 0 ? Math.round((reviews!.reduce((acc: number, r: any) => acc + Number(r.rating || 0), 0) / revCount) * 10) / 10 : 0;

  // Quiz pass rate (across all quiz attempts on this course)
  const { data: quizzes } = await svc.from('lms_quizzes').select('id').eq('course_id', courseId);
  const qIds = (quizzes || []).map((q: any) => q.id);
  let attemptsCount = 0; let passedCount = 0;
  if (qIds.length) {
    const { data: attempts } = await svc.from('lms_quiz_attempts').select('passed, submitted_at').in('quiz_id', qIds).not('submitted_at', 'is', null);
    for (const a of (attempts || [])) { attemptsCount++; if (a.passed) passedCount++; }
  }
  const quizPassRate = attemptsCount > 0 ? Math.round((passedCount / attemptsCount) * 100) : 0;

  // Certificates issued
  const { count: certsCount } = await svc.from('lms_certificates').select('id', { count: 'exact', head: true }).eq('course_id', courseId).is('revoked_at', null);

  return NextResponse.json({
    course: { id: course.id, title: course.title },
    enrollments: enrollmentsCount || 0,
    total_lessons: totalLessons,
    fully_completed: fullyCompleted,
    completion_rate_pct: completionRate,
    reviews_count: revCount,
    average_rating: avgRating,
    quiz_attempts: attemptsCount,
    quiz_passes: passedCount,
    quiz_pass_rate_pct: quizPassRate,
    certificates_issued: certsCount || 0,
  });
}
