'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MdEditor } from '@/components/MdEditor';
import S5Uploader from '@/components/S5Uploader';
import QuizBuilder from '@/components/QuizBuilder';
import AnalyticsPanel from '@/components/AnalyticsPanel';

type Course = {
  id: string;
  creator_id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description_md: string | null;
  cover_url: string | null;
  level: string | null;
  is_free: boolean;
  price_cents: number;
  currency: string;
  is_published: boolean;
  what_youll_learn: string[] | null;
  requirements: string[] | null;
};

type Section = { id: string; title: string; position: number };
type Lesson = {
  id: string;
  section_id: string;
  course_id: string;
  title: string;
  position: number;
  lesson_type: 'video' | 'article' | 'resource' | 'quiz';
  duration_seconds: number | null;
  is_preview: boolean;
  adilo_video_id: string | null;
  article_md: string | null;
  filelu_url: string | null;
  resource_filename: string | null;
};

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{children}</button>
  );
}

export default function EditCoursePage() {
  const params = useParams<{ id: string }>();
  const courseId = params.id;

  const [tab, setTab] = useState<'curriculum' | 'settings' | 'publish' | 'analytics'>('curriculum');
  const [course, setCourse] = useState<Course | null>(null);
  const [creatorSlug, setCreatorSlug] = useState<string>('');
  const [sections, setSections] = useState<Section[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: c } = await supabase.from('lms_courses').select('*').eq('id', courseId).maybeSingle();
    if (!c) { setError('Course not found.'); setLoading(false); return; }
    setCourse(c as Course);
    const { data: cr } = await supabase.from('lms_creators').select('slug').eq('id', (c as Course).creator_id).maybeSingle();
    if (cr) setCreatorSlug((cr as { slug: string }).slug);
    const { data: secs } = await supabase.from('lms_course_sections').select('*').eq('course_id', courseId).order('position');
    setSections((secs ?? []) as Section[]);
    const { data: les } = await supabase.from('lms_lessons').select('*').eq('course_id', courseId).order('position');
    setLessons((les ?? []) as Lesson[]);
    setLoading(false);
  }, [courseId]);

  useEffect(() => { load(); }, [load]);

  async function updateCourse(patch: Partial<Course>) {
    if (!course) return;
    setSaving(true);
    const { error: e } = await supabase.from('lms_courses').update(patch).eq('id', course.id);
    setSaving(false);
    if (e) { setError(e.message); return; }
    setCourse(c => (c ? { ...c, ...patch } : c));
  }

  async function addSection() {
    if (!course) return;
    const nextPos = sections.length > 0 ? Math.max(...sections.map((s) => s.position)) + 1 : 1;
    const { data, error: e } = await supabase
      .from('lms_course_sections')
      .insert({ course_id: course.id, title: `Section ${nextPos}`, position: nextPos })
      .select('*')
      .single();
    if (e || !data) { setError(e?.message || 'Could not add section.'); return; }
    setSections([...sections, data as Section]);
  }

  async function updateSection(id: string, patch: Partial<Section>) {
    const { error: e } = await supabase.from('lms_course_sections').update(patch).eq('id', id);
    if (e) { setError(e.message); return; }
    setSections(arr => arr.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function deleteSection(id: string) {
    if (!confirm('Delete this section and all its lessons?')) return;
    const { error: e } = await supabase.from('lms_course_sections').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setSections(arr => arr.filter((s) => s.id !== id));
    setLessons(arr => arr.filter((l) => l.section_id !== id));
  }

  async function addLesson(sectionId: string, lesson_type: Lesson['lesson_type']) {
    if (!course) return;
    const sectionLessons = lessons.filter((l) => l.section_id === sectionId);
    const nextPos = sectionLessons.length > 0 ? Math.max(...sectionLessons.map((l) => l.position)) + 1 : 1;
    const base: Record<string, unknown> = {
      course_id: course.id,
      section_id: sectionId,
      title: `New ${lesson_type} lesson`,
      position: nextPos,
      lesson_type,
      is_preview: false,
      duration_seconds: 0,
    };
    if (lesson_type === 'video') base.adilo_video_id = '';
    if (lesson_type === 'article') base.article_md = '';
    if (lesson_type === 'resource') { base.filelu_url = ''; base.resource_filename = ''; }
    const { data, error: e } = await supabase.from('lms_lessons').insert(base).select('*').single();
    if (e || !data) { setError(e?.message || 'Could not add lesson.'); return; }
    setLessons([...lessons, data as Lesson]);
    setActiveLessonId((data as Lesson).id);
  }

  async function updateLesson(id: string, patch: Partial<Lesson>) {
    const { error: e } = await supabase.from('lms_lessons').update(patch).eq('id', id);
    if (e) { setError(e.message); return; }
    setLessons(arr => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  async function deleteLesson(id: string) {
    if (!confirm('Delete this lesson?')) return;
    const { error: e } = await supabase.from('lms_lessons').delete().eq('id', id);
    if (e) { setError(e.message); return; }
    setLessons(arr => arr.filter((l) => l.id !== id));
    if (activeLessonId === id) setActiveLessonId(null);
  }

  const activeLesson = useMemo(() => lessons.find((l) => l.id === activeLessonId) || null, [lessons, activeLessonId]);

  if (loading) return <div className="p-10 text-center text-slate-500">Loading…</div>;
  if (!course) return <div className="p-10 text-center text-rose-600">{error || 'Course not found.'}</div>;

  return (
    <div className="max-w-6xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/creator/courses" className="text-sm text-slate-500 hover:text-slate-700">← Back to courses</Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{course.title}</h1>
          <p className="text-sm text-slate-500">{course.is_published ? 'Published' : 'Draft'} · {lessons.length} lessons</p>
        </div>
        <div className="flex items-center gap-2">
          {saving && <span className="text-xs text-slate-400">Saving…</span>}
          
        </div>
      </div>

      <div className="mt-6 border-b border-slate-200 flex gap-2">
        <Tab active={tab === 'curriculum'} onClick={() => setTab('curriculum')}>Curriculum</Tab>
        <Tab active={tab === 'settings'} onClick={() => setTab('settings')}>Settings</Tab>
        <Tab active={tab === 'publish'} onClick={() => setTab('publish')}>Publish</Tab>
        <Tab active={tab === 'analytics'} onClick={() => setTab('analytics')}>Analytics</Tab>
      </div>

      {error && <div className="mt-4 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">{error}</div>}

      {tab === 'curriculum' && (
        <div className="mt-6 grid lg:grid-cols-[1fr,1.4fr] gap-6">
          <div className="space-y-4">
            {sections.length === 0 && (
              <div className="p-10 text-center border-2 border-dashed border-slate-200 rounded-xl">
                <p className="text-slate-500">No sections yet. Sections group your lessons (e.g. "Week 1").</p>
                <button onClick={addSection} className="mt-3 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">+ Add section</button>
              </div>
            )}
            {sections.map((s) => {
              const secLessons = lessons.filter((l) => l.section_id === s.id).sort((a, b) => a.position - b.position);
              return (
                <div key={s.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <input value={s.title} onChange={(e) => setSections(sections.map((x) => x.id === s.id ? { ...x, title: e.target.value } : x))} onBlur={(e) => updateSection(s.id, { title: e.target.value })} className="flex-1 bg-transparent text-sm font-medium outline-none focus:bg-white px-2 py-1 rounded" />
                    <button onClick={() => deleteSection(s.id)} className="text-xs text-slate-400 hover:text-rose-600">Delete</button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {secLessons.map((l) => (
                      <button key={l.id} onClick={() => setActiveLessonId(l.id)} className={`w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition ${activeLessonId === l.id ? 'bg-emerald-50' : ''}`}>
                        <span className="text-xs uppercase tracking-wide text-slate-400 w-16">{l.lesson_type}</span>
                        <span className="flex-1 text-sm text-slate-800 truncate">{l.title}</span>
                        {l.is_preview && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">preview</span>}
                      </button>
                    ))}
                  </div>
                  <div className="px-4 py-3 bg-slate-50/50 border-t border-slate-100 flex flex-wrap gap-2">
                    {(['video', 'article', 'resource', 'quiz'] as const).map((t) => (
                      <button key={t} onClick={() => addLesson(s.id, t)} className="text-xs px-2.5 py-1 rounded border border-slate-200 bg-white hover:border-emerald-400 hover:text-emerald-700">+ {t}</button>
                    ))}
                  </div>
                </div>
              );
            })}
            {sections.length > 0 && (
              <button onClick={addSection} className="w-full py-2.5 rounded-lg border-2 border-dashed border-slate-300 text-sm text-slate-500 hover:border-emerald-400 hover:text-emerald-700">+ Add section</button>
            )}
          </div>

          <div className="min-w-0">
            {!activeLesson ? (
              <div className="p-10 text-center bg-white border border-slate-200 rounded-xl text-slate-500">
                Select a lesson on the left to edit its content.
              </div>
            ) : (
              <LessonEditor lesson={activeLesson} onUpdate={(patch) => updateLesson(activeLesson.id, patch)} onDelete={() => deleteLesson(activeLesson.id)} />
            )}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="mt-6 max-w-3xl space-y-6 bg-white border border-slate-200 rounded-xl p-6">
          <div>
            <label className="text-sm font-medium text-slate-700">Title</label>
            <input value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })} onBlur={(e) => updateCourse({ title: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Subtitle</label>
            <input value={course.subtitle ?? ''} onChange={(e) => setCourse({ ...course, subtitle: e.target.value })} onBlur={(e) => updateCourse({ subtitle: e.target.value || null })} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Cover image URL</label>
            <input value={course.cover_url ?? ''} onChange={(e) => setCourse({ ...course, cover_url: e.target.value })} onBlur={(e) => updateCourse({ cover_url: e.target.value || null })} placeholder="https://..." className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="mt-2"><S5Uploader kind="cover" currentUrl={course.cover_url} onUploaded={(url) => { setCourse({ ...course, cover_url: url }); updateCourse({ cover_url: url }); }} onClear={() => { setCourse({ ...course, cover_url: null }); updateCourse({ cover_url: null }); }} /></div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Description (markdown)</label>
            <div className="mt-1"><MdEditor value={course.description_md ?? ''} onChange={(v) => updateCourse({ description_md: v })} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700">Level</label>
              <select value={course.level ?? 'all_levels'} onChange={(e) => updateCourse({ level: e.target.value })} className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
                <option value="all_levels">All levels</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Pricing</label>
              <div className="mt-1 flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={course.is_free} onChange={(e) => updateCourse(e.target.checked ? { is_free: true, price_cents: 0 } : { is_free: false })} />
                  Free
                </label>
                {!course.is_free && (
                  <div className="flex items-center gap-1">
                    <select value={course.currency} onChange={(e) => updateCourse({ currency: e.target.value })} className="px-2 py-2 border border-slate-300 rounded-lg text-sm">
                      <option>USD</option><option>MYR</option><option>SGD</option><option>EUR</option><option>GBP</option>
                    </select>
                    <input type="number" min={0} step="0.01" value={(course.price_cents / 100).toFixed(2)} onChange={(e) => setCourse({ ...course, price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })} onBlur={(e) => updateCourse({ price_cents: Math.round(parseFloat(e.target.value || '0') * 100) })} className="w-24 px-2 py-2 border border-slate-300 rounded-lg text-sm" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'publish' && (
        <div className="mt-6 max-w-3xl space-y-4 bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="font-semibold text-slate-900">Publish status</h2>
          <p className="text-sm text-slate-600">When published, your course is visible on your storefront and learners can enrol.</p>
          <div className="flex items-center gap-3 pt-2">
            {course.is_published ? (
              <button onClick={() => updateCourse({ is_published: false })} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium hover:bg-slate-50">Unpublish</button>
            ) : (
              <button onClick={() => updateCourse({ is_published: true })} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">Publish course</button>
            )}
            <Link href={creatorSlug ? `/c/${creatorSlug}` : "#"} target="_blank" className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:border-emerald-400 hover:text-emerald-700">View storefront ↗</Link>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            <div>Course slug: <code className="px-1 py-0.5 bg-slate-100 rounded">{course.slug}</code></div>
            <div className="mt-1">Course ID: <code className="px-1 py-0.5 bg-slate-100 rounded">{course.id}</code></div>
          </div>
        </div>
      )}
    {tab === 'analytics' && (
      <div className="mt-6 max-w-5xl space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Course analytics</h2>
        <AnalyticsPanel courseId={courseId} />
      </div>
    )}
    </div>
  );
}

function DebouncedTextInput({ value, onCommit, className, placeholder, type = 'text' }: { value: string; onCommit: (v: string) => void; className?: string; placeholder?: string; type?: string }) {
  const [local, setLocal] = useState(value);
  const last = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Sync when parent value changes (e.g. another tab or reload)
  useEffect(() => {
    if (value !== last.current) { setLocal(value); last.current = value; }
  }, [value]);
  const commit = (v: string) => {
    if (v !== last.current) { last.current = v; onCommit(v); }
  };
  return (
    <input
      type={type}
      value={local}
      placeholder={placeholder}
      className={className}
      onChange={(e) => {
        const v = e.target.value;
        setLocal(v);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(v), 600);
      }}
      onBlur={() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        commit(local);
      }}
    />
  );
}

function LessonEditor({ lesson, onUpdate, onDelete }: { lesson: Lesson; onUpdate: (patch: Partial<Lesson>) => void; onDelete: () => void }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-emerald-700 font-medium">{lesson.lesson_type} lesson</div>
          <DebouncedTextInput value={lesson.title} onCommit={(v) => onUpdate({ title: v })} className="mt-1 w-full text-lg font-semibold text-slate-900 outline-none focus:bg-slate-50 px-1 py-0.5 rounded" />
        </div>
        <button onClick={onDelete} className="text-sm text-slate-400 hover:text-rose-600">Delete lesson</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lesson.is_preview} onChange={(e) => onUpdate({ is_preview: e.target.checked })} />
          Free preview
        </label>
        {lesson.lesson_type === 'video' && (
          <label className="inline-flex items-center gap-2 text-sm">
            Duration (sec)
            <input type="number" min={0} value={lesson.duration_seconds ?? 0} onChange={(e) => onUpdate({ duration_seconds: parseInt(e.target.value || '0', 10) })} className="w-24 px-2 py-1 border border-slate-300 rounded text-sm" />
          </label>
        )}
      </div>

      {lesson.lesson_type === 'video' && (
        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">Adilo video ID</label>
          <input value={lesson.adilo_video_id ?? ''} onChange={(e) => onUpdate({ adilo_video_id: e.target.value })} placeholder="e.g. abc123xyz" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          <p className="mt-1 text-xs text-slate-500">Paste the Adilo video ID. Player integration arrives in M3.</p>
        </div>
      )}

      {lesson.lesson_type === 'article' && (
        <div className="mt-5">
          <label className="text-sm font-medium text-slate-700">Article content (markdown)</label>
          <div className="mt-1"><MdEditor value={lesson.article_md ?? ''} onChange={(v) => onUpdate({ article_md: v })} height={420} /></div>
        </div>
      )}

      {lesson.lesson_type === 'resource' && (
        <div className="mt-5 space-y-3">
          <div>
            <label className="text-sm font-medium text-slate-700">FileLu URL</label>
            <DebouncedTextInput value={lesson.filelu_url ?? ''} onCommit={(v) => onUpdate({ filelu_url: v })} placeholder="https://filelu.com/..." className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">Filename shown to learners</label>
            <DebouncedTextInput value={lesson.resource_filename ?? ''} onCommit={(v) => onUpdate({ resource_filename: v })} placeholder="workbook.pdf" className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
        </div>
      )}

      {lesson.lesson_type === 'quiz' && (
        <div className="mt-5">
          <QuizBuilder lessonId={lesson.id} />
        </div>
      )}
    </div>
  );
}
