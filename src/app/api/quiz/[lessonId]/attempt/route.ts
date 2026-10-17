import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase, getServiceSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST: create a new attempt for the authed learner. Body: {} (no payload).
export async function POST(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;

  const { data: lesson } = await supa.from('lms_lessons').select('id, course_id, lesson_type').eq('id', lessonId).maybeSingle();
  if (!lesson || lesson.lesson_type !== 'quiz') return NextResponse.json({ error: 'Not a quiz lesson' }, { status: 400 });

  const { data: enrol } = await supa.from('lms_enrollments').select('id').eq('course_id', lesson.course_id).eq('user_id', userId).maybeSingle();
  if (!enrol) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 });

  const { data: quiz } = await supa.from('lms_quizzes').select('id, max_attempts').eq('lesson_id', lessonId).maybeSingle();
  if (!quiz) return NextResponse.json({ error: 'Quiz not found' }, { status: 404 });

  const { data: prior } = await supa.from('lms_quiz_attempts').select('attempt_number').eq('quiz_id', quiz.id).eq('user_id', userId).order('attempt_number', { ascending: false }).limit(1);
  const lastN = prior && prior[0] ? Number(prior[0].attempt_number) : 0;
  if (quiz.max_attempts > 0 && lastN >= quiz.max_attempts) return NextResponse.json({ error: 'Max attempts reached' }, { status: 409 });

  const nextN = lastN + 1;
  const { data: created, error } = await supa.from('lms_quiz_attempts').insert({ quiz_id: quiz.id, user_id: userId, attempt_number: nextN }).select('*').single();
  if (error || !created) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
  return NextResponse.json({ attempt: created });
}

// PUT: submit attempt. Body: { attempt_id: string, answers: [{ question_id, selected_choice_ids: string[] }] }
export async function PUT(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;

  const body = (await req.json().catch(() => ({}))) as { attempt_id?: string; answers?: Array<{ question_id: string; selected_choice_ids: string[] }> };
  const attemptId = (body.attempt_id || '').toString();
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!attemptId) return NextResponse.json({ error: 'attempt_id required' }, { status: 400 });

  // Verify the attempt belongs to this user and is unsubmitted
  const { data: attempt } = await supa.from('lms_quiz_attempts').select('id, quiz_id, user_id, submitted_at').eq('id', attemptId).maybeSingle();
  if (!attempt || attempt.user_id !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (attempt.submitted_at) return NextResponse.json({ error: 'Already submitted' }, { status: 409 });

  // Use service role to read is_correct and compute grade (RLS would block direct selects)
  const svc = getServiceSupabase();
  const { data: quiz } = await svc.from('lms_quizzes').select('id, lesson_id, course_id, pass_threshold').eq('id', attempt.quiz_id).maybeSingle();
  if (!quiz || quiz.lesson_id !== lessonId) return NextResponse.json({ error: 'Quiz mismatch' }, { status: 400 });

  const { data: questions } = await svc.from('lms_quiz_questions').select('id, points, question_type').eq('quiz_id', quiz.id);
  const qById = new Map<string, any>(); for (const q of (questions || [])) qById.set(q.id, q);
  const { data: correctChoices } = await svc.from('lms_quiz_choices').select('id, question_id, is_correct').in('question_id', Array.from(qById.keys()));
  const correctByQ = new Map<string, Set<string>>();
  for (const c of (correctChoices || [])) {
    if (!correctByQ.has(c.question_id)) correctByQ.set(c.question_id, new Set());
    if (c.is_correct) correctByQ.get(c.question_id)!.add(c.id);
  }

  // Grade
  let scorePoints = 0;
  let totalPoints = 0;
  for (const q of (questions || [])) totalPoints += Number(q.points || 0);
  // Clear any prior answers for this attempt (idempotent submit)
  await svc.from('lms_quiz_answers').delete().eq('attempt_id', attemptId);

  for (const ans of answers) {
    const q = qById.get(ans.question_id);
    if (!q) continue;
    const correctSet = correctByQ.get(q.id) || new Set<string>();
    const selected = new Set((ans.selected_choice_ids || []).filter(Boolean));
    let isCorrect = false;
    if (q.question_type === 'multiple') {
      isCorrect = selected.size === correctSet.size && Array.from(selected).every(id => correctSet.has(id));
    } else {
      // single / true_false: exactly one selected, must be correct
      isCorrect = selected.size === 1 && Array.from(selected).every(id => correctSet.has(id));
    }
    const pts = isCorrect ? Number(q.points || 0) : 0;
    scorePoints += pts;
    await svc.from('lms_quiz_answers').insert({ attempt_id: attemptId, question_id: q.id, selected_choice_ids: Array.from(selected), is_correct: isCorrect, points_awarded: pts });
  }

  const percent = totalPoints > 0 ? Math.round((scorePoints / totalPoints) * 100) : 0;
  const passed = percent >= Number(quiz.pass_threshold || 0);
  const submittedAt = new Date().toISOString();
  await svc.from('lms_quiz_attempts').update({ submitted_at: submittedAt, score_points: scorePoints, total_points: totalPoints, score_percent: percent, passed }).eq('id', attemptId);

  // If passed: auto-mark lesson_progress complete
  if (passed) {
    await svc.from('lms_lesson_progress').upsert({ user_id: userId, course_id: quiz.course_id, lesson_id: lessonId, completed_at: submittedAt }, { onConflict: 'user_id,lesson_id' });
  }

  return NextResponse.json({ ok: true, score_points: scorePoints, total_points: totalPoints, score_percent: percent, passed, submitted_at: submittedAt });
}
