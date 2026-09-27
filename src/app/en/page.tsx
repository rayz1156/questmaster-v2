import LandingPage, { metadataLanding } from "@/components/LandingPage";

/** Halaman utama awam dalam Bahasa Inggeris. Versi BM di "/". */
export const metadata = metadataLanding("en");

export default function HomeEn() {
  return <LandingPage bahasa="en" />;
}
