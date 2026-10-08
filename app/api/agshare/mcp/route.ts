import { NextRequest, NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { UUID, Field, ownedField, requestAgShare, revision, uploadPayload, UpstreamError } from "./client";
import { oauthConfig, oauthChallenge, verifyOAuthToken } from "./oauth-auth";
import { testFixturesEnabled } from "./test-fixture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
const coordinate = { type: "object", properties: { latitude: { type: "number", minimum: -90, maximum: 90 }, longitude: { type: "number", minimum: -180, maximum: 180 } }, required: ["latitude", "longitude"], additionalProperties: false };
const properties = {
  name: { type: "string", minLength: 1, maxLength: 200 },
  origin: coordinate, is_public: { type: "boolean" },
  boundaries: { type: "array", items: { type: "array", minItems: 3, items: coordinate } },
  ab_lines: { type: "array", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["AB", "Curve"] }, coords: { type: "array", minItems: 2, items: coordinate } }, required: ["name", "type", "coords"], additionalProperties: false } },
};
const identity = { field_id: { type: "string", format: "uuid" }, expected_revision: { type: "string" }, expected_name: { type: "string" } };
const TOOLS = [
  { name: "agshare_list_fields", description: "List fields owned by the configured account.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "agshare_get_field", description: "Read field boundaries and AB lines, plus a revision for guarded edits.", inputSchema: { type: "object", properties: { field_id: identity.field_id }, required: ["field_id"], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "agshare_create_field", description: "Create a new private field with a new ID. Returns the new ID. Never retries writes automatically.", inputSchema: { type: "object", properties, required: ["name", "origin", "boundaries", "ab_lines"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false } },
  { name: "agshare_update_field", description: "Update an owned field. Read it first and supply expected revision and name. Omitted properties are preserved. Supplied AB-line and boundary arrays replace those entire arrays; retain every item that should remain.", inputSchema: { type: "object", properties: { ...identity, ...properties }, required: ["field_id", "expected_revision", "expected_name"], additionalProperties: false }, annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false } },
];
function rpc(id: Rpc["id"], result: unknown) { return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result }, { headers: { "Cache-Control": "no-store" } }); }
function err(id: Rpc["id"], code: number, message: string) { return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { headers: { "Cache-Control": "no-store" } }); }
function result(id: Rpc["id"], data: unknown, extra = {}) { return rpc(id, { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: { data, ...extra } }); }
export async function POST(req: NextRequest) {
  const token = process.env.AGSHARE_BRIDGE_TOKEN;
  const key = testFixturesEnabled() ? "test-fixtures-only" : process.env.AGSHARE_API_KEY;
  const config = oauthConfig();
  if (!key || (!token && !config)) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const origin = req.headers.get("origin");
  if (origin && (!config || origin !== new URL(config.resource).origin)) {
    return NextResponse.json({ error: "Forbidden origin" }, { status: 403 });
  }
  const supplied = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  let scope: "read" | "write" | null = token && supplied.length === expected.length && timingSafeEqual(supplied, expected) ? "write" : null;
  if (!scope && config) {
    const authorization = req.headers.get("authorization") ?? "";
    if (authorization.startsWith("Bearer ")) scope = await verifyOAuthToken(authorization.slice(7), config);
  }
  if (!scope) return NextResponse.json({ error: "Unauthorized" }, { status: 401,
    headers: config ? oauthChallenge(config) : { "Cache-Control": "no-store" } });
  let body: Rpc;
  try { const raw = await req.text(); if (Buffer.byteLength(raw) > 2000000) return err(null, -32600, "Request too large"); body = JSON.parse(raw); }
  catch { return err(null, -32700, "Parse error"); }
  if (!body || Array.isArray(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") return err(body?.id, -32600, "Invalid Request");
  if (body.id === undefined) return new NextResponse(null, { status: 202 });
  if (body.method === "initialize") return rpc(body.id, { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "ofa-agshare", version: "0.2.0" } });
  if (body.method === "ping") return rpc(body.id, {});
  if (body.method === "tools/list") return rpc(body.id, { tools: TOOLS.filter(t => scope === "write" || t.annotations.readOnlyHint) });
  if (body.method !== "tools/call") return err(body.id, -32601, "Method not found");
  const name = body.params?.name;
  const args = body.params?.arguments ?? {};
  if (!args || typeof args !== "object" || Array.isArray(args)) return err(body.id, -32602, "Invalid arguments");
  const tool = TOOLS.find(t => t.name === name);
  if (!tool || Object.keys(args).some(k => !(k in tool.inputSchema.properties))) return err(body.id, -32602, "Invalid tool name or arguments");
  if (scope !== "write" && !tool.annotations.readOnlyHint) return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  let wrote = false;
  let writtenId: string | undefined;
  try {
    if (name === "agshare_list_fields") return result(body.id, await requestAgShare("/api/fields", key));
    if (name === "agshare_create_field") {
      const payload = uploadPayload(args);
      const id = randomUUID(); writtenId = id;
      wrote = true;
      await requestAgShare(`/api/fields/${id}`, key, "PUT", payload);
      const data = await requestAgShare(`/api/fields/${id}`, key) as Field;
      return result(body.id, data, { revision: revision(data), created: true });
    }
    if (typeof args.field_id !== "string" || !UUID.test(args.field_id)) return err(body.id, -32602, "Invalid field id");
    const id = args.field_id;
    const current = await ownedField(id, key);
    if (name === "agshare_get_field") return result(body.id, current, { revision: revision(current) });
    if (args.expected_name !== current.name || args.expected_revision !== revision(current)) return err(body.id, -32602, "Field changed or confirmation does not match; read the field again");
    const payload = uploadPayload(args, current);
    wrote = true; writtenId = id;
    await requestAgShare(`/api/fields/${id}`, key, "PUT", payload);
    const data = await requestAgShare(`/api/fields/${id}`, key) as Field;
    return result(body.id, data, { revision: revision(data), updated: true });
  } catch (error) {
    const message = error instanceof UpstreamError ? error.message : !wrote && error instanceof Error ? error.message : "AgShare request failed";
    return rpc(body.id, { isError: true, content: [{ type: "text", text: message + (wrote ? `. A write was attempted for ${writtenId}; read its state before retrying.` : "") }] });
  }
}
export async function GET() { return NextResponse.json({ name: "OFA AgShare MCP", version: "0.2.0" }, { headers: { "Cache-Control": "no-store" } }); }
