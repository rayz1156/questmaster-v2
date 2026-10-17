import type { MetadataRoute } from 'next';
import { BRANDING } from '@/lib/branding.config';
export default function robots(): MetadataRoute.Robots {
  const base = `https://${BRANDING.migration.newDomain}`;
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api', '/creator', '/admin', '/learn', '/participant', '/manager', '/org'] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
