// Run after compiling pkce.ts to /tmp/ofa-agshare-oauth/pkce.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deriveS256Challenge, verifyS256Challenge, isValidCodeVerifier } = require("/tmp/ofa-agshare-oauth/pkce.js");
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
test("RFC 7636 S256 vector", () => {
  assert.equal(deriveS256Challenge(verifier), challenge);
  assert.equal(verifyS256Challenge(verifier, challenge), true);
});
test("reject wrong, short and malformed verifiers", () => {
  assert.equal(verifyS256Challenge(verifier + "x", challenge), false);
  assert.equal(verifyS256Challenge("short", challenge), false);
  assert.equal(isValidCodeVerifier("a".repeat(129)), false);
  assert.equal(verifyS256Challenge(verifier, "invalid!"), false);
});
