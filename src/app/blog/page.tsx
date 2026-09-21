import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import BlogList from "@/components/blog/BlogList";
import { ARTIKEL, pautan } from "@/lib/blog";

/**
 * Halaman senarai blog.
 *
 * Komponen pelayan, jadi tajuk, ringkasan dan pautan setiap artikel berada
 * dalam HTML pada muatan pertama. Penapis kategori dan carian ialah satu
 * komponen klien kecil yang hanya menyembunyikan dan memaparkan; ia tidak
 * pernah menjadi syarat untuk kandungan wujud.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export const metadata: Metadata = {
  title: "Blog Kuizen",
  description:
    "Idea segar untuk kelas yang hidup. Panduan praktikal untuk guru dan pensyarah: cara buat kuiz online, PdPc yang lebih interaktif, dan cara memilih platform kuiz kelas.",
  alternates: { canonical: "https://kuizen.fun/blog" },
  openGraph: {
    title: "Blog Kuizen",
    description: "Idea segar untuk kelas yang hidup. Panduan praktikal untuk guru dan pensyarah.",
    url: "https://kuizen.fun/blog",
    type: "website",
  },
};

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": "https://kuizen.fun/blog#blog",
        name: "Blog Kuizen",
        description: "Panduan praktikal untuk guru dan pensyarah di Malaysia.",
        url: "https://kuizen.fun/blog",
        inLanguage: "ms-MY",
        publisher: { "@id": "https://kuizen.fun/#organization" },
      },
      {
        "@type": "ItemList",
        "@id": "https://kuizen.fun/blog#senarai",
        itemListElement: ARTIKEL.map((a, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: a.tajuk,
          url: "https://kuizen.fun" + pautan(a),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Kuizen", item: "https://kuizen.fun" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://kuizen.fun/blog" },
        ],
      },
    ],
  };
}

export default function Blog() {
  return (
    <div className="min-h-screen flex flex-col bg-white" lang="ms">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />

      <header className="px-6 sm:px-8 pt-6">
        <div className="mx-auto w-full max-w-[1040px] flex items-center justify-between gap-6">
          <Link href="/" aria-label="Kuizen">
            <Logo size={28} />
          </Link>
          <nav className="hidden sm:flex items-center gap-7 text-sm text-ink-muted">
            <Link href="/#ciri" className="hover:text-ink">Ciri</Link>
            <Link
              href="/blog"
              aria-current="page"
              className="text-ink font-medium border-b-2 border-brand-purple pb-1"
            >
              Blog
            </Link>
            <Link href="/help" className="hover:text-ink">Bantuan</Link>
          </nav>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="btn-quiet">Log masuk</Link>
            <Link href="/register" className="btn-primary">Daftar</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 sm:px-8 pt-14 pb-16">
        <div className="mx-auto w-full max-w-[1040px]">
          <p className="text-[11px] font-semibold tracking-[0.14em] uppercase text-brand-purple">
            Blog Kuizen
          </p>
          <h1
            style={DISPLAY}
            className="mt-4 text-[42px] sm:text-[56px] leading-[1.02] font-semibold tracking-tight text-ink max-w-[620px]"
          >
            Idea segar untuk kelas yang hidup.
          </h1>
          <p className="mt-4 text-[17px] text-ink-muted">
            Panduan praktikal untuk guru dan pensyarah.
          </p>

          <BlogList />

          <section className="mt-24 rounded-[22px] bg-[#EFEAFB] px-6 sm:px-12 py-12 flex flex-wrap items-center justify-between gap-6">
            <h2
              style={DISPLAY}
              className="text-[28px] sm:text-[34px] leading-tight font-semibold tracking-tight text-ink"
            >
              Bawa idea ini ke kelas anda.
            </h2>
            <Link href="/register" className="btn-primary">
              Daftar sebagai pendidik &rarr;
            </Link>
          </section>
        </div>
      </main>

      <footer className="px-6 sm:px-8 py-10 border-t border-hairline">
        <div className="mx-auto w-full max-w-[1040px] flex flex-wrap items-center justify-between gap-y-4 gap-x-8">
          <div>
            <Logo size={24} />
            <p className="mt-1.5 text-[13px] text-ink-faint">Pembelajaran lebih hidup.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            <Link href="/privacy" className="hover:text-ink">Privasi</Link>
            <Link href="/terms" className="hover:text-ink">Terma</Link>
            <Link href="/help" className="hover:text-ink">Bantuan</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
