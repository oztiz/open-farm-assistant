# Private AgShare connection

The private [AgShare plugin](https://chatgpt.com/plugins/plugin_asdk_app_6ac80b5214c081919d483686e209f2a4) reads the owner's fields, boundaries and AB lines through `/api/agshare/mcp`. It reuses OFA's Supabase login only for identity. Database access remains a separate Supabase plugin connection.

## Production configuration

Server configuration: `AGSHARE_API_KEY`, `AGSHARE_OAUTH_ENABLED=true`, `AGSHARE_OAUTH_PUBLIC_ORIGIN`, `AGSHARE_OAUTH_OWNER_USER_ID`, `AGSHARE_OAUTH_CLIENT_ID` and the exact `AGSHARE_OAUTH_REDIRECT_URI`. Keep credentials server-side. OFA retains its public Supabase URL and publishable key.

Supabase uses the OFA site URL and `/agshare/connect` for authorization. Register a public PKCE client with the exact ChatGPT callback; no client secret is needed. The production access-token hook handles only that client's AgShare branch, preserving ordinary OFA claims and the existing audience behavior of other clients.

Tokens require the exact owner, client and MCP audience, role `agshare_mcp`, capability `agshare_access=read`, and at most 900 seconds of lifetime. The isolated role must have no table privileges or membership for authenticator. Never authorize from user-editable metadata. The consent page accepts only the configured AgShare client; older OAuth clients cannot start new sessions through it.

OAuth exposes only `agshare_list_fields` and `agshare_get_field`. Existing bridge credentials retain their separate behavior. There is no synthetic-data switch or bundled test plugin in production.

## Validation and recovery

Run `npm run test:agshare:oauth`, type checking and lint before deployment. Regression tests mock upstream fetch locally; no live credentials or database writes are needed. Production reads returned nine private fields and Storjordet's boundary and two AB lines on 8 October 2026.

Disable `AGSHARE_OAUTH_ENABLED` and redeploy to stop OAuth MCP requests. Revoking a grant stops renewal; an issued access token can remain valid for up to 15 minutes. Immediate revocation requires an authoritative lookup. Token refresh and revocation have not been tested end to end.
