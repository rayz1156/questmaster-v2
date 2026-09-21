import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Panduan awam pertama.
 *
 * Sasarannya dua kata kunci yang sudah disahkan dan dijejak:
 * "cara buat kuiz online" dan "cipta kuiz sendiri". Kedua duanya niat
 * panduan, bukan niat jenama, jadi halaman ini menjawab soalan itu terus
 * dan bukan sekadar mengiklankan produk.
 *
 * Skema HowTo dan FAQPage kedua duanya dipasang. Itu bahagian AEO: enjin
 * jawapan memetik langkah dan jawapan, bukan ayat pemasaran.
 *
 * Setiap langkah di sini mesti benar tentang Kuizen. Panduan yang
 * menerangkan ciri yang tidak wujud lebih memudaratkan daripada tiada
 * panduan langsung.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export const metadata: Metadata = {
  title: "Cara buat kuiz online untuk kelas anda",
  description:
    "Panduan langkah demi langkah untuk cipta kuiz sendiri dan jalankan sesi kuiz langsung di dalam kelas, termasuk cara import soalan daripada fail CSV.",
  alternates: { canonical: "https://kuizen.fun/panduan/cara-buat-kuiz-online" },
  openGraph: {
    title: "Cara buat kuiz online untuk kelas anda",
    description:
      "Panduan langkah demi langkah untuk cipta kuiz sendiri dan jalankan sesi kuiz langsung di dalam kelas.",
    url: "https://kuizen.fun/panduan/cara-buat-kuiz-online",
    type: "article",
  },
};

const LANGKAH = [
  {
    tajuk: "Daftar akaun pendidik",
    teks: "Buka halaman daftar dan pilih tab pendidik. Akaun pendidik disemak oleh pentadbir sebelum kelas boleh dicipta, jadi daftar seminggu lebih awal daripada waktu pengajaran yang anda sasarkan.",
  },
  {
    tajuk: "Cipta satu kelas",
    teks: "Beri kelas itu nama yang pelajar akan cam, contohnya kod kursus atau nama tingkatan. Setiap kelas mempunyai kod sertai tersendiri, dan kod itu yang anda kongsi dengan pelajar.",
  },
  {
    tajuk: "Tambah kuiz kepada kelas",
    teks: "Dari dalam kelas, cipta kuiz baharu. Satu kelas boleh mempunyai banyak kuiz, jadi tidak perlu membuka kelas baharu setiap kali ada topik baharu.",
  },
  {
    tajuk: "Masukkan soalan, atau import daripada CSV",
    teks: "Soalan boleh ditaip terus. Kalau bank soalan anda sudah ada, muat turun templat CSV dari skrin kuiz, isi dalam Excel, dan muat naik semula. Itu menjimatkan paling banyak masa bagi guru yang sudah mempunyai simpanan soalan bertahun tahun.",
  },
  {
    tajuk: "Tetapkan tempo sesi",
    teks: "Kira detik untuk setiap soalan boleh dihidupkan atau dimatikan. Ada juga markah berganda dan bonus giliran berturut turut. Untuk kelas yang pasif, hidupkan kira detik; untuk topik yang berat, matikan supaya pelajar sempat berfikir.",
  },
  {
    tajuk: "Jalankan sesi langsung",
    teks: "Mulakan sesi dan papar skrin pada projektor. Pelajar menyertai melalui kod QR yang diimbas dari skrin, pautan yang dihantar dalam kumpulan kelas, atau kod ringkas yang ditaip. Untuk sesi langsung, pelajar tidak perlu akaun; nama panggilan sudah memadai.",
  },
  {
    tajuk: "Semak papan pendahulu",
    teks: "Markah muncul serta merta dan papan pendahulu bergerak sepanjang sesi. Selepas sesi, markah itu kekal dalam papan pendahulu kelas bersama markah daripada aktiviti lain, jadi kedudukan mencerminkan usaha sepanjang kursus dan bukan satu sesi sahaja.",
  },
];

const SOALAN = [
  {
    q: "Berapa lama masa diperlukan untuk menyediakan kuiz pertama?",
    a: "Kalau soalan sudah siap, kira kira sepuluh minit dari mencipta kelas hingga sesi boleh dimulakan. Yang memakan masa biasanya menunggu kelulusan akaun pendidik, jadi daftar lebih awal.",
  },
  {
    q: "Adakah pelajar perlu memuat turun apa apa aplikasi?",
    a: "Tidak. Kuizen berjalan dalam pelayar web. Pelajar boleh menyimpannya ke skrin utama telefon kalau mahu, tetapi itu pilihan dan bukan syarat.",
  },
  {
    q: "Bagaimana format fail CSV untuk import soalan?",
    a: "Muat turun templat daripada skrin kuiz, isi dalam Excel, kemudian muat naik semula. Simpan sebagai CSV UTF-8 dan kekalkan baris pengepala seperti dalam templat. Kalau ada baris yang bermasalah, ralat dipaparkan mengikut baris supaya anda tahu yang mana perlu dibetulkan.",
  },
  {
    q: "Bolehkah kuiz yang sama digunakan semula untuk kelas lain?",
    a: "Boleh. Kuiz tinggal dalam kelas tempat ia dicipta, dan sesi baharu boleh dijalankan seberapa kerap yang perlu, termasuk untuk kumpulan berbeza pada waktu berlainan.",
  },
  {
    q: "Berapa ramai pelajar boleh menyertai satu sesi?",
    a: "Had lalai ialah 50 peserta dalam satu sesi langsung. Had itu ditetapkan pada akaun pendidik, jadi ia boleh dinaikkan oleh pentadbir untuk kelas atau dewan yang lebih besar.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "HowTo",
        "@id": "https://kuizen.fun/panduan/cara-buat-kuiz-online#howto",
        name: "Cara buat kuiz online untuk kelas anda",
        description:
          "Langkah untuk mencipta kuiz kelas di Kuizen dan menjalankan sesi kuiz langsung di dalam bilik darjah.",
        inLanguage: "ms-MY",
        totalTime: "PT10M",
        step: LANGKAH.map((l, i) => ({
          "@type": "HowToStep",
          position: i + 1,
          name: l.tajuk,
          text: l.teks,
        })),
      },
      {
        "@type": "FAQPage",
        "@id": "https://kuizen.fun/panduan/cara-buat-kuiz-online#faq",
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
          {
            "@type": "ListItem",
            position: 2,
            name: "Cara buat kuiz online",
            item: "https://kuizen.fun/panduan/cara-buat-kuiz-online",
          },
        ],
      },
    ],
  };
}

export default function Panduan() {
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
            <span>Panduan</span>
          </nav>

          <h1
            style={DISPLAY}
            className="mt-5 text-[38px] sm:text-[46px] leading-[1.05] font-semibold tracking-tight text-ink"
          >
            Cara buat kuiz online untuk kelas anda
          </h1>

          <p className="mt-5 text-[18px] leading-relaxed text-ink-muted">
            Panduan ini untuk guru dan pensyarah yang mahu mencipta kuiz sendiri dan
            menjalankannya terus di dalam kelas, bukan sekadar menghantar pautan dan
            berharap pelajar menjawabnya di rumah. Tujuh langkah, dan kuiz pertama
            biasanya siap dalam kira kira sepuluh minit.
          </p>

          <h2
            style={DISPLAY}
            className="mt-14 text-[28px] leading-tight font-semibold tracking-tight text-ink"
          >
            Tujuh langkah
          </h2>

          <ol className="mt-8 space-y-9">
            {LANGKAH.map((l, i) => (
              <li key={l.tajuk} className="flex gap-5">
                <span
                  className="shrink-0 w-8 h-8 rounded-full bg-[#EDE9FB] text-brand-purple text-[14px] font-semibold flex items-center justify-center"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-ink">{l.tajuk}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{l.teks}</p>
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

          <div className="mt-14 rounded-[18px] bg-[#EFEAFB] px-6 py-10 text-center">
            <p className="text-[17px] text-ink">
              Sedia untuk mencuba dengan kelas anda sendiri?
            </p>
            <div className="mt-5">
              <Link href="/register" className="btn-primary">Daftar sebagai pendidik</Link>
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
            <Link href="/privacy" className="hover:text-ink">Privasi</Link>
            <Link href="/terms" className="hover:text-ink">Terma</Link>
            <Link href="/help" className="hover:text-ink">Bantuan</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
