import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Indeks panduan.
 *
 * Tiga panduan sudah cukup untuk memerlukan satu tempat berkumpul. Halaman
 * ini juga yang menyatukan pautan dalaman: setiap panduan memaut ke sini,
 * dan halaman utama memaut ke sini, jadi halaman baharu diketahui perangkak
 * tanpa bergantung pada sitemap semata mata.
 */

const DISPLAY = { fontFamily: "var(--font-display), Georgia, serif" } as const;

export const metadata: Metadata = {
  title: "Panduan untuk pendidik",
  description:
    "Panduan Kuizen untuk guru dan pensyarah: cara buat kuiz online, maksud PdPc dan cara menjadikannya lebih interaktif, dan cara memilih platform kuiz kelas.",
  alternates: { canonical: "https://kuizen.fun/panduan" },
};

const PANDUAN = [
  {
    href: "/panduan/cara-buat-kuiz-online",
    tajuk: "Cara buat kuiz online untuk kelas anda",
    teks: "Tujuh langkah dari mendaftar hingga sesi kuiz langsung pertama, termasuk cara import soalan sedia ada daripada fail CSV.",
  },
  {
    href: "/panduan/apa-itu-pdpc",
    tajuk: "Apa itu PdPc, dan cara menjadikannya lebih hidup",
    teks: "Maksud PdPc, bezanya dengan PdP, kedudukannya dalam SKPMg2, dan lima cara praktikal menjadikan waktu pengajaran lebih interaktif.",
  },
  {
    href: "/panduan/alternatif-kahoot",
    tajuk: "Alternatif Kahoot untuk kelas di Malaysia",
    teks: "Empat perkara yang benar benar membezakan platform kuiz: had peserta, kos bila kelas membesar, sokongan Bahasa Melayu, dan ke mana markah pergi.",
  },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": "https://kuizen.fun/panduan#list",
    name: "Panduan Kuizen untuk pendidik",
    itemListElement: PANDUAN.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.tajuk,
      url: "https://kuizen.fun" + p.href,
    })),
  };
}

export default function PanduanIndex() {
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
        <div className="mx-auto w-full max-w-[720px]">
          <nav aria-label="Laluan" className="text-[13px] text-ink-faint">
            <Link href="/" className="hover:text-ink">Kuizen</Link>
            <span className="px-2">/</span>
            <span>Panduan</span>
          </nav>

          <h1
            style={DISPLAY}
            className="mt-5 text-[38px] sm:text-[46px] leading-[1.05] font-semibold tracking-tight text-ink"
          >
            Panduan untuk pendidik
          </h1>
          <p className="mt-5 text-[18px] leading-relaxed text-ink-muted">
            Ditulis untuk guru dan pensyarah di Malaysia, dan ditulis supaya berguna
            walaupun anda tidak menggunakan Kuizen.
          </p>

          <div className="mt-12 divide-y divide-hairline border-y border-hairline">
            {PANDUAN.map((p) => (
              <Link key={p.href} href={p.href} className="block py-7 group">
                <h2 className="text-[20px] font-semibold tracking-tight text-ink group-hover:text-brand-purple transition">
                  {p.tajuk}
                </h2>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{p.teks}</p>
              </Link>
            ))}
          </div>

          <div className="mt-14 rounded-[18px] bg-[#EFEAFB] px-6 py-10 text-center">
            <p className="text-[17px] text-ink">Sedia untuk mencuba dengan kelas anda?</p>
            <div className="mt-5">
              <Link href="/register" className="btn-primary">Daftar sebagai pendidik</Link>
            </div>
          </div>
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
