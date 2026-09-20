import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Rangka untuk halaman dasar privasi dan terma.
 *
 * Dua halaman itu berkongsi susunan yang sama, jadi susunan itu tinggal di
 * satu tempat. Lebar dihadkan kepada satu lajur bacaan: teks undang-undang
 * yang merentangi skrin penuh tidak dibaca sesiapa.
 */
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#FCFBF9" }}>
      <div className="px-8 pt-7">
        <Link href="/" aria-label="Kuizen">
          <Logo size={30} />
        </Link>
      </div>

      <div className="flex-1 px-6 py-12">
        <div className="mx-auto w-full max-w-[680px]">
          <h1 className="text-[34px] leading-tight font-semibold tracking-tight text-ink">{title}</h1>
          <p className="text-sm text-ink-faint mt-2">Last updated {updated}</p>
          <div className="mt-10 space-y-8">{children}</div>

          <div className="mt-16 border-t border-hairline pt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <Link href="/privacy" className="text-brand-purple hover:underline">Privacy</Link>
            <Link href="/terms" className="text-brand-purple hover:underline">Terms</Link>
            <Link href="/help" className="text-brand-purple hover:underline">Help</Link>
          </div>
        </div>
      </div>

      <div className="pb-8 text-center text-xs text-ink-faint tracking-wide">
        UPSI &nbsp;·&nbsp; AFK &nbsp;·&nbsp; Veltrix
      </div>
    </div>
  );
}

/** Satu seksyen: tajuk kecil, kemudian perenggan. */
export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-title mb-2">{heading}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}
