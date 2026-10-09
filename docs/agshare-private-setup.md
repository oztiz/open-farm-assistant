# Private AgShare connection

The private [AgShare plugin](https://chatgpt.com/plugins/plugin_asdk_app_6ac80b5214c081919d483686e209f2a4) reads the owner's fields, boundaries and AB lines through `/api/agshare/mcp`. It reuses OFA's Supabase login only for identity. Database access remains a separate Supabase plugin connection.

## Production configuration

Server configuration: `AGSHARE_API_KEY`, `AGSHARE_OAUTH_ENABLED=true`, `AGSHARE_OAUTH_PUBLIC_ORIGIN`, `AGSHARE_OAUTH_OWNER_USER_ID`, `AGSHARE_OAUTH_CLIENT_ID` and the exact `AGSHARE_OAUTH_REDIRECT_URI`. Keep credentials server-side. OFA retains its public Supabase URL and publishable key.

Supabase uses the OFA site URL and `/agshare/connect` for authorization. Register a public PKCE client with the exact ChatGPT callback; no client secret is needed. The production access-token hook handles only that client's AgShare branch, preserving ordinary OFA claims and the existing audience behavior of other clients.

Tokens require the exact owner, client and MCP audience, role `agshare_mcp`, capability `agshare_access=read`, and at most 900 seconds of lifetime. The isolated role must have no table privileges or membership for authenticator. Never authorize from user-editable metadata. The consent page accepts only the configured AgShare client; older OAuth clients cannot start new sessions through it.

OAuth exposes `agshare_list_fields` and `agshare_get_field`. To enable updating existing fields, the server must set `AGSHARE_OAUTH_ALLOW_UPDATE=true` and the server-controlled token hook must issue `agshare_access=update` for this exact client after the owner has approved the expanded permission. Both are required. Old `read` tokens stay read-only. The isolated database role, owner/client/audience validation and 15-minute lifetime are unchanged.

Update access additionally exposes `agshare_update_field`; it never exposes create or whole-field delete. Read the field first and supply its `expected_revision` and `expected_name`. Omitted properties are preserved, but supplied boundary and AB-line arrays replace those entire arrays. Retain every unchanged item. The server reads back the saved content and does not report success when it differs. Writes are never retried automatically. AgShare provides no atomic conditional write here, so a concurrent change between the revision check and PUT remains possible.

Update the existing ChatGPT plugin's tools after deployment and set its permission mode to ask before writes. The consent page displays reading and updating when the server flag is enabled. Reconnect to obtain a new token and confirm the updated permissions. The existing bridge keeps its separate behavior; there is no synthetic-data switch or bundled test plugin in production.

## Validation and recovery

Run `npm run test:agshare:oauth`, type checking and lint before deployment. Regression tests mock upstream fetch locally; no live credentials or database writes are needed. Production reads returned nine private fields and Storjordet's boundary and two AB lines on 8 October 2026.

Disable `AGSHARE_OAUTH_ENABLED` and redeploy to stop OAuth MCP requests. Revoking a grant stops renewal; an issued access token can remain valid for up to 15 minutes. Immediate revocation requires an authoritative lookup. Token refresh and revocation have not been tested end to end.
