// lib/mcp/metadata.ts
// Dokumen penemuan OAuth dikongsi oleh dua route handler.
// Kami TIDAK bergantung pada parameter query daripada rewrite Next.js,
// kerana ia tidak sampai dengan pasti. Setiap dokumen ada routenya sendiri.

export const BASE = (process.env.MCP_PUBLIC_URL ?? "https://kuizen.fun").replace(/\/$/, "");

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Cache-Control": "public, max-age=3600",
};

/** RFC 9728 Protected Resource Metadata */
export function protectedResourceDoc() {
  return {
    resource: `${BASE}/api/mcp`,
    authorization_servers: [BASE],
    scopes_supported: ["kuizen:read", "kuizen:write"],
    bearer_methods_supported: ["header"],
    resource_name: "Kuizen MCP",
  };
}

/** RFC 8414 Authorization Server Metadata */
export function authorizationServerDoc() {
  return {
    issuer: BASE,
    authorization_endpoint: `${BASE}/api/oauth/authorize`,
    token_endpoint: `${BASE}/api/oauth/token`,
    registration_endpoint: `${BASE}/api/oauth/register`,
    revocation_endpoint: `${BASE}/api/oauth/revoke`,
    scopes_supported: ["kuizen:read", "kuizen:write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    authorization_response_iss_parameter_supported: true,
  };
}
