const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRedirectUri, redirectAllowed } = require("/tmp/ofa-agshare-oauth/redirect.js");
test("only exact registered redirects are accepted", () => {
  const allowed = ["https://chatgpt.com/connector_platform_oauth_redirect", "http://localhost:3000/callback"];
  assert.equal(redirectAllowed(allowed[0], allowed), true);
  assert.equal(redirectAllowed("https://chatgpt.com/connector_platform_oauth_redirect?evil=1", allowed), false);
  assert.equal(redirectAllowed("https://chatgpt.com.evil.test/connector_platform_oauth_redirect", allowed), false);
  assert.equal(redirectAllowed("https://chatgpt.com/connector_platform_oauth_redirect#fragment", allowed), false);
  assert.equal(redirectAllowed("http://example.com/callback", allowed), false);
  assert.equal(redirectAllowed("https://user:pass@chatgpt.com/connector_platform_oauth_redirect", allowed), false);
  assert.equal(redirectAllowed("http://localhost:3000/callback", allowed), true);
});
test("invalid redirect inputs are rejected", () => {
  assert.equal(normalizeRedirectUri(null), null);
  assert.equal(normalizeRedirectUri("javascript:alert(1)"), null);
  assert.equal(normalizeRedirectUri("https://*.example.com"), null);
});
