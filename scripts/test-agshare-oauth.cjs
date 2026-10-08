const { test } = require("node:test");
const assert = require("node:assert/strict");
const { oauthConfig, verifyOAuthToken } = require("../.agshare-test-build/api/agshare/mcp/oauth-auth.js");
const { POST } = require("../.agshare-test-build/api/agshare/mcp/route.js");
const { GET } = require("../.agshare-test-build/.well-known/oauth-protected-resource/route.js");
const { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } = require("jose");

const env = { AGSHARE_OAUTH_ENABLED: "true", NEXT_PUBLIC_SUPABASE_URL: "https://auth.example.test",
  AGSHARE_OAUTH_PUBLIC_ORIGIN: "https://ofa.example.test", AGSHARE_OAUTH_OWNER_USER_ID: "owner",
  AGSHARE_OAUTH_CLIENT_ID: "agshare-client" };
const config = oauthConfig(env);
let privateKey, resolver, jwk;
async function setup() {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  jwk = { ...await exportJWK(pair.publicKey), kid: "fixture-key", alg: "ES256", use: "sig" };
  resolver = createLocalJWKSet({ keys: [jwk] });
}
async function sign(changes = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: config.owner, client_id: config.client, role: "agshare_mcp",
    agshare_access: "read", iss: config.issuer, aud: config.resource, iat: now, exp: now + 900, ...changes })
    .setProtectedHeader({ alg: "ES256", kid: "fixture-key" }).sign(privateKey);
}
function req(token, method = "tools/list", params, origin) {
  return new Request(config.resource, { method: "POST", headers: {
    authorization: "Bearer " + token, ...(origin ? { origin } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
}
test("isolated owner-only OAuth connection", async t => {
  await setup();
  await t.test("disabled or incomplete configuration fails closed", () => {
    assert.equal(oauthConfig({ ...env, AGSHARE_OAUTH_ENABLED: "false" }), null);
    assert.equal(oauthConfig({ ...env, AGSHARE_OAUTH_OWNER_USER_ID: "" }), null);
    assert.equal(oauthConfig({ ...env, AGSHARE_OAUTH_PUBLIC_ORIGIN: "http://ofa.example.test" }), null);
  });
  await t.test("accepts only signed resource-bound isolated read token", async () => {
    assert.equal(await verifyOAuthToken(await sign(), config, resolver), "read");
    assert.equal(await verifyOAuthToken(await sign(), { ...config, client: "" }, resolver), null);
    for (const changes of [
      { sub: "other" }, { client_id: "another-client" }, { client_id: undefined },
      { role: "authenticated" }, { agshare_access: "write" }, { agshare_access: undefined },
      { aud: "authenticated" }, { iss: "https://evil.example.test/auth/v1" },
      { exp: Math.floor(Date.now() / 1000) - 1 }, { exp: Math.floor(Date.now() / 1000) + 3600 },
      { iat: Math.floor(Date.now() / 1000) + 60 }, { exp: undefined },
    ]) assert.equal(await verifyOAuthToken(await sign(changes), config, resolver), null);
    const parts = (await sign()).split(".");
    const signature = Buffer.from(parts[2], "base64url");
    signature[0] ^= 1; parts[2] = signature.toString("base64url");
    assert.equal(await verifyOAuthToken(parts.join("."), config, resolver), null);
  });
  await t.test("OAuth-only route works without a bridge credential", async () => {
    Object.assign(process.env, env, { AGSHARE_API_KEY: "fixture-only" });
    delete process.env.AGSHARE_BRIDGE_TOKEN;
    const previous = global.fetch;
    let upstreamCalls = 0;
    global.fetch = async url => {
      if (String(url) === config.issuer + "/.well-known/jwks.json") return Response.json({ keys: [jwk] });
      upstreamCalls++;
      return Response.json([]);
    };
    try {
      const token = await sign();
      const list = await (await POST(req(token))).json();
      assert.deepEqual(list.result.tools.map(t => t.name), ["agshare_list_fields", "agshare_get_field"]);
      assert.equal((await POST(req(token, "tools/call", { name: "agshare_update_field", arguments: {} }))).status, 403);
      assert.equal(upstreamCalls, 0);
      assert.equal((await POST(req(token, "tools/call", { name: "agshare_list_fields", arguments: {} }))).status, 200);
      assert.equal(upstreamCalls, 1);
      const unauthenticated = await POST(req("garbage"));
      assert.equal(unauthenticated.status, 401);
      assert.ok(unauthenticated.headers.get("www-authenticate").includes(config.metadata));
      assert.equal((await POST(req(token, "tools/list", undefined, "https://evil.example.test"))).status, 403);
      const metadata = await (await GET()).json();
      assert.equal(metadata.resource, config.resource);
      assert.deepEqual(metadata.authorization_servers, [config.issuer]);
      assert.deepEqual(metadata.scopes_supported, ["openid"]);
      process.env.AGSHARE_BRIDGE_TOKEN = "fixture-bridge";
      const legacy = await (await POST(req("fixture-bridge"))).json();
      assert.equal(legacy.result.tools.length, 4);
      delete process.env.AGSHARE_BRIDGE_TOKEN;
    } finally { global.fetch = previous; }
  });
});
