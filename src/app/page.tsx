import Link from "next/link";
import { KuizenAcademyLogo } from "@/components/branding/KuizenAcademyLogo";
import { teks } from "@/i18n/teks";

export const dynamic = "force-dynamic";

// Halaman utama produk.
// Prinsip: satu mesej, satu tindakan. Hanya ciri yang benar-benar ada dalam aplikasi.

// Laluan ikon untuk setiap kad ciri (indeks selari dengan teks.utama.ciri)
const IKON_CIRI = [
  "M4 6h16M4 12h16M4 18h10",
  "M17 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M21 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12M8.2 13.9 7 22l5-3 5 3-1.2-8.1",
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
        <Link href="/" aria-label={teks.jenama.nama} className="flex items-center">
          <KuizenAcademyLogo variant="horizontal" height={32} />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600">
          <a href="#ciri" className="hover:text-slate-900">{teks.utama.navCiri}</a>
          <a href="#cara" className="hover:text-slate-900">{teks.utama.navCara}</a>
          <a href="#soalan" className="hover:text-slate-900">{teks.utama.navSoalan}</a>
          <Link href="/help" className="hover:text-slate-900">{teks.utama.navBantuan}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2">{teks.utama.navLogMasuk}</Link>
          <Link href="/register" className="hidden sm:inline-flex text-sm font-medium text-white bg-primary hover:bg-primary-hover rounded px-4 py-2 transition">{teks.utama.navDaftar}</Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-16 text-center">
      <p className="text-sm font-medium text-primary mb-5">{teks.utama.heroPinggir}</p>
      <h1 className="font-display font-extrabold text-slate-900 text-5xl sm:text-6xl lg:text-7xl leading-[1.05] tracking-tight">
        {teks.utama.hero1}<br />
        <span className="text-primary">{teks.utama.hero2}</span>
      </h1>
      <p className="mt-6 text-lg sm:text-xl text-slate-500 max-w-xl mx-auto">
        {teks.utama.heroSub}
      </p>
      <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link href="/register" className="w-full sm:w-auto inline-flex items-center justify-center text-base font-semibold text-white bg-primary hover:bg-primary-hover rounded px-7 py-3.5 transition">
          {teks.utama.mula}
        </Link>
        <Link href="/login" className="w-full sm:w-auto inline-flex items-center justify-center text-base font-medium text-slate-700 border border-slate-200 hover:border-slate-300 rounded px-7 py-3.5 transition">
          {teks.utama.sudahAkaun}
        </Link>
      </div>
      <Pratonton />
    </section>
  );
}

// Gambaran antara muka (ilustrasi sahaja, bukan data sebenar)
function Pratonton() {
  const pasukan = [
    { nama: teks.utama.pratontonPasukan[0].nama, markah: 920, lebar: 92 },
    { nama: teks.utama.pratontonPasukan[1].nama, markah: 860, lebar: 86 },
    { nama: teks.utama.pratontonPasukan[2].nama, markah: 780, lebar: 78 },
  ];
  return (
    <div className="mt-16 sm:mt-20 mx-auto max-w-4xl text-left">
      <div className="rounded-lg border border-slate-200 bg-white shadow-[0_3px_12px_1px_rgba(44,55,130,0.15)] overflow-hidden">
        <div className="flex">
          <aside className="hidden sm:flex w-48 flex-col gap-1 bg-[#101924] p-4 text-sm">
            <span className="text-[11px] uppercase tracking-wider text-[#4f6178] mb-2">{teks.utama.pratontonKelas}</span>
            {teks.utama.pratontonMenu.map((m, i) => (
              <span key={m} className={i === 2 ? "text-[#6576ff] font-medium py-1.5" : "text-[#6e82a5] py-1.5"}>{m}</span>
            ))}
          </aside>
          <div className="flex-1 p-5 sm:p-7">
            <p className="text-xs text-slate-400">{teks.utama.pratontonKelas}</p>
            <p className="font-display font-bold text-slate-800 text-lg">{teks.utama.pratontonTajuk}</p>
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
      <p className="mt-3 text-center text-xs text-slate-400">{teks.utama.pratonton}</p>
    </div>
  );
}

function Ciri() {
  return (
    <section id="ciri" className="bg-slate-50 scroll-mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-28">
        <h2 className="font-display font-extrabold text-slate-900 text-3xl sm:text-5xl text-center tracking-tight">
          {teks.utama.ciriTajuk}
        </h2>
        <div className="mt-14 grid gap-10 sm:grid-cols-3">
          {teks.utama.ciri.map((c, i) => (
            <div key={c.tajuk} className="text-center sm:text-left">
              <div className="inline-flex w-11 h-11 items-center justify-center rounded bg-primary-subtle text-primary">
                <Ikon d={IKON_CIRI[i]} />
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
          {teks.utama.caraTajuk}
        </h2>
        <ol className="mt-14 grid gap-10 sm:grid-cols-3">
          {teks.utama.langkah.map((l, i) => (
            <li key={String(i + 1)} className="text-center">
              <span className="inline-flex w-12 h-12 items-center justify-center rounded-full border-2 border-primary text-primary font-display font-extrabold text-lg">{i + 1}</span>
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
          {teks.utama.soalanTajuk}
        </h2>
        <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
          {teks.utama.soalan.map((q) => (
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
        {teks.utama.penutup}
      </h2>
      <Link href="/register" className="mt-9 inline-flex items-center justify-center text-base font-semibold text-white bg-primary hover:bg-primary-hover rounded px-8 py-3.5 transition">
        {teks.utama.mula}
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
          <Link href="/help" className="hover:text-slate-800">{teks.utama.footerBantuan}</Link>
          <Link href="/legal/privacy" className="hover:text-slate-800">{teks.utama.footerPrivasi}</Link>
          <Link href="/legal/terms" className="hover:text-slate-800">{teks.utama.footerTerma}</Link>
          <Link href="/legal/pdpa" className="hover:text-slate-800">{teks.utama.footerPdpa}</Link>
        </nav>
        <span>&copy; {new Date().getFullYear()} {teks.jenama.nama}</span>
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
