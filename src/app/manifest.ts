import type { MetadataRoute } from 'next';
import { BRANDING } from '@/lib/branding.config';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRANDING.product.fullName,
    short_name: BRANDING.product.name,
    description: BRANDING.product.description,
    theme_color: BRANDING.colors.primary,
    background_color: BRANDING.colors.navyDeepest,
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
