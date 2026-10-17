import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

// Force dynamic so RLS-public reads always hit the live DB
export const dynamic = "force-dynamic";

type Creator = {
  id: string;
  slug: string;
  display_name: string;
  tagline: string | null;
  bio_md: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  theme_color: string | null;
};

type CourseCard = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  price_cents: number;
  currency: string;
  is_free: boolean;
  lesson_count: number;
  total_duration_seconds: number;
  enrollment_count: number;
  rating_avg: number | null;
  rating_count: number;
};

function publicSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}

async function loadCreator(slug: string) {
  const sb = publicSupabase();
  const { data: creator, error } = await sb
    .from("lms_creators")
    .select("id, slug, display_name, tagline, bio_md, avatar_url, cover_url, theme_color")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (error || !creator) return null;

  const { data: courses } = await sb
    .from("lms_courses")
    .select("id, slug, title, subtitle, cover_url, price_cents, currency, is_free, lesson_count, total_duration_seconds, enrollment_count, rating_avg, rating_count")
    .eq("creator_id", (creator as Creator).id)
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  return { creator: creator as Creator, courses: (courses ?? []) as CourseCard[] };
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadCreator(slug);
  if (!data) return { title: "Creator not found · StafKita Akademi" };
  const { creator } = data;
  return {
    title: `${creator.display_name} · StafKita Akademi`,
    description: creator.tagline ?? "Courses on StafKita Akademi",
    openGraph: {
      title: creator.display_name,
      description: creator.tagline ?? "Courses on StafKita Akademi",
      images: creator.cover_url ? [creator.cover_url] : undefined,
    },
  };
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default async function StorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadCreator(slug);
  if (!data) notFound();
  const { creator, courses } = data;
  const themeColor = creator.theme_color || "#059669";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {creator.avatar_url ? (
              <Image
                src={creator.avatar_url}
                alt={creator.display_name}
                width={36}
                height={36}
                className="rounded-full object-cover"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                style={{ backgroundColor: themeColor }}
              >
                {creator.display_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-semibold text-slate-900">{creator.display_name}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-slate-700 hover:text-slate-900 font-medium">
              Log in
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-lg text-white font-semibold"
              style={{ backgroundColor: themeColor }}
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section
        className="text-white"
        style={{
          backgroundImage: `linear-gradient(135deg, ${themeColor} 0%, #0d9488 100%)`,
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            {creator.display_name}
          </h1>
          {creator.tagline && (
            <p className="mt-4 text-lg md:text-xl text-white/90 max-w-2xl">
              {creator.tagline}
            </p>
          )}
        </div>
      </section>

      {/* Courses */}
      <section className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Courses</h2>
        {courses.length === 0 ? (
          <p className="text-slate-600">No courses published yet. Check back soon.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/c/${creator.slug}/${c.slug}`}
                className="group bg-white rounded-xl shadow-card overflow-hidden hover:shadow-lg transition"
              >
                <div className="aspect-video bg-slate-200 relative">
                  {c.cover_url ? (
                    <Image
                      src={c.cover_url}
                      alt={c.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-white/95 font-semibold text-base p-4 text-center" style={{ background: `linear-gradient(135deg, ${creator?.theme_color || '#059669'} 0%, #0d9488 100%)` }}>
                      {c.title}
                    </div>
                  )}
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-slate-900 group-hover:text-emerald-700 line-clamp-2">
                    {c.title}
                  </h3>
                  {c.subtitle && (
                    <p className="mt-1 text-sm text-slate-600 line-clamp-2">{c.subtitle}</p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span>{c.lesson_count} lessons</span>
                    {c.total_duration_seconds > 0 && (
                      <span>· {formatDuration(c.total_duration_seconds)}</span>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-lg font-bold text-slate-900">
                      {c.is_free ? "Free" : formatPrice(c.price_cents, c.currency)}
                    </span>
                    {c.rating_count > 0 && c.rating_avg && (
                      <span className="text-sm text-slate-600">
                        ★ {c.rating_avg.toFixed(1)} ({c.rating_count})
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* About */}
      {creator.bio_md && (
        <section className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">About</h2>
          <div className="prose prose-slate max-w-none whitespace-pre-wrap">
            {creator.bio_md}
          </div>
        </section>
      )}

      <footer className="border-t border-slate-200 mt-12">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} {creator.display_name}</span>
          <span>
            Powered by{" "}
            <Link href="/" className="font-semibold hover:text-emerald-700">
              StafKita Akademi
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
