import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type OAuthConfig = { issuer: string; resource: string; metadata: string; owner: string; client: string };
export function oauthConfig(env: NodeJS.ProcessEnv = process.env): OAuthConfig | null {
  if (env.AGSHARE_OAUTH_ENABLED !== "true") return null;
  const { NEXT_PUBLIC_SUPABASE_URL: base, AGSHARE_OAUTH_PUBLIC_ORIGIN: origin,
    AGSHARE_OAUTH_OWNER_USER_ID: owner, AGSHARE_OAUTH_CLIENT_ID: client } = env;
  if (!base || !origin || !owner) return null;
  try {
    const auth = new URL(base), site = new URL(origin);
    if ([auth, site].some(u => u.protocol !== "https:" || u.username || u.password || u.search || u.hash || u.pathname !== "/")) return null;
    return { issuer: new URL("/auth/v1", auth).href, resource: new URL("/api/agshare/mcp", site).href,
      metadata: new URL("/.well-known/oauth-protected-resource", site).href, owner, client: client ?? "" };
  } catch { return null; }
}
const keys = new Map<string, JWTVerifyGetKey>();
function signingKeys(issuer: string): JWTVerifyGetKey {
  let key = keys.get(issuer);
  if (!key) {
    key = createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"), { timeoutDuration: 5000 });
    keys.set(issuer, key);
  }
  return key;
}
export async function verifyOAuthToken(token: string, config: OAuthConfig, key?: JWTVerifyGetKey): Promise<"read" | null> {
  try {
    if (!config.client || !token || token.length > 16384) return null;
    const { payload } = await jwtVerify(token, key ?? signingKeys(config.issuer), {
      issuer: config.issuer, audience: config.resource, algorithms: ["ES256", "RS256"],
      requiredClaims: ["sub", "iat", "exp", "client_id", "role", "agshare_access"],
      maxTokenAge: "15m",
    });
    // Signed, server-controlled claims only. Never use user_metadata for authorization.
    if (payload.sub !== config.owner || payload.client_id !== config.client ||
        payload.role !== "agshare_mcp" || payload.agshare_access !== "read" ||
        typeof payload.iat !== "number" || typeof payload.exp !== "number" ||
        payload.exp <= payload.iat || payload.exp - payload.iat > 900) return null;
    return "read";
  } catch { return null; }
}
export function oauthChallenge(config: OAuthConfig) {
  return { "WWW-Authenticate": 'Bearer resource_metadata="' + config.metadata + '"', "Cache-Control": "no-store" };
}
