import LandingPage, { metadataLanding } from "@/components/LandingPage";

/**
 * Halaman utama awam dalam Bahasa Melayu. Versi Inggeris di /en.
 * Susun atur dan teks kedua dua versi ada dalam components/LandingPage.tsx
 * dan lib/landing-copy.ts.
 */
export const metadata = metadataLanding("ms");

export default function Home() {
  return <LandingPage bahasa="ms" />;
}
