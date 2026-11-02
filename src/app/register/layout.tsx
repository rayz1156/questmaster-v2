import type { Metadata } from "next";
import { bahasaPelayan } from "@/lib/i18n/pelayan";
import { terjemah } from "@/lib/i18n";

/**
 * Halaman ini komponen klien, jadi ia tidak boleh mengeksport metadata
 * sendiri. Layout pelayan nipis ini membawanya, tanpa menyentuh logik
 * halaman itu.
 *
 * Metadata ikut bahasa pengguna (KZ-040): dibaca daripada kuki kz_lang
 * melalui bahasaPelayan, sama seperti metadata akar.
 */
export function generateMetadata(): Metadata {
  const bahasa = bahasaPelayan();
  return {
    title: terjemah(bahasa, "auth.registerTitle"),
    description: terjemah(bahasa, "auth.registerDescription"),
    alternates: { canonical: "https://kuizen.fun/register" },
  };
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}