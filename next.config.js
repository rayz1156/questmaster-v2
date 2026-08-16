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
