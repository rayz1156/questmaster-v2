import Link from "next/link";
import { KuizenAcademyLogo } from "@/components/branding/KuizenAcademyLogo";

export const dynamic = "force-dynamic";

// Halaman utama StafKita Akademi.
// Prinsip: satu mesej, satu tindakan. Hanya ciri yang benar-benar ada dalam aplikasi.

const ciri = [
  {
    tajuk: "Kursus dan kuiz",
    teks: "Bina kursus, kuiz dan tugasan untuk staf dalam satu kelas.",
    ikon: "M4 6h16M4 12h16M4 18h10",
  },
  {
    tajuk: "Belajar berpasukan",
    teks: "Staf belajar dalam pasukan. Markah terkumpul dalam papan pendahulu.",
    ikon: "M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  },
  {
    tajuk: "Sijil yang boleh disemak",
    teks: "Setiap sijil ada pautan semakan sendiri.",
    ikon: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12M8.2 13.9 7 22l5-3 5 3-1.2-8.1",
  },
];

const langkah = [
  { n: "1", tajuk: "Cipta kelas", teks: "Satu kelas untuk satu kursus, satu jabatan atau satu kohort." },
  { n: "2", tajuk: "Jemput staf", teks: "Staf menyertai dengan kod kelas atau pautan jemputan." },
  { n: "3", tajuk: "Lihat kemajuan", teks: "Pantau markah setiap staf dan keluarkan sijil apabila selesai." },
];

const soalan = [
  {
    s: "Apakah StafKita Akademi?",
    j: "Platform pembelajaran untuk latihan staf. Pendidik mencipta kelas, kursus dan kuiz. Staf belajar dalam pasukan, mengumpul markah dan menerima sijil.",
  },
  {
    s: "Bagaimana staf menyertai kelas?",
    j: "Pendidik memberi kod kelas lapan aksara atau pautan jemputan. Staf log masuk, kemudian tampal kod atau buka pautan itu.",
  },
  {
    s: "Bolehkah sijil disahkan oleh pihak lain?",
    j: "Boleh. Setiap sijil mempunyai pautan semakan yang boleh dibuka oleh sesiapa sahaja.",
  },
  {
    s: "Adakah ia berfungsi di telefon?",
    j: "Ya. Semua halaman direka untuk skrin telefon, dan aplikasi boleh dipasang terus dari pelayar.",
  },
];

function Ikon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <Link href="/" aria-label="StafKita Akademi" className="flex items-center">
          <KuizenAcademyLogo variant="horizontal" height={32} />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
          <a href="#ciri" className="hover:text-slate-900">Ciri</a>
          <a href="#cara" className="hover:text-slate-900">Cara guna</a>
          <a href="#soalan" className="hover:text-slate-900">Soalan</a>
          <Link href="/help" className="hover:text-slate-900">Bantuan</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2">Log masuk</Link>
          <Link href="/register" className="hidden sm:inline-flex text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded px-4 py-2 transition">Daftar</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
      <p className="text-sm font-medium text-primary mb-5">Untuk pasukan latihan dan HR</p>
      <h1 className="font-display font-extrabold text-slate-900 text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
        Latih staf anda.<br />
        <span className="text-primary">Lihat hasilnya.</span>
      </h1>
      <p className="mt-6 text-lg sm:text-xl text-slate-500 max-w-xl mx-auto">
        Kursus, kuiz dan sijil staf. Semua dalam satu tempat.
      </p>
      <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link href="/register" className="w-full sm:w-auto inline-flex items-center justify-center text-base font-semibold text-white bg-primary hover:bg-primary-hover rounded px-7 py-3.5 transition">
          Mula sekarang
        </Link>
        <Link href="/login" className="w-full sm:w-auto inline-flex items-center justify-center text-base font-medium text-slate-700 border border-slate-200 hover:border-slate-300 rounded px-7 py-3.5 transition">
          Saya sudah ada akaun
        </Link>
      </div>
      <Pratonton />
    </section>
  );
}

// Gambaran antara muka (ilustrasi sahaja, bukan data sebenar)
function Pratonton() {
  const pasukan = [
    { nama: "Pasukan Jualan", markah: 920, lebar: 92 },
    { nama: "Pasukan Operasi", markah: 860, lebar: 86 },
    { nama: "Pasukan Kewangan", markah: 780, lebar: 78 },
  ];
  return (
    <div className="mt-16 sm:mt-20 mx-auto max-w-4xl text-left">
      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_3px_12px_1px_rgba(44,55,130,0.15)] overflow-hidden">
        <div className="flex">
          <aside className="hidden sm:flex w-48 flex-col gap-1 bg-[#101924] p-4 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-[#4f6178] mb-2">Kelas</span>
            {["Kursus", "Aktiviti", "Pasukan", "Sijil", "Laporan"].map((m, i) => (
              <span key={m} className={i === 2 ? "text-[#6576ff] font-medium py-1.5" : "text-[#6e82a5] py-1.5"}>{m}</span>
            ))}
          </aside>
          <div className="flex-1 p-5 sm:p-7">
            <p className="text-xs text-slate-400">Kelas</p>
            <p className="font-display font-bold text-slate-800 text-lg">Latihan Khidmat Pelanggan</p>
            <div className="mt-5 space-y-4">
              {pasukan.map((p, i) => (
                <div key={p.nama}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-700"><span className="text-slate-400 mr-2">{i + 1}</span>{p.nama}</span>
                    <span className="font-semibold text-slate-800">{p.markah}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${p.lebar}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">Gambaran antara muka</p>
    </div>
  );
}

function Ciri() {
  return (
    <section id="ciri" className="bg-slate-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <h2 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl text-center tracking-tight">
          Satu kelas. Semua latihan.
        </h2>
        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {ciri.map((c) => (
            <div key={c.tajuk} className="text-center sm:text-left">
              <div className="inline-flex w-11 h-11 items-center justify-center rounded bg-primary-subtle text-primary">
                <Ikon d={c.ikon} />
              </div>
              <h3 className="mt-5 font-display font-bold text-xl text-slate-900">{c.tajuk}</h3>
              <p className="mt-2 text-slate-500 leading-relaxed">{c.teks}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cara() {
  return (
    <section id="cara" className="scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <h2 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl text-center tracking-tight">
          Tiga langkah.
        </h2>
        <ol className="mt-14 grid gap-10 sm:grid-cols-3">
          {langkah.map((l) => (
            <li key={l.n} className="text-center">
              <span className="inline-flex w-12 h-12 items-center justify-center rounded-full border-2 border-primary text-primary font-display font-extrabold text-lg">{l.n}</span>
              <h3 className="mt-5 font-display font-bold text-xl text-slate-900">{l.tajuk}</h3>
              <p className="mt-2 text-slate-500 leading-relaxed max-w-xs mx-auto">{l.teks}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Soalan() {
  return (
    <section id="soalan" className="bg-slate-50 scroll-mt-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <h2 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl text-center tracking-tight">
          Soalan ringkas. Jawapan jelas.
        </h2>
        <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
          {soalan.map((q) => (
            <details key={q.s} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display font-bold text-lg text-slate-900">
                {q.s}
                <span className="text-primary text-2xl leading-none transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-3 text-slate-500 leading-relaxed">{q.j}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Penutup() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-24 sm:py-32 text-center">
      <h2 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl tracking-tight">
        Latihan seterusnya, lebih bermakna.
      </h2>
      <Link href="/register" className="mt-9 inline-flex items-center justify-center text-base font-semibold text-white bg-primary hover:bg-primary-hover rounded px-8 py-3.5 transition">
        Mula sekarang
      </Link>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
        <KuizenAcademyLogo variant="horizontal" height={26} />
        <nav className="flex flex-wrap justify-center gap-6">
          <Link href="/help" className="hover:text-slate-800">Bantuan</Link>
          <Link href="/legal/privacy" className="hover:text-slate-800">Privasi</Link>
          <Link href="/legal/terms" className="hover:text-slate-800">Terma</Link>
          <Link href="/legal/pdpa" className="hover:text-slate-800">PDPA</Link>
        </nav>
        <span>&copy; {new Date().getFullYear()} StafKita Akademi</span>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <main className="bg-white text-slate-900">
      <Nav />
      <Hero />
      <Ciri />
      <Cara />
      <Soalan />
      <Penutup />
      <Footer />
    </main>
  );
}
