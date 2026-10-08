// Run: npx tsc app/api/agshare/mcp/bridge-auth.ts --target es2022 --module commonjs --skipLibCheck --outDir /tmp/ofa-bridge-test && node scripts/test-agshare-bridge-auth.cjs
const assert = require("node:assert/strict");
const { authorizeBridgeToken, bridgeScopeAllows } = require("/tmp/ofa-bridge-test/bridge-auth.js");
const env = { AGSHARE_BRIDGE_TOKEN: "write-secret", AGSHARE_BRIDGE_READ_TOKEN: "read-secret" };
assert.equal(authorizeBridgeToken("Bearer read-secret", env), "read");
assert.equal(authorizeBridgeToken("Bearer write-secret", env), "write");
for (const bad of [null, "", "read-secret", "Bearer wrong", "bearer read-secret"]) {
  assert.equal(authorizeBridgeToken(bad, env), null);
}
assert.equal(authorizeBridgeToken("Bearer same", { AGSHARE_BRIDGE_TOKEN: "same", AGSHARE_BRIDGE_READ_TOKEN: "same" }), null);
assert.equal(authorizeBridgeToken("Bearer read-secret", { AGSHARE_BRIDGE_TOKEN: "write-secret" }), null);
for (const name of ["agshare_list_fields", "agshare_get_field"]) {
  assert.equal(bridgeScopeAllows("read", name), true);
  assert.equal(bridgeScopeAllows("write", name), true);
}
for (const name of ["agshare_create_field", "agshare_update_field"]) {
  assert.equal(bridgeScopeAllows("read", name), false);
  assert.equal(bridgeScopeAllows("write", name), true);
}
assert.equal(bridgeScopeAllows("write", "agshare_delete_field"), false);
assert.equal(bridgeScopeAllows("read", "unknown"), false);
console.log("AgShare bridge auth tests passed");
