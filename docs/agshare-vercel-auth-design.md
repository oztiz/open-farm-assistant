# AgShare private plugin authentication — Vercel-style boundary

Decision 2026-10-08: use Vercel server-side Secrets for AgShare credentials, never bundle credentials with the ChatGPT plugin.

## Trust boundaries
1. ChatGPT private plugin: requests AgShare operations; no upstream AgShare key.
2. OFA HTTPS MCP endpoint: authenticates each incoming plugin request, authorizes user and operation, logs safe metadata, forwards allowed requests.
3. Vercel Secrets: `AGSHARE_API_KEY` is server-only; no `NEXT_PUBLIC_` prefix.
4. AgShare upstream: receives requests only from OFA.

## Plugin authentication choices
- Preferred: supported ChatGPT plugin per-user OAuth connection to OFA with authorization code + PKCE, owner-bound consent and scoped access tokens.
- Alternative only if the plugin runtime explicitly supports managed, confidential credential injection: a distinct revocable, scope-limited bridge token; never embed it in plugin source/manifest or instructions.
- Vercel `VERCEL_OIDC_TOKEN` authenticates Vercel workloads to supported Vercel services; it does NOT authenticate ChatGPT plugins to OFA.
- Vercel env Secrets protect stored credentials at rest/configuration; they do NOT authenticate incoming plugin requests.

## Configuration
- Production and Preview must use separate secrets; never give Preview production AgShare write access.
- `AGSHARE_API_KEY` remains server-only.
- Existing `AGSHARE_BRIDGE_TOKEN` remains active until migration is tested; no anonymous fallback.
- `AGSHARE_OAUTH_OWNER_USER_ID`, `AGSHARE_OAUTH_SESSION_KEY`, and `AGSHARE_OAUTH_PUBLIC_ORIGIN` only configured for a tested OAuth preview.
- No secret values in git, plugin archive, tool responses, logs or URL parameters.

## Acceptance tests
1. Unauthorized request => 401/403; no tools/data exposed.
2. Owner can list fields; unauthorized user cannot.
3. Read-only scope cannot update; writes require explicit approval.
4. Revision conflict blocks stale AB-line update.
5. Whole-field delete tool absent.
6. Revoked credential fails; no cross-environment token reuse.
7. Plugin can reconnect after token expiry; all flows pass in Preview before production rollout.

Status: design only; plugin authentication capability and end-to-end tests still outstanding.
