import { Suspense } from "react";
import BorangNaikTaraf from "./BorangNaikTaraf";

/**
 * Halaman minat pelan (tiket V2-006). Bahasa Inggeris seperti bahagian
 * aplikasi lain. useSearchParams memerlukan Suspense dan halaman ini
 * force-dynamic supaya parameter pelan sentiasa dibaca semasa jalan.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Upgrade your Kuizen plan",
  description: "Tell us which Kuizen plan you are interested in and we will contact you by email.",
};

export default function NaikTarafPage() {
  return (
    <main className="min-h-screen bg-white">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[560px] px-6 py-24 text-center text-sm text-ink-muted">
            Loading...
          </div>
        }
      >
        <BorangNaikTaraf />
      </Suspense>
    </main>
  );
}
