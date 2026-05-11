"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { track } from '@/lib/analytics';

// Mounted once in root layout. Fires a page_view on every route change.
export default function AnalyticsTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    track('page_view', { path: pathname });
  }, [pathname]);
  return null;
}
