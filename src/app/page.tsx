import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import LandingSessionCheck from "@/components/LandingSessionCheck";

/**
 * Halaman utama awam.
 *
 * Sebelum ini fail ini hanya mengalihkan ke /login, jadi kuizen.fun tidak
 * mempunyai satu pun halaman yang boleh diindeks atau dipetik oleh enjin AI.
 * Halaman ini dihidangkan dari pelayan sebagai HTML penuh: itu syaratnya
 * supaya perangkak dan enjin jawapan nampak teksnya tanpa menjalankan
 * JavaScript.
 *
 * Pengguna yang sudah log masuk dialihkan ke papan pemuka mereka oleh
 * LandingSessionCheck di sisi klien. Perangkak tiada sesi, jadi mereka
 * sentiasa nampak halaman ini.
 */

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

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Apakah itu Kuizen?",
    a: "Kuizen ialah platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik. Guru dan pensyarah mencipta kelas, membina kuiz dan aktiviti, menjalankan sesi langsung di dalam bilik darjah, dan melihat markah serta papan pendahulu terkumpul serta merta.",
  },
  {
    q: "Adakah pelajar perlu membuka akaun untuk menyertai kuiz langsung?",
    a: "Tidak. Untuk sesi kuiz langsung, pelajar boleh masuk dengan kod sesi dan nama panggilan sahaja. Akaun hanya diperlukan apabila pelajar mahu menyertai kelas secara berterusan dan menyimpan rekod markah mereka.",
  },
  {
    q: "Bagaimana cara mencipta kuiz di Kuizen?",
    a: "Daftar akaun pendidik, cipta satu kelas, kemudian tambah kuiz kepada kelas itu. Soalan boleh ditaip terus atau diimport secara pukal daripada fail CSV, jadi bank soalan sedia ada tidak perlu ditaip semula.",
  },
  {
    q: "Berapa cara pelajar boleh menyertai kelas atau kuiz?",
    a: "Tiga cara: mengimbas kod QR, membuka pautan jemputan, atau memasukkan kod ringkas. Pilihan itu ada supaya sesi berjalan lancar sama ada di dalam bilik darjah dengan projektor atau dari jauh.",
  },
  {
    q: "Apakah beza Kuizen berbanding platform kuiz konvensional?",
    a: "Kuizen menggabungkan kuiz langsung, aktiviti yang dinilai, papan pembelajaran dan papan pendahulu kelas dalam satu tempat, jadi markah daripada semua aktiviti itu terkumpul dalam satu papan pendahulu yang sama. Kandungan juga boleh disediakan sepenuhnya dalam Bahasa Melayu.",
  },
  {
    q: "Adakah Kuizen sesuai untuk universiti dan kolej?",
    a: "Ya. Kelas di Kuizen tidak terikat kepada tingkatan sekolah. Pensyarah IPT menggunakannya untuk penglibatan kuliah, pentaksiran formatif dan kerja berkumpulan, dan pendidik bersama boleh dijemput ke dalam kelas yang sama.",
  },
];

const CIRI = [
  {
    tajuk: "Kuiz langsung di dalam bilik darjah",
    teks: "Papar soalan pada skrin, pelajar menjawab dari telefon masing-masing. Ada kira detik pilihan, markah berganda dan bonus giliran berturut-turut, jadi tempo sesi terjaga dari soalan pertama hingga akhir.",
  },
  {
    tajuk: "Papan pendahulu yang bermakna",
    teks: "Markah daripada kuiz langsung dan aktiviti kelas terkumpul dalam satu papan pendahulu, lengkap dengan anak tangga tiga teratas. Pelajar nampak kedudukan mereka bergerak, bukan sekadar satu markah di hujung.",
  },
  {
    tajuk: "Import soalan secara pukal",
    teks: "Bank soalan sedia ada boleh dimasukkan melalui fail CSV. Tidak perlu menaip semula soalan yang sudah ada dalam fail Excel atau dokumen lama.",
  },
  {
    tajuk: "Tiga cara menyertai",
    teks: "Kod QR untuk diimbas dari projektor, pautan untuk dihantar dalam kumpulan WhatsApp, atau kod ringkas untuk ditaip. Pilih yang paling sesuai dengan keadaan kelas.",
  },
  {
    tajuk: "Papan pembelajaran dan penghantaran",
    teks: "Selain kuiz, kelas boleh mempunyai papan untuk pelajar menghantar kerja, berkongsi idea dan memperkenalkan diri. Semuanya dalam kelas yang sama.",
  },
  {
    tajuk: "Pendidik bersama",
    teks: "Jemput guru atau pensyarah lain ke dalam kelas yang sama. Sesuai untuk mata pelajaran yang diajar berpasangan atau kursus yang dikongsi antara pensyarah.",
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
    <div className="min-h-screen flex flex-col" style={{ background: "#FCFBF9" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <LandingSessionCheck />

      <header className="px-6 sm:px-8 pt-7">
        <div className="mx-auto w-full max-w-shell flex items-center justify-between gap-4">
          <Logo size={30} />
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/login" className="btn-quiet">Log masuk</Link>
            <Link href="/register" className="btn-primary">Daftar</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-6 sm:px-8 pt-16 pb-14">
          <div className="mx-auto w-full max-w-[760px] text-center">
            <p className="eyebrow">Untuk guru sekolah dan pensyarah IPT</p>
            <h1 className="mt-3 text-[38px] sm:text-[46px] leading-[1.1] font-semibold tracking-tight text-ink">
              Platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik
            </h1>
            <p className="mt-5 text-[17px] sm:text-[19px] leading-relaxed text-ink-muted">
              Cipta kuiz bilik darjah interaktif, jalankan sesi PdPc langsung, dan lihat markah
              serta papan pendahulu terkumpul serta merta. Tiada perisian untuk dipasang, cukup
              dengan pelayar web.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="btn-primary">Daftar akaun pendidik</Link>
              <Link href="/login" className="btn-secondary">Sudah ada akaun</Link>
            </div>
            <p className="mt-4 text-sm text-ink-faint">
              Akaun pendidik disemak oleh pentadbir sebelum kelas boleh dicipta.
            </p>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-14 border-t border-hairline">
          <div className="mx-auto w-full max-w-shell">
            <h2 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
              Ciri utama kuiz interaktif Kuizen
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-muted max-w-[680px]">
              Kuizen dibina untuk satu keadaan yang khusus: satu bilik darjah, satu guru, dan
              pelajar yang perlu terlibat sepanjang waktu itu.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {CIRI.map((c) => (
                <div key={c.tajuk} className="card p-6">
                  <h3 className="section-title">{c.tajuk}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{c.teks}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-14 border-t border-hairline">
          <div className="mx-auto w-full max-w-[760px]">
            <h2 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
              Gamifikasi pembelajaran untuk sekolah dan institusi pengajian tinggi
            </h2>
            <div className="mt-5 space-y-4 text-[17px] leading-relaxed text-ink-muted">
              <p>
                Gamifikasi bukan bermakna menambah lencana pada kerja rumah. Yang mengubah
                penglibatan pelajar ialah maklum balas segera, kedudukan yang boleh dilihat
                bergerak, dan sebab untuk mencuba soalan seterusnya.
              </p>
              <p>
                Di Kuizen, setiap kuiz langsung dan setiap aktiviti yang dinilai menyumbang kepada
                papan pendahulu kelas yang sama. Pelajar yang lemah dalam satu kuiz masih boleh naik
                melalui kerja berkumpulan atau penghantaran aktiviti, jadi kedudukan itu mencerminkan
                usaha sepanjang kursus dan bukan satu hari yang malang.
              </p>
              <p>
                Untuk pensyarah IPT, kelas tidak terikat kepada tingkatan atau sukatan sekolah. Satu
                kelas boleh mewakili satu kursus, satu kohort atau satu bengkel, dengan pendidik
                bersama dijemput masuk apabila kursus dikongsi.
              </p>
            </div>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-14 border-t border-hairline">
          <div className="mx-auto w-full max-w-[760px]">
            <h2 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
              Soalan lazim
            </h2>
            <dl className="mt-8 space-y-7">
              {FAQ.map((f) => (
                <div key={f.q}>
                  <dt className="section-title">{f.q}</dt>
                  <dd className="mt-2 text-[16px] leading-relaxed text-ink-muted">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="px-6 sm:px-8 py-16 border-t border-hairline">
          <div className="mx-auto w-full max-w-[680px] text-center">
            <h2 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">
              Mulakan kelas pertama anda
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">
              Daftar, cipta satu kelas, dan jalankan kuiz langsung pertama anda pada waktu
              pengajaran yang seterusnya.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="btn-primary">Daftar sekarang</Link>
              <Link href="/help" className="btn-secondary">Pusat bantuan</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="px-6 sm:px-8 py-10 border-t border-hairline">
        <div className="mx-auto w-full max-w-shell flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="text-ink-faint">Kuizen</span>
          <Link href="/privacy" className="text-brand-purple hover:underline">Privasi</Link>
          <Link href="/terms" className="text-brand-purple hover:underline">Terma</Link>
          <Link href="/help" className="text-brand-purple hover:underline">Bantuan</Link>
          <Link href="/login" className="text-brand-purple hover:underline">Log masuk</Link>
        </div>
      </footer>
    </div>
  );
}
