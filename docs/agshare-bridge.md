# AgShare read-only bridge

This branch adds `GET /api/agshare` (list owned fields) and
`GET /api/agshare?id=<uuid>` (fetch one field including boundaries and AB lines).

## Vercel configuration

Set these **server-only** environment variables in the Vercel project (never use `NEXT_PUBLIC_`):
- `AGSHARE_API_KEY`: API key configured in AgOpenGPS AgShare settings.
- `AGSHARE_BRIDGE_TOKEN`: separate, randomly generated long bearer token for callers of this bridge.

Calls must supply `Authorization: Bearer <AGSHARE_BRIDGE_TOKEN>`.
The bridge sends `Authorization: ApiKey <AGSHARE_API_KEY>` to
`https://agshare.agopengps.com`.

Example request (use your secret manager; do not paste tokens in chat or commit them):
`curl -H "Authorization: Bearer $AGSHARE_BRIDGE_TOKEN" https://<deployment>/api/agshare`

No writes, synchronization, Supabase mappings, or MCP tool registration are implemented yet.
The route is not publicly usable without the bearer token, but the caller must still
be a trusted backend: never put the bridge token into browser JavaScript.
A production integration should add rate limiting, credential rotation, and an MCP
server with OAuth suitable for ChatGPT before enabling interactive access.
Do not deploy to production until authentication and error handling are tested.
