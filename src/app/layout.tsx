import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import RegisterSW from "@/components/pwa/RegisterSW";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';

// Inter: satu muka taip untuk seluruh aplikasi. Berat 400 hingga 700 sahaja;
// apa-apa lebih daripada itu hanya menambah saiz muat turun.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://kuizen.fun"),
  title: {
    default: "Kuizen: Platform Kuiz Interaktif dan Gamifikasi Bilik Darjah",
    template: "%s | Kuizen",
  },
  description:
    "Platform kuiz interaktif dan gamifikasi pembelajaran untuk pendidik. Cipta kuiz bilik darjah, jalankan sesi PdPc langsung, lihat markah serta merta.",
  applicationName: "Kuizen",
  manifest: "/manifest.json",
  openGraph: {
    title: "Kuizen: Platform Kuiz Interaktif dan Gamifikasi Bilik Darjah",
    description: "Cipta kuiz bilik darjah interaktif dan jalankan sesi PdPc langsung.",
    url: "https://kuizen.fun",
    siteName: "Kuizen",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    type: "website",
  },
  twitter: { card: "summary", title: "Kuizen", description: "Platform kuiz interaktif dan gamifikasi bilik darjah.", images: ["/icons/icon-512.png"] },
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

export const viewport: Viewport = {
  themeColor: "#7057D9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
      <body className={inter.className}>
        <ConfirmProvider>{children}</ConfirmProvider>
        <InstallPrompt />
        <AnalyticsTracker />
        <RegisterSW />
      </body>
    </html>
  );
}
