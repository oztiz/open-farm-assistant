# AgShare MCP OAuth rollout plan

Status: design only; NOT implemented or deployed.

## Existing system
- Production Next.js route: POST /api/agshare/mcp.
- The route currently compares Authorization: Bearer against AGSHARE_BRIDGE_TOKEN.
- AGSHARE_API_KEY remains server-side.
- Four tools: list/get/create/update fields. No whole-field deletion.

## Required implementation
1. OAuth 2.1-compatible authorization server with Authorization Code + PKCE (S256), refresh tokens, token revocation, and metadata discovery at /.well-known/oauth-authorization-server (and protected resource metadata for the MCP route).
2. Bind authorization to an authenticated OFA owner session; never let a public visitor self-authorize against the single shared AgShare account. Require explicit consent and enforce allowed redirect URIs, clients and scopes.
3. Store authorization codes, refresh-token hashes, client registrations and grants in durable storage with expiry, single-use enforcement, rotation and revocation. Do not rely on Vercel function memory.
4. Validate short-lived access tokens on /api/agshare/mcp, with issuer, audience, expiry and scopes. Preserve existing trusted-backend bearer behavior only through an explicit, separate, non-public migration path.
5. Return standards-compliant WWW-Authenticate challenge and OAuth metadata. Validate MCP transport requirements and Origin.
6. Keep AGSHARE_API_KEY and AGSHARE_BRIDGE_TOKEN in server-only Vercel secrets. Never log or return either secret.
7. Restrict create/update to an explicit write scope; read scope is separate. No whole-field delete tool.
8. Add automated tests for PKCE, redirect URI matching, expired/reused codes, refresh rotation, owner authorization, audience/scope rejection, token revocation, and existing AgShare tools.
9. Deploy Preview, perform a real ChatGPT connector authorization test, verify unauthorized calls fail, and only then promote to Production.

## Release gates
- No production secret or existing AgShare data changes during implementation.
- OAuth support is not complete until end-to-end login and tools/list/tools/call are verified through ChatGPT.
- Manual field deletion remains AgShare-website-only.
