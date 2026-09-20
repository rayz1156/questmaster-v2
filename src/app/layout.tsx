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
  title: "Kuizen",
  description:
    "Kuizen — Learn. Compete. Conquer. Where classrooms become arenas and learners become champions.",
  applicationName: "Kuizen",
  manifest: "/manifest.json",
  openGraph: {
    title: "Kuizen",
    description: "Learn. Compete. Conquer.",
    url: "https://kuizen.fun",
    siteName: "Kuizen",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    type: "website",
  },
  twitter: { card: "summary", title: "Kuizen", description: "Learn. Compete. Conquer.", images: ["/icons/icon-512.png"] },
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
      <body className={inter.className}>
        <ConfirmProvider>{children}</ConfirmProvider>
        <InstallPrompt />
        <AnalyticsTracker />
        <RegisterSW />
      </body>
    </html>
  );
}
