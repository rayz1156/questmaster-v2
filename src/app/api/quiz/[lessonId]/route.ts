import { NextRequest, NextResponse } from 'next/server';
import { getRouteSupabase } from '@/lib/supabase-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Choice = { id?: string; position: number; label: string; is_correct: boolean };
type Question = { id?: string; position: number; prompt: string; question_type: 'single'|'multiple'|'true_false'; points: number; explanation?: string | null; image_url?: string | null; choices: Choice[] };
type QuizPayload = {
  title: string;
  description?: string | null;
  pass_threshold: number;
  max_attempts: number;
  time_limit_seconds: number;
  shuffle_questions: boolean;
  shuffle_choices: boolean;
  show_correct_answers: boolean;
  is_gating: boolean;
  questions: Question[];
};

async function isCreatorOfLesson(supa: ReturnType<typeof getRouteSupabase>, lessonId: string, userId: string) {
  const { data } = await supa.from('lms_lessons')
    .select('id, course_id, lms_courses!inner(creator_id, lms_creators!inner(owner_id))')
    .eq('id', lessonId).maybeSingle();
  // @ts-expect-error nested join shape
  return !!data && data?.lms_courses?.lms_creators?.owner_id === userId;
}

async function isEnrolledInLesson(supa: ReturnType<typeof getRouteSupabase>, lessonId: string, userId: string) {
  const { data: lesson } = await supa.from('lms_lessons').select('course_id').eq('id', lessonId).maybeSingle();
  if (!lesson) return false;
  const { data: enrol } = await supa.from('lms_enrollments').select('id').eq('course_id', lesson.course_id).eq('user_id', userId).maybeSingle();
  return !!enrol;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;

  const creator = await isCreatorOfLesson(supa, lessonId, userId);
  const enrolled = creator || await isEnrolledInLesson(supa, lessonId, userId);
  if (!enrolled) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: quiz } = await supa.from('lms_quizzes').select('*').eq('lesson_id', lessonId).maybeSingle();
  if (!quiz) return NextResponse.json({ quiz: null, questions: [] });

  const { data: questions } = await supa.from('lms_quiz_questions').select('*').eq('quiz_id', quiz.id).order('position');
  const qIds = (questions || []).map(q => q.id);
  const { data: choices } = qIds.length ? await supa.from('lms_quiz_choices').select('*').in('question_id', qIds).order('position') : { data: [] as any[] };

  const byQ = new Map<string, any[]>();
  for (const c of (choices || [])) {
    const arr = byQ.get(c.question_id) || [];
    // Strip is_correct for learners (unless creator)
    arr.push(creator ? c : { id: c.id, question_id: c.question_id, position: c.position, label: c.label });
    byQ.set(c.question_id, arr);
  }
  const merged = (questions || []).map(q => ({ ...q, choices: byQ.get(q.id) || [] }));
  return NextResponse.json({ quiz, questions: merged, role: creator ? 'creator' : 'learner' });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await ctx.params;
  const supa = getRouteSupabase(req);
  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = userData.user.id;

  if (!(await isCreatorOfLesson(supa, lessonId, userId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: lesson } = await supa.from('lms_lessons').select('id, course_id, lesson_type').eq('id', lessonId).maybeSingle();
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });
  if (lesson.lesson_type !== 'quiz') return NextResponse.json({ error: 'Lesson is not a quiz' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Partial<QuizPayload>;
  const title = (body.title || 'Quiz').toString().slice(0, 200);
  const description = body.description ? body.description.toString().slice(0, 2000) : null;
  const pass_threshold = Math.max(0, Math.min(100, Number(body.pass_threshold ?? 70)));
  const max_attempts = Math.max(0, Number(body.max_attempts ?? 0));
  const time_limit_seconds = Math.max(0, Number(body.time_limit_seconds ?? 0));
  const shuffle_questions = !!body.shuffle_questions;
  const shuffle_choices = !!body.shuffle_choices;
  const show_correct_answers = body.show_correct_answers ?? true;
  const is_gating = !!body.is_gating;
  const questions = Array.isArray(body.questions) ? body.questions : [];

  // Upsert quiz row (one per lesson)
  let quizId: string;
  const { data: existing } = await supa.from('lms_quizzes').select('id').eq('lesson_id', lessonId).maybeSingle();
  if (existing) {
    quizId = existing.id;
    const { error } = await supa.from('lms_quizzes').update({ title, description, pass_threshold, max_attempts, time_limit_seconds, shuffle_questions, shuffle_choices, show_correct_answers, is_gating, updated_at: new Date().toISOString() }).eq('id', quizId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: inserted, error } = await supa.from('lms_quizzes').insert({ lesson_id: lessonId, course_id: lesson.course_id, title, description, pass_threshold, max_attempts, time_limit_seconds, shuffle_questions, shuffle_choices, show_correct_answers, is_gating }).select('id').single();
    if (error || !inserted) return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
    quizId = inserted.id;
  }

  // Replace questions+choices wholesale (delete then insert; cascades clean lms_quiz_choices)
  await supa.from('lms_quiz_questions').delete().eq('quiz_id', quizId);
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qType = (q.question_type === 'multiple' || q.question_type === 'true_false') ? q.question_type : 'single';
    const { data: qRow, error: qErr } = await supa.from('lms_quiz_questions').insert({ quiz_id: quizId, position: i, prompt: (q.prompt || '').toString().slice(0, 2000), question_type: qType, points: Math.max(0, Number(q.points ?? 1)), explanation: q.explanation ? q.explanation.toString().slice(0, 2000) : null, image_url: q.image_url || null }).select('id').single();
    if (qErr || !qRow) return NextResponse.json({ error: qErr?.message || 'Question insert failed' }, { status: 500 });
    const choices = Array.isArray(q.choices) ? q.choices : [];
    for (let j = 0; j < choices.length; j++) {
      const c = choices[j];
      const { error: cErr } = await supa.from('lms_quiz_choices').insert({ question_id: qRow.id, position: j, label: (c.label || '').toString().slice(0, 1000), is_correct: !!c.is_correct });
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, quiz_id: quizId, question_count: questions.length });
}
