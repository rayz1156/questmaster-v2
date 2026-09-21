import type { MetadataRoute } from "next";

/**
 * Hanya halaman awam dibenarkan. Segala yang di sebalik log masuk, dan semua
 * laluan yang membawa kod jemputan atau token, dihalang: ia tiada nilai dalam
 * hasil carian dan kod di dalamnya tidak sepatutnya tersebar.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/educator/",
          "/participant/",
          "/auth/",
          "/oauth/",
          "/live/",
          "/join/",
          "/tjoin/",
          "/pending-approval",
          "/reset-password",
          "/forgot-password",
        ],
      },
    ],
    sitemap: "https://kuizen.fun/sitemap.xml",
    host: "https://kuizen.fun",
  };
}
