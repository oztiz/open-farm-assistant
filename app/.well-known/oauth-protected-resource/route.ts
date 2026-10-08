import { NextResponse } from "next/server";
import { oauthConfig } from "../../api/agshare/mcp/oauth-auth";

export const dynamic = "force-dynamic";
export async function GET() {
  const config = oauthConfig();
  if (!config) return NextResponse.json({ error: "OAuth not configured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ resource: config.resource, authorization_servers: [config.issuer],
    scopes_supported: ["openid"], bearer_methods_supported: ["header"] }, { headers: { "Cache-Control": "no-store" } });
}
