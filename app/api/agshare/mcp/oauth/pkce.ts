import { createHash, timingSafeEqual } from "node:crypto";

// Pure PKCE helpers. This module does not issue tokens or authorize callers.
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

export function isValidCodeVerifier(value: unknown): value is string {
  return typeof value === "string" && VERIFIER.test(value);
}

export function isValidS256Challenge(value: unknown): value is string {
  return typeof value === "string" && CHALLENGE.test(value);
}

export function deriveS256Challenge(verifier: string): string {
  if (!isValidCodeVerifier(verifier)) throw new Error("Invalid PKCE verifier");
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export function verifyS256Challenge(verifier: unknown, challenge: unknown): boolean {
  if (!isValidCodeVerifier(verifier) || !isValidS256Challenge(challenge)) return false;
  const actual = Buffer.from(deriveS256Challenge(verifier), "ascii");
  const expected = Buffer.from(challenge, "ascii");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
