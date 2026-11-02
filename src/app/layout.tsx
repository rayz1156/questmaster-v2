import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import RegisterSW from "@/components/pwa/RegisterSW";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import BicarraChat from "@/components/BicarraChat";
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { bahasaPelayan } from '@/lib/i18n/pelayan';
import { terjemah } from '@/lib/i18n';
import { BahasaProvider } from '@/lib/i18n/BahasaProvider';

// DM Sans: satu muka taip untuk seluruh aplikasi (KZ-020). Fon berubah-ubah
// (variable), jadi tiada `weight` diberi: berat dijana melalui `font-weight`
// pada elemen.
const dmSans = DM_Sans({ subsets: ["latin"], display: "swap" });

// Muka taip paparan untuk tajuk halaman utama. Ia diberikan sebagai pemboleh
// ubah CSS dan bukan sebagai kelas pada body, supaya DM Sans kekal menjadi
// muka taip badan dan hanya tajuk yang memilih untuk menggunakannya.
const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-display",
  display: "swap",
});

// Metadata akar ikut bahasa pengguna (KZ-040): bahasa dibaca daripada kuki
// kz_lang melalui bahasaPelayan. Halaman pemasaran/SEO dikecualikan dan
// kekal dengan teks khusus bahasa masing-masing.
export function generateMetadata(): Metadata {
  const bahasa = bahasaPelayan();
  return {
    metadataBase: new URL("https://kuizen.fun"),
    title: {
      default: terjemah(bahasa, "meta.title"),
      template: "%s | Kuizen",
    },
    description: terjemah(bahasa, "meta.description"),
    applicationName: "Kuizen",
    manifest: "/manifest.json",
    openGraph: {
      title: terjemah(bahasa, "meta.title"),
      description: terjemah(bahasa, "meta.ogDescription"),
      url: "https://kuizen.fun",
      siteName: "Kuizen",
      images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
      type: "website",
    },
    twitter: { card: "summary", title: "Kuizen", description: terjemah(bahasa, "meta.twitterDescription"), images: ["/icons/icon-512.png"] },
    appleWebApp: {
      capable: true,
      title: "Kuizen",
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#854fff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Bahasa awal dibaca di pelayan supaya HTML pertama (termasuk lang) sudah
  // betul tanpa kelipan English selepas hidrat (KZ-040).
  const bahasa = bahasaPelayan();
  return (
    <html lang={bahasa} className={playfair.variable}>
      <head>
        {/* VisitorTracking. Skrip vendor memanggil init_tracer selepas ia
            dimuatkan, jadi definisi mesti wujud sebelum itu. Skrip luar
            ditanda defer, jadi ia berjalan selepas HTML selesai dihurai dan
            fungsi di bawah sudah tersedia. */}
        <script async defer src="https://app.visitortracking.com/assets/js/tracer.js" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
  function init_tracer() {
   var tracer = new Tracer({
    websiteId : '13c3aba1-8336-4406-8d41-789e67544b5a',
    async : true,
    debug : false
   });
}
`,
          }}
        />
      </head>
      <body className={dmSans.className}>
        <BahasaProvider bahasaAwal={bahasa}>
          <ConfirmProvider>{children}</ConfirmProvider>
        </BahasaProvider>
        <InstallPrompt />
        <AnalyticsTracker />
        <BicarraChat />
        <RegisterSW />
      </body>
    </html>
  );
}
