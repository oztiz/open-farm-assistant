import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { BridgeScope } from "../mcp/bridge-auth";

export type AccessClaims = { sub: string; aud: string; scope: BridgeScope; iat: number; exp: number; jti: string };
const MAX_TTL_SECONDS = 15 * 60;

function secret(): Buffer {
  const raw = process.env.AGSHARE_OAUTH_TOKEN_KEY;
  if (!raw || !/^[a-f0-9]{64}$/i.test(raw)) throw new Error("OAuth signing key is not configured");
  return Buffer.from(raw, "hex");
}
function sign(payload: string): Buffer {
  return createHmac("sha256", secret()).update(payload).digest();
}
export function issueAccessToken(subject: string, audience: string, scope: BridgeScope, now = Math.floor(Date.now() / 1000)): string {
  if (!subject || !audience || !["read", "write"].includes(scope)) throw new Error("Invalid access token claims");
  const claims: AccessClaims = { sub: subject, aud: audience, scope, iat: now, exp: now + MAX_TTL_SECONDS, jti: randomBytes(16).toString("hex") };
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${body}.${sign(body).toString("base64url")}`;
}
export function verifyAccessToken(token: string, audience: string, owner: string, now = Math.floor(Date.now() / 1000)): AccessClaims | null {
  try {
    if (!token || token.length > 4096 || token.split(".").length !== 2) return null;
    const [body, signature] = token.split(".");
    const provided = Buffer.from(signature, "base64url");
    const expected = sign(body);
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AccessClaims;
    if (claims.sub !== owner || claims.aud !== audience || !["read", "write"].includes(claims.scope) ||
        !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) ||
        claims.iat > now + 30 || claims.exp <= now || claims.exp - claims.iat > MAX_TTL_SECONDS ||
        typeof claims.jti !== "string" || !/^[a-f0-9]{32}$/.test(claims.jti)) return null;
    return claims;
  } catch { return null; }
}
