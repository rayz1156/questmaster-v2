/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },

  // Next.js tidak melayani folder yang bermula dengan titik dalam app/,
  // jadi app/.well-known/... tidak berfungsi. Rewrite memetakan URL piawai
  // .well-known kepada route handler sebenar.
  //
  // Nota: destination TIDAK membawa query param, kerana param yang ditambah
  // oleh rewrite tidak sampai ke handler dengan pasti. Setiap dokumen ada
  // routenya sendiri.
  // /panduan digantikan oleh /blog. Pengalihan diletakkan di sini dan bukan
  // sebagai halaman yang memanggil permanentRedirect, kerana halaman yang
  // diprarender secara statik memulangkan 308 tanpa pengepala Location, iaitu
  // pengalihan yang tidak mengalih ke mana mana. Diuji, bukan diandaikan.
  //
  // Alamat artikel kekal di bawah /panduan kerana ketiga tiganya sudah
  // dihantar ke Search Console dengan alamat itu.
  async redirects() {
    return [{ source: "/panduan", destination: "/blog", permanent: true }];
  },

  async rewrites() {
    return [
      { source: "/.well-known/oauth-protected-resource", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-protected-resource/api/mcp", destination: "/api/oauth/protected-resource" },
      { source: "/.well-known/oauth-authorization-server", destination: "/api/oauth/authorization-server" },
      { source: "/.well-known/oauth-authorization-server/api/mcp", destination: "/api/oauth/authorization-server" },
      { source: "/.well-known/openid-configuration", destination: "/api/oauth/authorization-server" },
    ];
  },
};

module.exports = nextConfig;
