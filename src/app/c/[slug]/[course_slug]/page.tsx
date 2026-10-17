import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { MdView } from '@/components/MdView';
import { EnrolButton } from './EnrolButton';
import ReviewsPanel from '@/components/ReviewsPanel';

export const dynamic = 'force-dynamic';

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

type Params = { slug: string; course_slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { slug, course_slug } = await params;
  const client = db();
  const { data: cr } = await client.from('lms_creators').select('id, display_name').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (!cr) return { title: 'Course not found · StafKita Akademi' };
  const { data: course } = await client.from('lms_courses').select('title, subtitle').eq('creator_id', (cr as { id: string }).id).eq('slug', course_slug).eq('is_published', true).maybeSingle();
  if (!course) return { title: 'Course not found · StafKita Akademi' };
  const c = course as { title: string; subtitle: string | null };
  return { title: `${c.title} · ${(cr as { display_name: string }).display_name}`, description: c.subtitle || undefined };
}

export default async function CourseLandingPage({ params }: { params: Promise<Params> }) {
  const { slug, course_slug } = await params;
  const client = db();
  const { data: creator } = await client.from('lms_creators').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
  if (!creator) notFound();
  const cr = creator as { id: string; slug: string; display_name: string; tagline: string | null; avatar_url: string | null; theme_color: string | null };

  const { data: course } = await client.from('lms_courses').select('*').eq('creator_id', cr.id).eq('slug', course_slug).eq('is_published', true).maybeSingle();
  if (!course) notFound();
  const co = course as Record<string, unknown> as {
    id: string; title: string; subtitle: string | null; description_md: string | null;
    cover_url: string | null; level: string | null; is_free: boolean; price_cents: number;
    currency: string; lesson_count: number | null; total_duration_seconds: number | null;
    what_youll_learn: string[] | null; requirements: string[] | null;
  };

  const { data: sections } = await client.from('lms_course_sections').select('*').eq('course_id', co.id).order('position');
  const { data: lessons } = await client.from('lms_lessons').select('*').eq('course_id', co.id).order('position');
  const secs = (sections ?? []) as Array<{ id: string; title: string; position: number }>;
  const les = (lessons ?? []) as Array<{ id: string; section_id: string; title: string; lesson_type: string; is_preview: boolean; duration_seconds: number | null; position: number }>;

  const themeColor = cr.theme_color || '#059669';
  function priceLabel() {
    if (co.is_free || co.price_cents === 0) return 'Free';
    return `${co.currency || 'USD'} ${(co.price_cents / 100).toFixed(2)}`;
  }
  function totalDurationLabel() {
    const s = co.total_duration_seconds || 0;
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)} min`;
    return `${(s / 3600).toFixed(1)} h`;
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href={`/c/${cr.slug}`} className="flex items-center gap-2">
            {cr.avatar_url ? <img src={cr.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full" style={{ background: themeColor }} />}
            <span className="font-semibold text-slate-900">{cr.display_name}</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/login" className="px-3 py-1.5 text-slate-600 hover:text-slate-900">Log in</Link>
            <Link href="/register" className="px-3 py-1.5 rounded-lg text-white font-medium" style={{ background: themeColor }}>Join</Link>
          </div>
        </div>
      </header>

      <div className="text-white" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #0d9488 100%)` }}>
        <div className="max-w-6xl mx-auto px-6 py-12 grid lg:grid-cols-[1fr,360px] gap-10">
          <div>
            <Link href={`/c/${cr.slug}`} className="text-sm opacity-80 hover:opacity-100">← {cr.display_name}</Link>
            <h1 className="mt-3 text-4xl md:text-5xl font-bold leading-tight">{co.title}</h1>
            {co.subtitle && <p className="mt-3 text-lg opacity-90">{co.subtitle}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm opacity-90">
              {co.level && <span className="px-2 py-0.5 rounded-full bg-white/20 capitalize">{co.level.replace('_', ' ')}</span>}
              <span>{co.lesson_count ?? les.length} lessons</span>
              {(co.total_duration_seconds || 0) > 0 && <span>· {totalDurationLabel()}</span>}
            </div>
          </div>
          <aside className="bg-white text-slate-900 rounded-2xl shadow-xl p-5 self-start">
            {co.cover_url && <img src={co.cover_url} alt="" className="w-full aspect-video object-cover rounded-lg mb-4" />}
            <div className="text-3xl font-bold">{priceLabel()}</div>
            <EnrolButton courseId={co.id} isFree={co.is_free} themeColor={themeColor} />
            <ul className="mt-5 text-sm text-slate-600 space-y-1.5">
              <li>✓ Lifetime access</li>
              <li>✓ Learn at your own pace</li>
              <li>✓ {co.lesson_count ?? les.length} lessons</li>
            </ul>
          </aside>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-10">
        {co.what_youll_learn && co.what_youll_learn.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-slate-900">What you'll learn</h2>
            <ul className="mt-4 grid md:grid-cols-2 gap-2">
              {co.what_youll_learn.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-700">
                  <span className="text-emerald-600 mt-0.5">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="text-2xl font-bold text-slate-900">Curriculum</h2>
          <p className="mt-1 text-sm text-slate-500">{secs.length} sections · {les.length} lessons</p>
          <div className="mt-4 space-y-3">
            {secs.map((s) => {
              const secLessons = les.filter((l) => l.section_id === s.id);
              return (
                <div key={s.id} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="font-medium text-slate-900">{s.title}</div>
                    <div className="text-xs text-slate-500">{secLessons.length} lessons</div>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {secLessons.map((l) => (
                      <li key={l.id} className="px-5 py-2.5 flex items-center gap-3 text-sm">
                        <span className="text-xs uppercase tracking-wide text-slate-400 w-16">{l.lesson_type}</span>
                        <span className="flex-1 text-slate-800">{l.title}</span>
                        {l.is_preview ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">Preview</span>
                        ) : (
                          <span className="text-xs text-slate-300">🔒</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {secs.length === 0 && <p className="text-sm text-slate-500">Curriculum coming soon.</p>}
          </div>
        </section>

        {co.description_md && (
          <section>
            <h2 className="text-2xl font-bold text-slate-900">About this course</h2>
            <div className="mt-4"><MdView source={co.description_md} /></div>
          </section>
        )}

        {co.requirements && co.requirements.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold text-slate-900">Requirements</h2>
            <ul className="mt-4 list-disc list-inside space-y-1 text-slate-700">
              {co.requirements.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </section>
        )}
      <section>
        <h2 className="text-2xl font-bold text-slate-900">Reviews</h2>
        <div className="mt-4"><ReviewsPanel courseId={co.id} /></div>
      </section>

      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-xs text-slate-400">
        Powered by <Link href="/" className="hover:text-slate-600">StafKita Akademi</Link>
      </footer>
    </div>
  );
}
