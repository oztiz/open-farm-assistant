import { NextRequest, NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const runtime = "nodejs";
const COOKIE = "__Host-agshare_oauth_session";
const MAX_AGE = 15 * 60;

function key(): Buffer {
  const secret = process.env.AGSHARE_OAUTH_SESSION_KEY;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) throw new Error("Session key not configured");
  return Buffer.from(secret, "hex");
}

function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
}

function decrypt(value: string): string {
  const buf = Buffer.from(value, "base64url");
  if (buf.length < 29) throw new Error("Invalid cookie");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const expected = process.env.AGSHARE_OAUTH_PUBLIC_ORIGIN;
  if (!origin || !host || !expected) return false;
  try {
    const url = new URL(expected);
    return url.protocol === "https:" && origin === url.origin && host === url.host;
  } catch { return false; }
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return noStore(NextResponse.json({ error: "Forbidden origin" }, { status: 403 }));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !apiKey || !process.env.AGSHARE_OAUTH_SESSION_KEY) {
    return noStore(NextResponse.json({ error: "Not configured" }, { status: 503 }));
  }
  let input: { email?: unknown; password?: unknown };
  try { input = await req.json(); } catch { return noStore(NextResponse.json({ error: "Invalid request" }, { status: 400 })); }
  if (typeof input.email !== "string" || typeof input.password !== "string" ||
      input.email.length > 320 || input.password.length > 1024 || !input.email || !input.password) {
    return noStore(NextResponse.json({ error: "Invalid credentials" }, { status: 400 }));
  }
  try {
    const result = await fetch(new URL("/auth/v1/token?grant_type=password", url), {
      method: "POST", headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: input.email, password: input.password }),
      cache: "no-store",
    });
    if (!result.ok) return noStore(NextResponse.json({ error: "Invalid credentials" }, { status: 401 }));
    const auth = await result.json() as { access_token?: string; user?: { id?: string } };
    if (!auth.access_token || !auth.user?.id) throw new Error("Missing authenticated identity");
    const verify = await fetch(new URL("/auth/v1/user", url), {
      headers: { apikey: apiKey, Authorization: `Bearer ${auth.access_token}` }, cache: "no-store",
    });
    if (!verify.ok) throw new Error("Identity verification failed");
    const verified = await verify.json() as { id?: string };
    if (verified.id !== auth.user.id) throw new Error("Identity mismatch");
    const ownerId = process.env.AGSHARE_OAUTH_OWNER_USER_ID;
    if (!ownerId || verified.id !== ownerId) return noStore(NextResponse.json({ error: "Access denied" }, { status: 403 }));
    const now = Math.floor(Date.now() / 1000);
    const token = encrypt(JSON.stringify({ sub: verified.id, iat: now, exp: now + MAX_AGE }));
    const response = NextResponse.json({ authenticated: true, expires_in: MAX_AGE });
    response.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: MAX_AGE });
    return noStore(response);
  } catch {
    return noStore(NextResponse.json({ error: "Authentication unavailable" }, { status: 503 }));
  }
}

export async function GET(req: NextRequest) {
  const value = req.cookies.get(COOKIE)?.value;
  if (!value) return noStore(NextResponse.json({ authenticated: false }, { status: 401 }));
  try {
    const payload = JSON.parse(decrypt(value)) as { sub?: string; exp?: number };
    if (!payload.sub || payload.sub !== process.env.AGSHARE_OAUTH_OWNER_USER_ID ||
        typeof payload.exp !== "number" || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error();
    return noStore(NextResponse.json({ authenticated: true, expires_at: payload.exp }));
  } catch { return noStore(NextResponse.json({ authenticated: false }, { status: 401 })); }
}

export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return noStore(NextResponse.json({ error: "Forbidden origin" }, { status: 403 }));
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0 });
  return noStore(response);
}
