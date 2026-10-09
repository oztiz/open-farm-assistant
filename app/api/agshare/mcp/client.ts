import { createHash } from "node:crypto";

export type Coord = { latitude: number; longitude: number };
export type Track = { name: string; type: string; coords: Coord[] };
export type Field = { id: string; name: string; latitude: number; longitude: number; isPublic: boolean; boundaries: Coord[][]; abLines: Track[]; updatedAt: string };
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class UpstreamError extends Error { constructor(public status: number) { super(`AgShare returned HTTP ${status}`); } }
export function revision(field: Field) { return createHash("sha256").update(JSON.stringify(field)).digest("hex"); }
export async function requestAgShare(path: string, key: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch(`https://agshare.agopengps.com${path}`, {
    method, headers: { Accept: "application/json", Authorization: `ApiKey ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), cache: "no-store", signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!response.ok) throw new UpstreamError(response.status);
  const text = await response.text();
  if (!text) return null;
  if (!response.headers.get("content-type")?.includes("json")) throw new Error("AgShare returned an unexpected response");
  return JSON.parse(text);
}
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function coord(v: unknown): v is Coord {
  return object(v) && typeof v.latitude === "number" && Number.isFinite(v.latitude) && Math.abs(v.latitude) <= 90 && typeof v.longitude === "number" && Number.isFinite(v.longitude) && Math.abs(v.longitude) <= 180;
}
function rings(v: unknown): v is Coord[][] { return Array.isArray(v) && v.length <= 100 && v.every(r => Array.isArray(r) && r.length >= 3 && r.length <= 20000 && r.every(coord)); }
function tracks(v: unknown): v is Track[] { return Array.isArray(v) && v.length <= 1000 && v.every(t => object(t) && typeof t.name === "string" && t.name.length > 0 && t.name.length <= 200 && ["AB", "Curve"].includes(String(t.type)) && Array.isArray(t.coords) && t.coords.length >= 2 && t.coords.length <= 20000 && t.coords.every(coord)); }
export function uploadPayload(input: Record<string, unknown>, current?: Field) {
  const name = input.name ?? current?.name;
  const origin = input.origin ?? (current && { latitude: current.latitude, longitude: current.longitude });
  const boundaries = input.boundaries ?? current?.boundaries;
  const abLines = input.ab_lines ?? current?.abLines;
  const isPublic = input.is_public ?? current?.isPublic ?? false;
  if (typeof name !== "string" || !name.trim() || name.length > 200 || !coord(origin) || !rings(boundaries) || !tracks(abLines) || typeof isPublic !== "boolean") throw new Error("Invalid field data: check name, coordinates, boundaries and AB lines");
  return { name, origin, isPublic, boundary: { outer: boundaries[0] ?? [], holes: boundaries.slice(1) }, abLines };
}
export async function ownedField(id: string, key: string): Promise<Field> {
  const own = await requestAgShare("/api/fields", key) as { id: string }[];
  if (!Array.isArray(own) || !own.some(f => f.id.toLowerCase() === id.toLowerCase())) throw new Error("Field is not owned by the configured account");
  return await requestAgShare(`/api/fields/${id}`, key) as Field;
}
