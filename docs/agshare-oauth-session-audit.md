# OFA authentication audit for AgShare OAuth

Inspected `app/page.tsx` and `package.json` on the feature branch (2026-10-08).

## Verified implementation
- Login is a client-side POST to Supabase `/auth/v1/token?grant_type=password`.
- Session (`access_token`, `refresh_token`, user ID/email) is persisted in browser `localStorage` under `ofa_session`.
- The UI refreshes sessions via `/auth/v1/token?grant_type=refresh_token`.
- API calls to Supabase use the user's access token as a bearer credential.
- `package.json` does not currently declare `@supabase/ssr` or `@supabase/supabase-js`.

## OAuth integration implication
The Next.js authorization endpoint **cannot** infer the user's authenticated identity from the existing `localStorage` session: browser localStorage is not sent to the server on navigation. A cookie-based server session or a dedicated authorization-page exchange is required.

## Security constraints
- Never accept an unverified user ID/email from a browser as proof of identity.
- Never put a Supabase refresh token into an OAuth redirect URI, query string, or authorization code.
- Prefer an isolated authorization login flow with server-validated Supabase identity, secure HttpOnly SameSite cookies, CSRF protection and a short-lived consent transaction; do not silently migrate the existing OFA localStorage session.
- For sensitive AgShare write scope, require a recent authenticated session / step-up verification.
- Keep the legacy OFA login functional while developing OAuth in Preview.
- Authorization codes and grants must be stored durably, be bound to exact client, redirect URI, PKCE challenge, owner identity, scope and expiry.

## Next implementation work
1. Implement a separate server-side Supabase identity verification and authorization-session cookie.
2. Implement owner-restricted authorization and consent pages.
3. Add durable OAuth grant/code/token storage and atomic redemption.
4. Integrate token verification with MCP route and test end-to-end.
