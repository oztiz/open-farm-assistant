import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 protected-resource metadata. Do not advertise OAuth until an
// authorization server is configured. This endpoint does not grant access.
export async function GET() {
  const origin = process.env.AGSHARE_OAUTH_PUBLIC_ORIGIN;
  const issuer = process.env.AGSHARE_OAUTH_ISSUER;
  if (!origin || !issuer) {
    return NextResponse.json({ error: "OAuth not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  let resource: URL;
  let authorizationServer: URL;
  try {
    resource = new URL("/api/agshare/mcp", origin);
    authorizationServer = new URL(issuer);
    if (resource.protocol !== "https:" || authorizationServer.protocol !== "https:" ||
        resource.origin !== new URL(origin).origin || authorizationServer.username || authorizationServer.password) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid OAuth configuration" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({
    resource: resource.href,
    authorization_servers: [authorizationServer.href],
    scopes_supported: ["agshare:read", "agshare:write"],
    bearer_methods_supported: ["header"]
  }, { headers: { "Cache-Control": "no-store" } });
}
