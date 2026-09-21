import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import LandingSessionCheck from "@/components/LandingSessionCheck";
import HeroVideo from "@/components/HeroVideo";

/**
 * Halaman utama awam.
 *
 * Sebelum ini fail ini hanya mengalihkan ke /login, jadi kuizen.fun tidak
 * mempunyai satu pun halaman yang boleh diindeks atau dipetik oleh enjin AI.
 * Halaman ini dihidangkan dari pelayan sebagai HTML penuh: itu syaratnya
 * supaya perangkak dan enjin jawapan nampak teksnya tanpa menjalankan
 * JavaScript.
 *
 * Susunan mengikut reka bentuk yang diluluskan: tajuk serif besar, satu
 * panggilan tindakan, blok media, tiga ciri, soalan lazim, dan satu jalur
 * penutup.
 *
 * Soalan lazim menggunakan details dan summary asli. Ia boleh dibuka tanpa
 * JavaScript, mesra pembaca skrin, dan jawapannya kekal dalam HTML walaupun
 * tertutup, jadi enjin jawapan tetap membacanya.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export const metadata: Metadata = {
  title: "Kuizen: Platform Kuiz Interaktif dan Gamifikasi Bilik Darjah",
  description:
    "Cipta kuiz bilik darjah interaktif, jalankan sesi PdPc langsung, dan lihat markah serta papan pendahulu serta merta. Untuk guru sekolah dan pensyarah IPT.",
  alternates: { canonical: "https://kuizen.fun" },
  openGraph: {
    title: "Kuizen: Platform Kuiz Interaktif dan Gamifikasi Bilik Darjah",
    description:
      "Cipta kuiz bilik darjah interaktif, jalankan sesi PdPc langsung, dan lihat markah serta papan pendahulu serta merta.",
    url: "https://kuizen.fun",
    type: "website",
  },
};

const CIRI = [
  {
    tajuk: "Mulakan kuiz langsung",
    teks: "Pelajar sertai dengan kod atau QR.",
    ikon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8.5l5.5 3.5L10 15.5V8.5Z" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    tajuk: "Satukan aktiviti kelas",
    teks: "Bahan, tugasan dan pasukan tersusun.",
    ikon: (
      <>
        <path d="M6 3h8l4 4v14H6V3Z" />
        <path d="M14 3v4h4" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),
  },
  {
    tajuk: "Lihat kemajuan bersama",
    teks: "Markah terkumpul dalam papan pendahulu.",
    ikon: <path d="M5 19V11M12 19V5M19 19v-6" />,
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Pelajar perlu akaun?",
    a: "Tidak untuk kuiz langsung. Pelajar masuk dengan kod sesi dan nama panggilan sahaja. Akaun hanya diperlukan apabila pelajar mahu menyertai kelas secara berterusan dan menyimpan rekod markah mereka.",
  },
  {
    q: "Sesuai untuk sekolah dan IPT?",
    a: "Ya untuk kedua duanya. Kelas di Kuizen tidak terikat kepada tingkatan sekolah, jadi satu kelas boleh mewakili satu tingkatan, satu kursus, satu kohort atau satu bengkel. Pensyarah IPT menggunakannya untuk penglibatan kuliah, pentaksiran formatif dan kerja berkumpulan.",
  },
  {
    q: "Boleh import soalan sedia ada?",
    a: "Boleh. Soalan diimport secara pukal daripada fail CSV, jadi bank soalan yang sudah ada dalam fail Excel atau dokumen lama tidak perlu ditaip semula.",
  },
  {
    q: "Apakah itu Kuizen?",
    a: "Kuizen ialah platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik. Guru dan pensyarah mencipta kelas, membina kuiz dan aktiviti, menjalankan sesi langsung di dalam bilik darjah, dan melihat markah serta papan pendahulu terkumpul serta merta.",
  },
  {
    q: "Berapa cara pelajar boleh menyertai?",
    a: "Tiga cara: mengimbas kod QR, membuka pautan jemputan, atau memasukkan kod ringkas. Pilihan itu ada supaya sesi berjalan lancar sama ada di dalam bilik darjah dengan projektor atau dari jauh.",
  },
  {
    q: "Apakah bezanya berbanding platform kuiz konvensional?",
    a: "Kuizen menggabungkan kuiz langsung, aktiviti yang dinilai, papan pembelajaran dan papan pendahulu kelas dalam satu tempat, jadi markah daripada semua aktiviti itu terkumpul dalam papan pendahulu yang sama. Kandungan juga boleh disediakan sepenuhnya dalam Bahasa Melayu.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://kuizen.fun/#organization",
        name: "Kuizen",
        url: "https://kuizen.fun",
        logo: "https://kuizen.fun/icons/icon-512.png",
        description:
          "Platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik sekolah dan institusi pengajian tinggi.",
        areaServed: "MY",
      },
      {
        "@type": "WebSite",
        "@id": "https://kuizen.fun/#website",
        url: "https://kuizen.fun",
        name: "Kuizen",
        inLanguage: "ms-MY",
        publisher: { "@id": "https://kuizen.fun/#organization" },
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://kuizen.fun/#app",
        name: "Kuizen",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        url: "https://kuizen.fun",
        inLanguage: "ms-MY",
        description:
          "Cipta kuiz bilik darjah interaktif, jalankan sesi PdPc langsung, dan lihat markah serta papan pendahulu serta merta.",
        publisher: { "@id": "https://kuizen.fun/#organization" },
      },
      {
        "@type": "FAQPage",
        "@id": "https://kuizen.fun/#faq",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white" lang="ms">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <LandingSessionCheck />

      <header className="px-6 sm:px-8 pt-6">
        <div className="mx-auto w-full max-w-[1040px] flex items-center justify-between gap-4">
          <Logo size={28} />
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="btn-quiet">Log masuk</Link>
            <Link href="/register" className="btn-primary">Daftar</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 sm:px-8 pt-16 sm:pt-20 pb-12">
          <div className="mx-auto w-full max-w-[720px] text-center">
            <p className="text-[11px] font-medium tracking-[0.18em] uppercase text-ink-faint">
              Untuk guru dan pensyarah
            </p>
            <h1
              style={DISPLAY}
              className="mt-6 text-[46px] sm:text-[68px] leading-[0.98] font-semibold tracking-tight text-ink"
            >
              Hidupkan
              <br />
              kelas anda.
            </h1>
            <p className="mt-5 text-[17px] sm:text-[19px] text-ink-muted">
              Kuiz, aktiviti dan kemajuan pelajar. Semua dalam satu tempat.
            </p>
            <div className="mt-8">
              <Link href="/register" className="btn-primary">Daftar sebagai pendidik</Link>
            </div>
            <p className="mt-4 text-[13px] text-ink-faint">
              Akaun pendidik disemak sebelum kelas boleh dicipta.
            </p>
          </div>
        </section>

        <section className="px-6 sm:px-8 pb-10">
          <div className="mx-auto w-full max-w-[960px]">
            <HeroVideo />
          </div>
        </section>

        <section className="px-6 sm:px-8 pt-12 pb-16">
          <div className="mx-auto w-full max-w-[960px]">
            <h2
              style={DISPLAY}
              className="text-[30px] sm:text-[38px] leading-tight font-semibold tracking-tight text-ink text-center"
            >
              Satu kelas. Lebih banyak penglibatan.
            </h2>
            <div className="mt-10 grid gap-10 sm:gap-0 sm:grid-cols-3 sm:divide-x sm:divide-hairline">
              {CIRI.map((c) => (
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
                    {c.ikon}
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
              Soalan ringkas. Jawapan jelas.
            </h2>
            <div className="mt-10 divide-y divide-hairline border-y border-hairline">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex items-center justify-between gap-6 cursor-pointer list-none text-[16px] text-ink">
                    <span>{f.q}</span>
                    <span
                      className="shrink-0 text-ink-faint transition group-open:rotate-45"
                      aria-hidden="true"
                    >
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
              Kelas seterusnya, lebih bermakna.
            </h2>
            <div className="mt-8">
              <Link href="/register" className="btn-primary">Daftar sebagai pendidik</Link>
            </div>
          </div>
        </section>
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
