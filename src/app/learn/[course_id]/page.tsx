'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MdView } from '@/components/MdView';
import QuizPlayer from '@/components/QuizPlayer';
import ReviewsPanel from '@/components/ReviewsPanel';
import CertificateBadge from '@/components/CertificateBadge';

type Course = { id: string; title: string; creator_id: string };
type Section = { id: string; title: string; position: number };
type Lesson = {
  id: string; section_id: string; course_id: string; title: string; position: number;
  lesson_type: 'video'|'article'|'resource'|'quiz';
  duration_seconds: number | null; is_preview: boolean;
  adilo_video_id: string | null; article_md: string | null;
  filelu_url: string | null; resource_filename: string | null;
};
type Creator = { slug: string; display_name: string };

export default function PlayerPage() {
  const params = useParams<{ course_id: string }>();
  const courseId = params.course_id;
  const router = useRouter();

  const [course, setCourse] = useState<Course | null>(null);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace(`/login?next=/learn/${courseId}`); return; }

    const { data: enrol } = await supabase.from('lms_enrollments').select('id, last_lesson_id').eq('user_id', user.id).eq('course_id', courseId).maybeSingle();
    if (!enrol) { setAccessError('You are not enrolled in this course.'); setLoading(false); return; }

    const { data: c } = await supabase.from('lms_courses').select('id, title, creator_id').eq('id', courseId).maybeSingle();
    if (!c) { setAccessError('Course not found.'); setLoading(false); return; }
    setCourse(c as Course);

    const { data: cr } = await supabase.from('lms_creators').select('slug, display_name').eq('id', (c as Course).creator_id).maybeSingle();
    if (cr) setCreator(cr as Creator);

    const { data: secs } = await supabase.from('lms_course_sections').select('id, title, position').eq('course_id', courseId).order('position');
    setSections((secs ?? []) as Section[]);

    const { data: les } = await supabase.from('lms_lessons').select('*').eq('course_id', courseId).order('position');
    const list = (les ?? []) as Lesson[];
    setLessons(list);

    const { data: prog } = await supabase.from('lms_lesson_progress').select('lesson_id').eq('user_id', user.id).eq('course_id', courseId);
    setCompleted(new Set(((prog ?? []) as Array<{ lesson_id: string }>).map((p) => p.lesson_id)));

    const enrolRow = enrol as { last_lesson_id: string | null };
    const first = enrolRow.last_lesson_id || (list[0]?.id ?? null);
    setActiveLessonId(first);
    setLoading(false);
  }, [courseId, router]);

  useEffect(() => { load(); }, [load]);

  const activeLesson = useMemo(() => lessons.find((l) => l.id === activeLessonId) || null, [lessons, activeLessonId]);
  const orderedLessons = useMemo(() => {
    const secOrder = new Map(sections.map((s, i) => [s.id, i] as const));
    return [...lessons].sort((a, b) => (secOrder.get(a.section_id) ?? 99) - (secOrder.get(b.section_id) ?? 99) || a.position - b.position);
  }, [sections, lessons]);
  const activeIdx = activeLesson ? orderedLessons.findIndex((l) => l.id === activeLesson.id) : -1;

  async function markComplete() {
    if (!activeLesson || !course) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setMarking(true);
    const wasCompleted = completed.has(activeLesson.id);
    if (wasCompleted) {
      await supabase.from('lms_lesson_progress').delete().eq('user_id', user.id).eq('lesson_id', activeLesson.id);
      const next = new Set(completed); next.delete(activeLesson.id); setCompleted(next);
    } else {
      await supabase.from('lms_lesson_progress').insert({ user_id: user.id, lesson_id: activeLesson.id, course_id: course.id });
      const next = new Set(completed); next.add(activeLesson.id); setCompleted(next);
    }
    setMarking(false);
  }

  async function setActive(id: string) {
    setActiveLessonId(id);
    const { data: { user } } = await supabase.auth.getUser();
    if (user && course) {
      await supabase.from('lms_enrollments').update({ last_lesson_id: id }).eq('user_id', user.id).eq('course_id', course.id);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (accessError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-rose-600">{accessError}</div>
        <Link href="/home" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm">Back to my learning</Link>
      </div>
    );
  }
  if (!course) return null;

  const completedCount = completed.size;
  const totalLessons = lessons.length;
  const pct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="px-5 py-3 flex items-center gap-4">
          <Link href="/home" className="text-sm text-slate-300 hover:text-white">← My learning</Link>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{course.title}</div>
            {creator && <div className="text-xs text-slate-400 truncate">by {creator.display_name}</div>}
          </div>
          <div className="text-xs text-slate-300 whitespace-nowrap">{completedCount}/{totalLessons} · {pct}%</div>
        </div>
        <div className="h-1 bg-slate-800">
          <div className="h-1 bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <aside className="w-72 shrink-0 bg-white border-r border-slate-200 overflow-y-auto">
          {sections.map((s) => {
            const secLessons = lessons.filter((l) => l.section_id === s.id).sort((a, b) => a.position - b.position);
            return (
              <div key={s.id} className="border-b border-slate-100">
                <div className="px-4 py-2.5 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 font-medium">{s.title}</div>
                <ul>
                  {secLessons.map((l) => {
                    const isActive = l.id === activeLessonId;
                    const isDone = completed.has(l.id);
                    return (
                      <li key={l.id}>
                        <button onClick={() => setActive(l.id)} className={`w-full text-left px-4 py-2.5 flex items-center gap-3 text-sm border-l-2 ${isActive ? 'border-emerald-600 bg-emerald-50' : 'border-transparent hover:bg-slate-50'}`}>
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${isDone ? 'bg-emerald-600 text-white' : 'border border-slate-300 text-slate-400'}`}>{isDone ? '✓' : ''}</span>
                          <span className={`flex-1 ${isActive ? 'text-emerald-900 font-medium' : 'text-slate-700'}`}>{l.title}</span>
                          <span className="text-xs text-slate-400">{l.lesson_type.slice(0, 3)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          {!activeLesson ? (
            <div className="p-10 text-center text-slate-500">Pick a lesson on the left to begin.</div>
          ) : (
            <div className="max-w-4xl mx-auto px-8 py-8">
              <div className="text-xs uppercase tracking-wide text-emerald-700 font-medium">{activeLesson.lesson_type}</div>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{activeLesson.title}</h1>

              <div className="mt-6">
                {activeLesson.lesson_type === 'video' && (
                  activeLesson.adilo_video_id ? (
                    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
                      <iframe src={`https://adilo.com/embed/${activeLesson.adilo_video_id}`} className="w-full h-full" allow="autoplay; fullscreen" allowFullScreen />
                    </div>
                  ) : (
                    <div className="aspect-video w-full rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">No video uploaded yet.</div>
                  )
                )}
                {activeLesson.lesson_type === 'article' && (
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <MdView source={activeLesson.article_md || ''} />
                  </div>
                )}
                {activeLesson.lesson_type === 'resource' && (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{activeLesson.resource_filename || 'Resource'}</div>
                      <div className="text-sm text-slate-500 mt-1">Downloadable file</div>
                    </div>
                    {activeLesson.filelu_url ? (
                      <a href={activeLesson.filelu_url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Download ↓</a>
                    ) : (
                      <span className="text-sm text-slate-400">No file yet</span>
                    )}
                  </div>
                )}
                {activeLesson.lesson_type === 'quiz' && (
                  <QuizPlayer lessonId={activeLesson.id} onPass={() => setCompleted(prev => { const n = new Set(prev); n.add(activeLesson.id); return n; })} />
                )}
              </div>

              <div className="mt-8 flex items-center justify-between gap-3 pt-6 border-t border-slate-200">
                <button onClick={() => activeIdx > 0 && setActive(orderedLessons[activeIdx - 1].id)} disabled={activeIdx <= 0} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed">← Previous</button>
                <button onClick={markComplete} disabled={marking} className={`px-5 py-2 rounded-lg text-sm font-medium transition ${completed.has(activeLesson.id) ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'} disabled:opacity-60`}>
                  {completed.has(activeLesson.id) ? '✓ Completed (click to undo)' : 'Mark as complete'}
                </button>
                <button onClick={() => activeIdx < orderedLessons.length - 1 && setActive(orderedLessons[activeIdx + 1].id)} disabled={activeIdx < 0 || activeIdx >= orderedLessons.length - 1} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">Next →</button>
              </div>
              <CertificateBadge courseId={courseId} eligible={!!course && orderedLessons.length > 0 && completed.size >= orderedLessons.length} />
            <section className="mt-10 pt-8 border-t border-slate-200">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Course reviews</h2>
              <ReviewsPanel courseId={courseId} canReview={true} />
            </section>
          </div>
          )}
        </main>
      </div>
    </div>
  );
}
