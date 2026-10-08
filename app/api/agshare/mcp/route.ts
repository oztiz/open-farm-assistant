import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOOLS = [
  { name: "agshare_list_fields", description: "List fields owned by the configured AgShare account.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "agshare_get_field", description: "Read one AgShare field, including boundaries and AB lines.", inputSchema: { type: "object", properties: { field_id: { type: "string", format: "uuid" } }, required: ["field_id"], additionalProperties: false } },
];
function rpc(id: Rpc["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: { "Cache-Control": "no-store" } });
}
function err(id: Rpc["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}
async function readAgShare(path: string, key: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://agshare.agopengps.com${path}`, {
      headers: { Accept: "application/json", Authorization: `ApiKey ${key}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AgShare returned HTTP ${response.status}`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timeout);
  }
}
export async function POST(req: NextRequest) {
  const token = process.env.AGSHARE_BRIDGE_TOKEN;
  const key = process.env.AGSHARE_API_KEY;
  if (!token || !key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="AgShare MCP"' } });
  }
  let body: Rpc;
  try { body = await req.json() as Rpc; }
  catch { return err(null, -32700, "Parse error"); }
  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") return err(body.id, -32600, "Invalid Request");
  if (body.method === "initialize") return rpc(body.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "ofa-agshare", version: "0.1.0" } });
  if (body.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
  if (body.method === "ping") return rpc(body.id, {});
  if (body.method === "tools/list") return rpc(body.id, { tools: TOOLS });
  if (body.method !== "tools/call") return err(body.id, -32601, "Method not found");
  const name = body.params?.name;
  const args = body.params?.arguments ?? {};
  let path: string;
  if (name === "agshare_list_fields") path = "/api/fields";
  else if (name === "agshare_get_field" && typeof args.field_id === "string" && UUID.test(args.field_id)) path = `/api/fields/${args.field_id}`;
  else return err(body.id, -32602, "Invalid tool name or arguments");
  try {
    const data = await readAgShare(path, key);
    return rpc(body.id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { data } });
  } catch {
    return err(body.id, -32000, "AgShare request failed");
  }
}
export async function GET() {
  return NextResponse.json({ name: "OFA AgShare MCP", status: "configured separately" }, { headers: { "Cache-Control": "no-store" } });
}
