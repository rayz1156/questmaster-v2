import type { MetadataRoute } from "next";
import { ARTIKEL, pautan } from "@/lib/blog";

const TAPAK = "https://kuizen.fun";

/**
 * Hanya halaman awam disenaraikan. Menyenaraikan halaman di sebalik log masuk
 * hanya menghasilkan ralat perangkak, bukan trafik.
 *
 * Artikel diambil terus daripada daftar dalam src/lib/blog.ts. Sebelum ini
 * senarai artikel ditulis dua kali, di sini dan di daftar itu, jadi artikel
 * baharu boleh muncul di /blog tetapi hilang daripada sitemap tanpa sesiapa
 * perasan. Satu sumber sahaja menghapuskan kemungkinan itu.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const tetap: MetadataRoute.Sitemap = [
    { url: TAPAK, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${TAPAK}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${TAPAK}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${TAPAK}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${TAPAK}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${TAPAK}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${TAPAK}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];

  const artikel: MetadataRoute.Sitemap = ARTIKEL.map((a) => ({
    url: `${TAPAK}${pautan(a)}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.9,
  }));

  return [...tetap, ...artikel];
}
