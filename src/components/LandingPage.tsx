import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import LandingSessionCheck from "@/components/LandingSessionCheck";
import HeroVideo from "@/components/HeroVideo";
import { TEKS_LANDING, TAPAK, LALUAN, type Bahasa } from "@/lib/landing-copy";

/**
 * Halaman utama awam, dikongsi oleh "/" (BM) dan "/en" (Inggeris).
 *
 * Dihidangkan dari pelayan sebagai HTML penuh supaya perangkak dan enjin
 * jawapan nampak teksnya tanpa menjalankan JavaScript. Soalan lazim guna
 * details dan summary asli: boleh dibuka tanpa JavaScript, mesra pembaca
 * skrin, dan jawapannya kekal dalam HTML walaupun tertutup.
 *
 * Kedua dua versi mengisytiharkan satu sama lain melalui hreflang, jadi
 * enjin carian memaparkan versi yang sepadan dengan bahasa pencari.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

const IKON = [
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M10 8.5l5.5 3.5L10 15.5V8.5Z" fill="currentColor" stroke="none" />
  </>,
  <>
    <path d="M6 3h8l4 4v14H6V3Z" />
    <path d="M14 3v4h4" />
    <path d="M9 12h6M9 16h6" />
  </>,
  <path d="M5 19V11M12 19V5M19 19v-6" />,
];

function urlPenuh(bahasa: Bahasa) {
  return bahasa === "ms" ? TAPAK : `${TAPAK}${LALUAN.en}`;
}

export function metadataLanding(bahasa: Bahasa): Metadata {
  const t = TEKS_LANDING[bahasa];
  const url = urlPenuh(bahasa);
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: {
      canonical: url,
      languages: { "ms-MY": TAPAK, en: `${TAPAK}/en`, "x-default": TAPAK },
    },
    openGraph: {
      title: t.meta.title,
      description: t.meta.ogDescription,
      url,
      type: "website",
      locale: bahasa === "ms" ? "ms_MY" : "en_US",
      alternateLocale: bahasa === "ms" ? ["en_US"] : ["ms_MY"],
    },
  };
}

function jsonLd(bahasa: Bahasa) {
  const t = TEKS_LANDING[bahasa];
  const url = urlPenuh(bahasa);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${TAPAK}/#organization`,
        name: "Kuizen",
        url: TAPAK,
        logo: `${TAPAK}/icons/icon-512.png`,
        description: t.orgDescription,
        areaServed: "MY",
      },
      {
        "@type": "WebSite",
        "@id": `${TAPAK}/#website`,
        url: TAPAK,
        name: "Kuizen",
        inLanguage: ["ms-MY", "en"],
        publisher: { "@id": `${TAPAK}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${url}#app`,
        name: "Kuizen",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url,
        inLanguage: t.inLanguage,
        description: t.meta.ogDescription,
        publisher: { "@id": `${TAPAK}/#organization` },
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        inLanguage: t.inLanguage,
        mainEntity: t.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

function PilihBahasa({ bahasa, label }: { bahasa: Bahasa; label: string }) {
  const pilihan: Array<{ b: Bahasa; teks: string; nama: string }> = [
    { b: "ms", teks: "BM", nama: "Bahasa Melayu" },
    { b: "en", teks: "EN", nama: "English" },
  ];
  return (
    <nav aria-label={label} className="inline-flex rounded-full border border-hairline p-0.5 text-[12px]">
      {pilihan.map((p) => (
        <Link
          key={p.b}
          href={LALUAN[p.b]}
          hrefLang={p.b === "ms" ? "ms-MY" : "en"}
          lang={p.b}
          title={p.nama}
          aria-current={p.b === bahasa ? "page" : undefined}
          className={`rounded-full px-2.5 py-1 font-medium transition ${
            p.b === bahasa ? "bg-brand-purple text-white" : "text-ink-muted hover:text-ink"
          }`}
        >
          {p.teks}
        </Link>
      ))}
    </nav>
  );
}

export default function LandingPage({ bahasa }: { bahasa: Bahasa }) {
  const t = TEKS_LANDING[bahasa];
  const ciriId = bahasa === "ms" ? "ciri" : "features";

  return (
    <div className="min-h-screen flex flex-col bg-white" lang={t.htmlLang}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(bahasa)) }}
      />
      <LandingSessionCheck />

      <header className="px-4 sm:px-8 pt-6">
        <div className="mx-auto w-full max-w-[1040px] flex items-center justify-between gap-2 sm:gap-4">
          <Logo size={28} />
          <nav className="hidden sm:flex items-center gap-7 text-sm text-ink-muted">
            <Link href={`#${ciriId}`} className="hover:text-ink">{t.nav.ciri}</Link>
            <Link href="/blog" className="hover:text-ink">{t.nav.blog}</Link>
            <Link href="/help" className="hover:text-ink">{t.nav.bantuan}</Link>
          </nav>
          <div className="flex items-center gap-2 sm:gap-4 text-sm">
            <PilihBahasa bahasa={bahasa} label={t.nav.tukarBahasa} />
            <Link href="/login" className="btn-quiet whitespace-nowrap">{t.nav.logMasuk}</Link>
            <Link href="/register" className="btn-primary whitespace-nowrap">{t.nav.daftar}</Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 sm:px-8 pt-16 sm:pt-20 pb-12">
          <div className="mx-auto w-full max-w-[720px] text-center">
            <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-ink-faint">{t.hero.eyebrow}</p>
            <h1
              style={DISPLAY}
              className="mt-6 text-[46px] sm:text-[68px] leading-[0.98] font-semibold tracking-tight text-ink"
            >
              {t.hero.tajuk1}
              <br />
              {t.hero.tajuk2}
            </h1>
            <p className="mt-5 text-[17px] sm:text-[19px] text-ink-muted">{t.hero.sub}</p>
            <div className="mt-8">
              <Link href="/register" className="btn-primary">{t.hero.cta}</Link>
            </div>
            <p className="mt-4 text-[13px] text-ink-faint">{t.hero.nota}</p>
          </div>
        </section>

        <section className="px-6 sm:px-8 pb-10">
          <div className="mx-auto w-full max-w-[960px]">
            <HeroVideo bahasa={bahasa} />
          </div>
        </section>

        <section id={ciriId} className="px-6 sm:px-8 pt-12 pb-16">
          <div className="mx-auto w-full max-w-[960px]">
            <h2
              style={DISPLAY}
              className="text-[30px] sm:text-[38px] leading-tight font-semibold tracking-tight text-ink text-center"
            >
              {t.ciriTajuk}
            </h2>
            <div className="mt-10 grid gap-10 sm:gap-0 sm:grid-cols-3 sm:divide-x sm:divide-hairline">
              {t.ciri.map((c, i) => (
                <div key={c.tajuk} className="px-0 sm:px-7 text-center">
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="mx-auto text-brand-purple"
                  >
                    {IKON[i]}
                  </svg>
                  <h3 className="mt-5 text-[17px] font-semibold text-ink">{c.tajuk}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{c.teks}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 pt-14 pb-16 border-t border-hairline">
          <div className="mx-auto w-full max-w-[760px]">
            <h2
              style={DISPLAY}
              className="text-[30px] sm:text-[38px] leading-tight font-semibold tracking-tight text-ink text-center"
            >
              {t.faqTajuk}
            </h2>
            <div className="mt-10 divide-y divide-hairline border-y border-hairline">
              {t.faq.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex items-center justify-between gap-6 cursor-pointer list-none text-[16px] text-ink">
                    <span>{f.q}</span>
                    <span className="shrink-0 text-ink-faint transition group-open:rotate-45" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 pr-10 text-[15px] leading-relaxed text-ink-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 pb-16">
          <div className="mx-auto w-full max-w-[960px] rounded-[22px] bg-[#EFEAFB] px-6 py-16 text-center">
            <h2
              style={DISPLAY}
              className="text-[30px] sm:text-[38px] leading-tight font-semibold tracking-tight text-ink"
            >
              {t.penutup.tajuk}
            </h2>
            <div className="mt-8">
              <Link href="/register" className="btn-primary">{t.penutup.cta}</Link>
            </div>
            <p className="mt-6 text-[15px] text-ink-muted">
              {t.penutup.blogSoalan}{" "}
              <Link href="/blog" className="text-brand-purple hover:underline">
                {t.penutup.blogPautan}
              </Link>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="px-6 sm:px-8 py-10 border-t border-hairline">
        <div className="mx-auto w-full max-w-[1040px] flex flex-wrap items-center justify-between gap-y-4 gap-x-8">
          <div>
            <Logo size={24} />
            <p className="mt-1.5 text-[13px] text-ink-faint">{t.kaki.slogan}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            <Link href="/privacy" className="hover:text-ink">{t.kaki.privasi}</Link>
            <Link href="/terms" className="hover:text-ink">{t.kaki.terma}</Link>
            <Link href="/blog" className="hover:text-ink">{t.kaki.blog}</Link>
            <Link href="/help" className="hover:text-ink">{t.kaki.bantuan}</Link>
            <PilihBahasa bahasa={bahasa} label={t.nav.tukarBahasa} />
          </nav>
        </div>
      </footer>
    </div>
  );
}
