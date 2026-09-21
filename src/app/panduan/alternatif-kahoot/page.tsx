import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Panduan ketiga.
 *
 * Sasarannya niat membanding: kahoot alternatives, kahoot pricing,
 * kuiz kahoot, kahoot bahasa melayu. Niat ini paling hampir dengan keputusan
 * memilih alat, jadi nilainya tinggi walaupun volumnya sederhana.
 *
 * Dua peraturan dipegang di sini. Pertama, apa apa fakta tentang Kahoot
 * diambil daripada halaman harga rasmi mereka dan dipautkan, bukan ditulis
 * daripada ingatan. Kedua, tiada harga pesaing dipetik sebagai angka tetap
 * kecuali pelan percuma dan hadnya, kerana harga berubah dan halaman yang
 * lapuk lebih memudaratkan pembaca daripada tiada halaman.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export const metadata: Metadata = {
  title: "Alternatif Kahoot untuk kelas di Malaysia",
  description:
    "Apa yang perlu disemak sebelum memilih platform kuiz kelas: had peserta, kos bila kelas membesar, sokongan Bahasa Melayu, dan ke mana markah pergi selepas sesi tamat.",
  alternates: { canonical: "https://kuizen.fun/panduan/alternatif-kahoot" },
  openGraph: {
    title: "Alternatif Kahoot untuk kelas di Malaysia",
    description:
      "Empat perkara yang perlu disemak sebelum memilih platform kuiz untuk bilik darjah.",
    url: "https://kuizen.fun/panduan/alternatif-kahoot",
    type: "article",
  },
};

const SEMAK = [
  {
    tajuk: "Berapa ramai peserta dibenarkan dalam satu sesi",
    teks: "Ini yang paling kerap menghalang, dan ia hanya disedari pada waktu pengajaran itu sendiri. Pelan percuma Kahoot! Go menyokong 40 peserta dalam satu sesi langsung. Kelas Tingkatan Empat dengan 42 orang sudah melepasi had itu. Kuizen bermula pada 50 peserta, dan had itu ditetapkan pada akaun pendidik jadi ia boleh dinaikkan untuk dewan atau kuliah besar.",
  },
  {
    tajuk: "Apa yang berlaku apabila kelas anda membesar",
    teks: "Hampir semua platform percuma untuk kelas kecil. Yang membezakan ialah apa yang berlaku selepas itu. Semak sama ada had berikutnya memaksa langganan bulanan, dan sama ada langganan itu dikira setiap guru atau setiap sekolah. Bagi sekolah yang mahu melanjutkan kepada sepuluh guru, perbezaan itu besar.",
  },
  {
    tajuk: "Sama ada Bahasa Melayu benar benar disokong",
    teks: "Kebanyakan platform membenarkan anda menaip soalan dalam apa apa bahasa, dan itu memang cukup untuk kandungan. Yang berbeza ialah antara muka dan bahan bantuan. Tanya diri anda sama ada murid Tahun Empat boleh menyertai tanpa bantuan kalau setiap butang dalam Bahasa Inggeris.",
  },
  {
    tajuk: "Ke mana markah pergi selepas sesi tamat",
    teks: "Kuiz sekali sekala mudah. Yang sukar ialah menjejak penglibatan sepanjang penggal. Semak sama ada markah daripada setiap sesi terkumpul menjadi satu gambaran kelas, atau setiap sesi berdiri sendiri dan anda terpaksa menyimpannya dalam fail Excel anda sendiri.",
  },
];

const SOALAN = [
  {
    q: "Adakah Kahoot percuma untuk guru?",
    a: "Ada pelan percuma bernama Kahoot! Go, dan ada beberapa pelan berbayar untuk sekolah. Menurut halaman harga rasmi Kahoot, pelan percuma itu menyokong 40 peserta dalam satu sesi langsung. Semak halaman mereka untuk butiran terkini, kerana pelan dan harga berubah dari semasa ke semasa.",
  },
  {
    q: "Apa alternatif Kahoot yang menyokong Bahasa Melayu?",
    a: "Soalan boleh ditaip dalam Bahasa Melayu pada hampir semua platform. Yang lebih jarang ialah antara muka dan bahan bantuan dalam Bahasa Melayu. Kuizen dibina untuk pendidik Malaysia dan kandungan boleh disediakan sepenuhnya dalam Bahasa Melayu.",
  },
  {
    q: "Adakah pelajar perlu akaun untuk menyertai?",
    a: "Di Kuizen, tidak untuk sesi kuiz langsung. Pelajar masuk dengan kod sesi dan nama panggilan. Akaun hanya diperlukan apabila mereka mahu menyertai kelas secara berterusan dan menyimpan rekod markah.",
  },
  {
    q: "Bolehkah saya memindahkan soalan sedia ada?",
    a: "Di Kuizen, soalan diimport melalui templat CSV. Muat turun templat, isi dalam Excel, dan muat naik semula. Kalau bank soalan anda sudah ada dalam fail lama, itu jalan paling cepat.",
  },
  {
    q: "Apa beza kuiz langsung dengan kuiz yang dihantar sebagai kerja rumah?",
    a: "Kuiz langsung berlaku serentak dalam satu bilik dengan skrin dikongsi, dan tempohnya dikawal guru. Kuiz kerja rumah dijawab sendiri pada bila bila masa. Kedua duanya berguna, tetapi hanya yang pertama mengubah suasana dalam bilik darjah pada waktu itu.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": "https://kuizen.fun/panduan/alternatif-kahoot#article",
        headline: "Alternatif Kahoot untuk kelas di Malaysia",
        description:
          "Empat perkara yang perlu disemak sebelum memilih platform kuiz kelas: had peserta, kos bila kelas membesar, sokongan Bahasa Melayu, dan ke mana markah pergi.",
        inLanguage: "ms-MY",
        publisher: { "@id": "https://kuizen.fun/#organization" },
      },
      {
        "@type": "FAQPage",
        "@id": "https://kuizen.fun/panduan/alternatif-kahoot#faq",
        mainEntity: SOALAN.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Kuizen", item: "https://kuizen.fun" },
          { "@type": "ListItem", position: 2, name: "Blog", item: "https://kuizen.fun/blog" },
          {
            "@type": "ListItem",
            position: 3,
            name: "Alternatif Kahoot",
            item: "https://kuizen.fun/panduan/alternatif-kahoot",
          },
        ],
      },
    ],
  };
}

export default function AlternatifKahoot() {
  return (
    <div className="min-h-screen flex flex-col bg-white" lang="ms">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />

      <header className="px-6 sm:px-8 pt-6">
        <div className="mx-auto w-full max-w-[1040px] flex items-center justify-between gap-4">
          <Link href="/" aria-label="Kuizen">
            <Logo size={28} />
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/login" className="btn-quiet">Log masuk</Link>
            <Link href="/register" className="btn-primary">Daftar</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 px-6 sm:px-8 py-14">
        <article className="mx-auto w-full max-w-[720px]">
          <nav aria-label="Laluan" className="text-[13px] text-ink-faint">
            <Link href="/" className="hover:text-ink">Kuizen</Link>
            <span className="px-2">/</span>
            <Link href="/blog" className="hover:text-ink">Blog</Link>
          </nav>

          <h1
            style={DISPLAY}
            className="mt-5 text-[38px] sm:text-[46px] leading-[1.05] font-semibold tracking-tight text-ink"
          >
            Alternatif Kahoot untuk kelas di Malaysia
          </h1>

          <p className="mt-5 text-[18px] leading-relaxed text-ink-muted">
            Kahoot ialah alat yang baik, dan bagi ramai guru ia yang pertama menunjukkan
            bahawa kuiz kelas boleh menjadi meriah. Kami tidak akan berpura pura
            sebaliknya. Halaman ini untuk guru yang sudah mencubanya dan terhenti pada
            sesuatu, biasanya had peserta atau kos apabila kelas bertambah.
          </p>

          <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">
            Daripada menyenaraikan sepuluh platform, kami senaraikan empat perkara yang
            benar benar membezakan pilihan pada hari anda menggunakannya. Kuizen memang
            salah satu pilihan itu, dan kami nyatakan di mana ia berdiri.
          </p>

          <h2
            style={DISPLAY}
            className="mt-14 text-[28px] leading-tight font-semibold tracking-tight text-ink"
          >
            Empat perkara yang perlu disemak
          </h2>

          <ol className="mt-8 space-y-9">
            {SEMAK.map((s, i) => (
              <li key={s.tajuk} className="flex gap-5">
                <span
                  className="shrink-0 w-8 h-8 rounded-full bg-[#EDE9FB] text-brand-purple text-[14px] font-semibold flex items-center justify-center"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-ink">{s.tajuk}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{s.teks}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2
            style={DISPLAY}
            className="mt-16 text-[28px] leading-tight font-semibold tracking-tight text-ink"
          >
            Soalan yang kerap ditanya
          </h2>

          <div className="mt-8 divide-y divide-hairline border-y border-hairline">
            {SOALAN.map((f) => (
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

          <p className="mt-10 text-[13px] leading-relaxed text-ink-faint">
            Angka pelan percuma Kahoot diambil daripada{" "}
            <a
              href="https://kahoot.com/schools/plans/"
              rel="nofollow noopener"
              target="_blank"
              className="text-brand-purple hover:underline"
            >
              halaman pelan rasmi mereka
            </a>
            , disemak pada 21 September 2026. Pelan dan had berubah, jadi semak sendiri
            sebelum membuat keputusan.
          </p>

          <div className="mt-12 rounded-[18px] bg-[#EFEAFB] px-6 py-10 text-center">
            <p className="text-[17px] text-ink">Mahu mencuba Kuizen dengan satu kelas dahulu?</p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="btn-primary">Daftar sebagai pendidik</Link>
              <Link href="/panduan/cara-buat-kuiz-online" className="btn-secondary">
                Panduan tujuh langkah
              </Link>
            </div>
          </div>
        </article>
      </main>

      <footer className="px-6 sm:px-8 py-10 border-t border-hairline">
        <div className="mx-auto w-full max-w-[1040px] flex flex-wrap items-center justify-between gap-y-4 gap-x-8">
          <div>
            <Logo size={24} />
            <p className="mt-1.5 text-[13px] text-ink-faint">Pembelajaran lebih hidup.</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-muted">
            <Link href="/blog" className="hover:text-ink">Blog</Link>
            <Link href="/privacy" className="hover:text-ink">Privasi</Link>
            <Link href="/terms" className="hover:text-ink">Terma</Link>
            <Link href="/help" className="hover:text-ink">Bantuan</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
