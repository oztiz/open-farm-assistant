# AgShare bridge

Private MCP JSON-RPC endpoint: `POST /api/agshare/mcp`. The original
`GET /api/agshare` route remains read-only.

## Server configuration

`AGSHARE_API_KEY` is the AgShare account key. `AGSHARE_BRIDGE_TOKEN` is a
separate bearer credential for trusted backend callers. Both are server-only
Secret variables, scoped to Preview and `feature/agshare-readonly-bridge`.
Never place them in browser JavaScript, Git, chat, or `NEXT_PUBLIC_*` variables.

The MCP endpoint supports list, get, create, update and delete tools.
Get returns `structuredContent.revision`; update and delete require that
revision and the exact current name. Ownership is checked against `/api/fields`.
Omitted update properties are preserved. Supplied boundary or AB-line arrays
replace the entire corresponding collection: retain all items that should remain.
An empty AB-line array removes all AB lines. New fields default to private.

Uploads follow AgOpenGPS's `UploadFieldDto`: `PUT /api/fields/{id}`, with
name, origin, isPublic, boundary `{outer, holes}`, and abLines. Boundary arrays
returned by GET map to the first outer ring and subsequent holes.
Deletion uses the web client's `DELETE /web/isoxmlfields/{id}`. That route exists,
but API-key authentication may not be accepted; errors are reported honestly.
No bulk deletion is implemented.

Writes are never retried automatically. If a write or its verification fails,
read the returned field ID before retrying: the write may already have completed.
The revision is a preflight guard, not an atomic server-side compare-and-swap;
an AgOpenGPS upload can still race between the check and PUT. Coordinate
validation checks ranges and basic shapes, not survey accuracy or polygon topology.
The snapshot hash is not a backup. OAuth and native ChatGPT connector registration
are separate work; this bearer endpoint is for trusted backend calls.

## Validation

From the repository root:

```sh
npx tsc --noEmit
npx eslint app/api/agshare/mcp
npx tsc app/api/agshare/mcp/client.ts app/api/agshare/mcp/route.ts --outDir /tmp/ofa-agshare-compiled --module commonjs --target es2022 --esModuleInterop --skipLibCheck
NODE_PATH="$PWD/node_modules" node --test scripts/test-agshare.cjs
```

The tests use mock data and cover authentication, ownership, name/revision guards,
invalid coordinates, preservation of geometry and AB lines, and write/readback.
