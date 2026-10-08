# Private ChatGPT AgShare plugin integration

Status: architecture and security gates, not deployed.

## Chosen boundary
- Private ChatGPT plugin is the user-facing integration.
- Existing OFA `POST /api/agshare/mcp` remains the server-side AgShare adapter.
- `AGSHARE_API_KEY` stays exclusively in OFA/Vercel server environment.
- `AGSHARE_BRIDGE_TOKEN` stays exclusively in OFA/Vercel server environment until an authenticated connector transport is validated.
- No AgShare credentials, static bearer secrets or Supabase refresh tokens in plugin source, plugin manifest, prompt instructions, or URLs.

## Required before plugin creation
1. Verify supported private-plugin authentication and secret injection mechanism, including whether credentials are stored per user or at plugin scope.
2. If a supported secret store is available, configure a plugin-specific, revocable credential with minimum privileges, not the upstream AgShare API key. Verify the plugin never exposes it in tool outputs/logs.
3. If no secure secret transport is supported, do NOT publish or connect the bridge. Resume the OAuth 2.1 + PKCE design instead.
4. Confirm plugin tool runtime can reach the protected HTTPS MCP endpoint and send authenticated requests; no public unauthenticated fallback.
5. Restrict access to the intended OFA owner; separate read and write permissions and require explicit user confirmation before write actions.
6. Exercise negative tests: no credential, invalid credential, cross-user attempt, replay, revoked credential, and attempts to delete a whole field.
7. Keep whole-field deletion unavailable. AB-line edits must use the existing revision and ownership checks.
8. Validate tools/list, read field, get AB lines and update AB lines end-to-end on Preview before any production changes.

## Rollout
- Build and validate a private plugin against a Preview endpoint and test data.
- Never change production secrets to make an unfinished plugin work.
- Do not consider a plugin created, connected, or tested until the respective API returns success.
