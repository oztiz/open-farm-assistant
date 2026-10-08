import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AGSHARE_ORIGIN = "https://agshare.agopengps.com";
const FIELD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const apiKey = process.env.AGSHARE_API_KEY;
  const bridgeToken = process.env.AGSHARE_BRIDGE_TOKEN;
  if (!apiKey || !bridgeToken) {
    return NextResponse.json({ error: "AgShare bridge not configured" }, { status: 503 });
  }

  const supplied = request.headers.get("authorization");
  if (supplied !== `Bearer ${bridgeToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (id !== null && !FIELD_ID.test(id)) {
    return NextResponse.json({ error: "Invalid field id" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const endpoint = id ? `/api/fields/${id}` : "/api/fields";
    const response = await fetch(`${AGSHARE_ORIGIN}${endpoint}`, {
      headers: {
        Accept: "application/json",
        Authorization: `ApiKey ${apiKey}`,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "AgShare request failed", upstreamStatus: response.status },
        { status: response.status === 401 || response.status === 403 ? 502 : response.status },
      );
    }
    const data: unknown = await response.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "AgShare unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
