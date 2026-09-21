import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Panduan kedua.
 *
 * Sasarannya kelompok kata kunci PdPc, yang merupakan kelompok terbesar yang
 * kami temui dalam pasaran Malaysia: pdpc, maksud pdpc, apa itu pdpc,
 * pdpc maksud, pdpc nama penuh. Kesemuanya niat maklumat dengan kesukaran
 * belasan hingga dua puluhan.
 *
 * Kandungan dasar disemak terhadap sumber KPM dan bukan ditulis daripada
 * ingatan. Perkara yang tidak dapat disahkan, seperti tahun tepat istilah
 * ini diperkenalkan, sengaja tidak dinyatakan.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export const metadata: Metadata = {
  title: "Apa itu PdPc, dan cara menjadikannya lebih hidup",
  description:
    "PdPc bermaksud Pembelajaran dan Pemudahcaraan. Maksudnya, peranan guru dalam SKPMg2, kaitannya dengan PAK-21, dan lima cara praktikal menjadikan PdPc lebih interaktif.",
  alternates: { canonical: "https://kuizen.fun/panduan/apa-itu-pdpc" },
  openGraph: {
    title: "Apa itu PdPc, dan cara menjadikannya lebih hidup",
    description:
      "Maksud PdPc, peranan guru sebagai pemudah cara, dan lima cara praktikal menjadikannya lebih interaktif.",
    url: "https://kuizen.fun/panduan/apa-itu-pdpc",
    type: "article",
  },
};

const CARA = [
  {
    tajuk: "Mulakan dengan soalan, bukan dengan jawapan",
    teks: "Tanya satu soalan sebelum topik diajar, bukan selepas. Jawapan yang salah pada awal waktu memberitahu anda apa yang murid sudah tahu dan apa yang tidak, dan murid pula menjadi lebih peka kerana mereka sudah melabur satu tekaan.",
  },
  {
    tajuk: "Beri setiap murid tempat untuk menjawab",
    teks: "Dalam kelas empat puluh orang, soalan lisan dijawab oleh lima orang yang sama setiap kali. Alat kuiz mengubah itu kerana semua orang menjawab serentak, dan yang pendiam pun terkumpul dalam data.",
  },
  {
    tajuk: "Tunjukkan keputusan serta merta",
    teks: "Maklum balas yang sampai minggu depan sudah terlambat untuk mengubah apa apa. Apabila taburan jawapan muncul di skrin, anda boleh terus berundur dan mengajar semula bahagian yang jelas tidak difahami.",
  },
  {
    tajuk: "Guna kerja berkumpulan untuk yang sukar",
    teks: "Untuk soalan aras tinggi, minta murid berbincang dalam kumpulan sebelum menjawab. Perbincangan itulah yang menghasilkan pembelajaran; kuiz hanya menjadikannya berstruktur dan boleh dinilai.",
  },
  {
    tajuk: "Kumpul markah merentas masa, bukan satu sesi",
    teks: "Satu kuiz memberi gambaran satu hari. Markah yang terkumpul sepanjang penggal memberi gambaran usaha, dan itu lebih adil kepada murid yang mula perlahan.",
  },
];

const SOALAN = [
  {
    q: "Apa maksud PdPc?",
    a: "PdPc ialah singkatan bagi Pembelajaran dan Pemudahcaraan. Nama penuhnya itu sendiri menerangkan penekanannya: fokus pada pembelajaran murid, dengan guru bertindak sebagai pemudah cara.",
  },
  {
    q: "Apa beza PdPc dengan PdP?",
    a: "PdP merujuk kepada Pengajaran dan Pembelajaran. Perbezaan yang paling ketara ialah pada perkataan kedua. Dalam PdPc, guru diletakkan sebagai pemudah cara proses pembelajaran, bukan sebagai penyampai maklumat semata mata.",
  },
  {
    q: "Di mana PdPc dinilai?",
    a: "PdPc ialah Standard 4 dalam Standard Kualiti Pendidikan Malaysia Gelombang 2, atau SKPMg2. Standard itu menetapkan peranan guru sebagai pemudah cara dalam pembelajaran yang berkesan untuk memperkembangkan potensi murid secara menyeluruh.",
  },
  {
    q: "Apa kaitan PdPc dengan PAK-21?",
    a: "PAK-21, iaitu Pembelajaran Abad ke-21, membawa elemen komunikasi, kolaboratif, pemikiran kritis, kreativiti serta aplikasi nilai murni dan etika. Elemen elemen itu dilaksanakan melalui aktiviti PdPc di dalam bilik darjah.",
  },
  {
    q: "Adakah PdPc bermakna guru kurang mengajar?",
    a: "Tidak. Ia bermakna masa kelas diagihkan berbeza. Penerangan tetap perlu, tetapi sebahagian masa dipindahkan kepada aktiviti yang menuntut murid mencuba, berbincang dan menjawab, kerana di situlah pembelajaran berlaku.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": "https://kuizen.fun/panduan/apa-itu-pdpc#article",
        headline: "Apa itu PdPc, dan cara menjadikannya lebih hidup",
        description:
          "Maksud PdPc, peranan guru sebagai pemudah cara dalam SKPMg2, kaitannya dengan PAK-21, dan lima cara praktikal menjadikannya lebih interaktif.",
        inLanguage: "ms-MY",
        about: { "@type": "Thing", name: "Pembelajaran dan Pemudahcaraan" },
        publisher: { "@id": "https://kuizen.fun/#organization" },
      },
      {
        "@type": "FAQPage",
        "@id": "https://kuizen.fun/panduan/apa-itu-pdpc#faq",
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
            name: "Apa itu PdPc",
            item: "https://kuizen.fun/panduan/apa-itu-pdpc",
          },
        ],
      },
    ],
  };
}

export default function ApaItuPdpc() {
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
            Apa itu PdPc, dan cara menjadikannya lebih hidup
          </h1>

          <p className="mt-5 text-[18px] leading-relaxed text-ink-muted">
            PdPc ialah singkatan bagi <strong className="text-ink">Pembelajaran dan
            Pemudahcaraan</strong>. Nama penuhnya sudah menerangkan maksudnya: tumpuan
            diletakkan pada pembelajaran murid, dan guru bertindak sebagai pemudah cara
            proses itu.
          </p>

          <h2
            style={DISPLAY}
            className="mt-14 text-[28px] leading-tight font-semibold tracking-tight text-ink"
          >
            Beza PdPc dengan PdP
          </h2>
          <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-ink-muted">
            <p>
              Istilah yang lebih lama, dan masih kerap didengar di sekolah, ialah PdP,
              iaitu Pengajaran dan Pembelajaran. Perbezaannya terletak pada perkataan
              kedua, dan perbezaan satu perkataan itu mengubah siapa yang menjadi subjek
              ayat.
            </p>
            <p>
              Dalam PdP, yang di hadapan ialah pengajaran. Dalam PdPc, yang di hadapan
              ialah pembelajaran, dan tugas guru dinyatakan sebagai memudahkan proses itu
              berlaku. Bagi guru yang sudah mengajar bertahun tahun, ini bukan arahan
              untuk berhenti menerangkan. Ia soal bagaimana masa satu waktu itu diagihkan.
            </p>
          </div>

          <h2
            style={DISPLAY}
            className="mt-14 text-[28px] leading-tight font-semibold tracking-tight text-ink"
          >
            PdPc dalam SKPMg2
          </h2>
          <div className="mt-5 space-y-4 text-[16px] leading-relaxed text-ink-muted">
            <p>
              PdPc ialah Standard 4 dalam Standard Kualiti Pendidikan Malaysia Gelombang
              2. Standard itu menetapkan guru berperanan sebagai pemudah cara dalam
              pembelajaran yang berkesan, untuk memperkembangkan potensi murid secara
              menyeluruh dan mencapai tahap optimum secara berterusan.
            </p>
            <p>
              Sebab itu PdPc bukan sekadar istilah dalam mesyuarat. Ia perkara yang
              diperhatikan semasa pencerapan, dan aktiviti yang boleh menunjukkan
              penglibatan murid secara jelas mempunyai nilai praktikal di situ.
            </p>
            <p>
              PdPc juga menjadi tempat elemen PAK-21 dilaksanakan: komunikasi,
              kolaboratif, pemikiran kritis, kreativiti, serta aplikasi nilai murni dan
              etika.
            </p>
          </div>

          <h2
            style={DISPLAY}
            className="mt-14 text-[28px] leading-tight font-semibold tracking-tight text-ink"
          >
            Lima cara menjadikan PdPc lebih interaktif
          </h2>

          <ol className="mt-8 space-y-9">
            {CARA.map((c, i) => (
              <li key={c.tajuk} className="flex gap-5">
                <span
                  className="shrink-0 w-8 h-8 rounded-full bg-[#EDE9FB] text-brand-purple text-[14px] font-semibold flex items-center justify-center"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-ink">{c.tajuk}</h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{c.teks}</p>
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
            Rujukan untuk bahagian maksud dan SKPMg2:{" "}
            <a
              href="https://sites.google.com/moe-dl.edu.my/lisasites/pengenalan"
              rel="nofollow noopener"
              target="_blank"
              className="text-brand-purple hover:underline"
            >
              laman pembelajaran digital KPM mengenai PdPc dan PAK-21
            </a>
            . Bahagian cadangan praktikal ialah pandangan kami sendiri, bukan dokumen
            rasmi.
          </p>

          <div className="mt-12 rounded-[18px] bg-[#EFEAFB] px-6 py-10 text-center">
            <p className="text-[17px] text-ink">
              Mahu mencuba kuiz langsung dalam waktu PdPc anda yang seterusnya?
            </p>
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
