import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OFA_MCP_TOKEN = process.env.OFA_MCP_TOKEN;

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };

const TOOLS = [
  { name: "ofa_list_entities", description: "List OFA farm entities from the production database.", inputSchema: { type: "object", properties: { entity_type: { type: "string" } }, additionalProperties: false } },
  { name: "ofa_list_memories", description: "List recent OFA memories, optionally linked to an entity.", inputSchema: { type: "object", properties: { entity_id: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "ofa_list_fertilizer_calculations", description: "List stored OFA fertilizer calculations.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "ofa_list_diesel_calculations", description: "List stored OFA diesel calculations.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: "ofa_list_contractor_work", description: "List structured contractor work stored in OFA.", inputSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false } },
] as const;

function reply(id: RpcRequest["id"], result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}
function error(id: RpcRequest["id"], code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}
function authorized(req: NextRequest) {
  if (!OFA_MCP_TOKEN) return false;
  return req.headers.get("authorization") === `Bearer ${OFA_MCP_TOKEN}`;
}
async function sb(path: string) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("OFA MCP server configuration is incomplete");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status}`);
  return res.json();
}
function limit(value: unknown) {
  const n = Number(value ?? 25);
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 25;
}
async function callTool(name: string, args: any) {
  if (name === "ofa_list_entities") {
    const filter = args?.entity_type ? `&entity_type=eq.${encodeURIComponent(args.entity_type)}` : "";
    return sb(`ofa_entities?select=id,entity_type,name,description,metadata,current_odometer_km,current_engine_hours,meter_reading_at&order=name.asc${filter}`);
  }
  if (name === "ofa_list_memories") {
    const n = limit(args?.limit);
    if (args?.entity_id) {
      const links = await sb(`ofa_memory_entities?select=memory_id&entity_id=eq.${encodeURIComponent(args.entity_id)}`);
      const ids = links.map((x: { memory_id: string }) => x.memory_id);
      if (!ids.length) return [];
      return sb(`ofa_memories?select=id,occurred_at,recorded_at,memory_type,title,content,source,importance,status,metadata,odometer_km,engine_hours&id=in.(${ids.join(",")})&order=occurred_at.desc.nullslast,recorded_at.desc&limit=${n}`);
    }
    return sb(`ofa_memories?select=id,occurred_at,recorded_at,memory_type,title,content,source,importance,status,metadata,odometer_km,engine_hours&order=occurred_at.desc.nullslast,recorded_at.desc&limit=${n}`);
  }
  const tables: Record<string,string> = {
    ofa_list_fertilizer_calculations: "ofa_fertilizer_calculations",
    ofa_list_diesel_calculations: "ofa_diesel_calculations",
    ofa_list_contractor_work: "ofa_contractor_work",
  };
  const table = tables[name];
  if (table) return sb(`${table}?select=*&order=recorded_at.desc&limit=${limit(args?.limit)}`);
  throw new Error("Unknown OFA MCP tool");
}

export async function GET() {
  return NextResponse.json({ name: "Open Farm Assistant MCP", protocolVersion: "2025-06-18", status: "ok" });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: RpcRequest;
  try { body = await req.json(); } catch { return error(null, -32700, "Parse error"); }
  try {
    if (body.method === "initialize") return reply(body.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "ofa-mcp", version: "0.1.0" } });
    if (body.method === "notifications/initialized") return new NextResponse(null, { status: 202 });
    if (body.method === "ping") return reply(body.id, {});
    if (body.method === "tools/list") return reply(body.id, { tools: TOOLS });
    if (body.method === "tools/call") {
      const name = String(body.params?.name ?? "");
      const data = await callTool(name, body.params?.arguments ?? {});
      return reply(body.id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
    }
    return error(body.id, -32601, "Method not found");
  } catch (e) {
    return error(body.id, -32000, e instanceof Error ? e.message : "OFA MCP error");
  }
}
