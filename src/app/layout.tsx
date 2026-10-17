import type { Metadata, Viewport } from "next";
import { Roboto, Nunito } from "next/font/google";
import "./globals.css";
import InstallPrompt from "@/components/pwa/InstallPrompt";
import RegisterSW from "@/components/pwa/RegisterSW";
import TranslateWidget from "@/components/TranslateWidget";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { BRANDING } from '@/lib/branding.config';

// Fon tema StafKita: badan Roboto, tajuk Nunito
const roboto = Roboto({ subsets: ["latin"], weight: ["300","400","500","700"], variable: "--font-roboto" });
const nunito = Nunito({ subsets: ["latin"], weight: ["400","600","700","800"], variable: "--font-nunito" });

export const metadata: Metadata = {
  metadataBase: new URL(`https://${BRANDING.migration.newDomain}`),
  title: BRANDING.product.fullName,
  description:
    BRANDING.product.description,
  applicationName: BRANDING.product.name,
  manifest: "/manifest.json",
  openGraph: {
    title: BRANDING.product.fullName,
    description: BRANDING.product.tagline,
    url: `https://${BRANDING.migration.newDomain}`,
    siteName: BRANDING.product.name,
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    type: "website",
  },
  twitter: { card: "summary", title: BRANDING.product.fullName, description: BRANDING.product.tagline, images: ["/icons/icon-512.png"] },
  appleWebApp: {
    capable: true,
    title: BRANDING.product.fullName,
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
  themeColor: BRANDING.colors.primary,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ms">
      <body data-app="kuizen-academy" className={`${roboto.variable} ${nunito.variable} ${roboto.className}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          'name': BRANDING.product.fullName,
          'alternateName': ['StafKita Akademi', 'Kuizen LMS'],
          'applicationCategory': 'BusinessApplication',
          'applicationSubCategory': 'Learning Management System',
          'operatingSystem': 'Web',
          'description': 'Platform pembelajaran korporat StafKita Akademi untuk latihan pekerja, pematuhan dan pembangunan tenaga kerja',
          'url': `https://${BRANDING.migration.newDomain}`,
          'provider': {
            '@type': 'Organization',
            'name': 'Veltrix Technology Centre Sdn Bhd',
            'alternateName': 'Veltrix Technology Center',
            'url': 'https://www.veltrix.technology',
            'description': 'An UPSI Spin-Off Initiative',
            'areaServed': ['Malaysia', 'ASEAN'],
          },
          'offers': { '@type': 'Offer', 'priceCurrency': 'MYR', 'availability': 'https://schema.org/InStock' },
        }) }} />

        <ConfirmProvider>{children}</ConfirmProvider>
        <InstallPrompt />
        <TranslateWidget />
        <AnalyticsTracker />
        <RegisterSW />
      </body>
    </html>
  );
}
