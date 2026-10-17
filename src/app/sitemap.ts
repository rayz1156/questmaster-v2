import type { MetadataRoute } from 'next';
import { BRANDING } from '@/lib/branding.config';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${BRANDING.migration.newDomain}`;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, priority: 1.0, changeFrequency: 'weekly' },
    { url: `${base}/demo`, lastModified: now, priority: 0.9, changeFrequency: 'monthly' },
    { url: `${base}/login`, lastModified: now, priority: 0.7, changeFrequency: 'yearly' },
    { url: `${base}/legal/privacy`, lastModified: now, priority: 0.5, changeFrequency: 'yearly' },
    { url: `${base}/legal/terms`, lastModified: now, priority: 0.5, changeFrequency: 'yearly' },
    { url: `${base}/legal/pdpa`, lastModified: now, priority: 0.5, changeFrequency: 'yearly' },
  ];
}
