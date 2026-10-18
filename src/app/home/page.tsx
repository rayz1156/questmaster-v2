'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { teks } from '@/i18n/teks';

type EnrolRow = {
  id: string;
  course_id: string;
  enrolled_at: string;
  last_lesson_id: string | null;
  course: { id: string; title: string; subtitle: string | null; cover_url: string | null; slug: string; lesson_count: number | null; creator_id: string };
};
type CreatorMap = Record<string, { slug: string; display_name: string; theme_color: string | null }>;

export default function LearnerHome() {
  const router = useRouter();
  const [enrols, setEnrols] = useState<EnrolRow[]>([]);
  const [creators, setCreators] = useState<CreatorMap>({});
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [displayName, setDisplayName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login?next=/home'); return; }
      const meta = user.user_metadata as { name?: string } | undefined;
      setDisplayName(meta?.name || user.email?.split('@')[0] || 'learner');

      const { data: enrolRows } = await supabase
        .from('lms_enrollments')
        .select('id, course_id, enrolled_at, last_lesson_id, course:lms_courses(id, title, subtitle, cover_url, slug, lesson_count, creator_id)')
        .eq('user_id', user.id)
        .order('enrolled_at', { ascending: false });
      const rows = (enrolRows ?? []) as unknown as EnrolRow[];
      setEnrols(rows);

      if (rows.length > 0) {
        const creatorIds = Array.from(new Set(rows.map((r) => r.course.creator_id)));
        const { data: crs } = await supabase.from('lms_creators').select('id, slug, display_name, theme_color').in('id', creatorIds);
        const map: CreatorMap = {};
        for (const c of (crs ?? []) as Array<{ id: string; slug: string; display_name: string; theme_color: string | null }>) {
          map[c.id] = { slug: c.slug, display_name: c.display_name, theme_color: c.theme_color };
        }
        setCreators(map);

        const { data: prog } = await supabase.from('lms_lesson_progress').select('course_id').eq('user_id', user.id);
        const counts: Record<string, number> = {};
        for (const p of (prog ?? []) as Array<{ course_id: string }>) {
          counts[p.course_id] = (counts[p.course_id] || 0) + 1;
        }
        setProgress(counts);
      }
      setLoading(false);
    })();
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">{teks.jenama.nama}</Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 hidden sm:inline">{teks.rumah.hi(displayName)}</span>
            <button onClick={async () => { await supabase.auth.signOut(); router.push('/'); }} className="text-sm text-slate-500 hover:text-slate-900">{teks.rumah.logKeluar}</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900">{teks.rumah.tajuk}</h1>
        <p className="mt-1 text-slate-600">{teks.rumah.sub}</p>

        {loading ? (
          <div className="mt-10 text-center text-slate-500">{teks.rumah.memuatkan}</div>
        ) : enrols.length === 0 ? (
          <div className="mt-10 bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
            <div className="text-5xl">🎓</div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900">{teks.rumah.tiada}</h2>
            <p className="mt-1 text-sm text-slate-500">{teks.rumah.tiadaSub}</p>
            <Link href="/" className="mt-5 inline-flex items-center px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">{teks.rumah.cari}</Link>
          </div>
        ) : (
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {enrols.map((e) => {
              const cr = creators[e.course.creator_id];
              const done = progress[e.course_id] || 0;
              const total = e.course.lesson_count || 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              const themeColor = cr?.theme_color || '#059669';
              return (
                <Link key={e.id} href={`/learn/${e.course_id}`} className="group bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md hover:border-emerald-300 transition">
                  <div className="aspect-video bg-slate-100 relative">
                    {e.course.cover_url ? (
                      <img src={e.course.cover_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #0d9488 100%)` }} />
                    )}
                  </div>
                  <div className="p-4">
                    {cr && <div className="text-xs text-slate-500 truncate">{cr.display_name}</div>}
                    <div className="mt-1 font-semibold text-slate-900 line-clamp-2 group-hover:text-emerald-700">{e.course.title}</div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-slate-500 whitespace-nowrap">{pct}%</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
