import type { MetadataRoute } from "next";

/**
 * Hanya halaman awam disenaraikan. Menyenaraikan halaman di sebalik log masuk
 * hanya menghasilkan ralat perangkak, bukan trafik.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://kuizen.fun", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://kuizen.fun/register", lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: "https://kuizen.fun/login", lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: "https://kuizen.fun/blog", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: "https://kuizen.fun/panduan/cara-buat-kuiz-online", lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: "https://kuizen.fun/panduan/apa-itu-pdpc", lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: "https://kuizen.fun/panduan/alternatif-kahoot", lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: "https://kuizen.fun/help", lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: "https://kuizen.fun/privacy", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: "https://kuizen.fun/terms", lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
