# Tripletex document intake spike

Date: 2026-08-26  
Status: Investigation only — no production implementation

## Purpose

Determine whether OFA can read documents from Tripletex before they are registered as supplier invoices, and keep the following concepts separate:

1. **Voucher inbox / voucher reception** — unprocessed documents awaiting bookkeeping.
2. **Document archive** — documents archived against a project, supplier, customer, product, account, employee, asset, or another supported object.
3. **Registered supplier invoice** — an invoice with supplier, amounts, due date, voucher, and accounting data.
4. **Voucher attachment** — the original document, an attachment, or an EDI document associated with a voucher.

This spike used only read-only calls and inspection of Tripletex's official production OpenAPI specification. It made no changes to Tripletex, OFA, or the OFA database.

## Executive conclusion

Tripletex REST API exposes a dedicated read endpoint for documents in voucher reception:

```http
GET /v2/ledger/voucher/>voucherReception
```

The endpoint is distinct from `documentArchive`, supplier invoices, and voucher attachments. It returns a paginated `ListResponseVoucher` and supports date filters, free-text search, sorting, and field expansion.

The connected Tripletex MCP session confirmed that the selected company, **JAN HELGE RØE**, currently has **27 items** in its voucher inbox. MCP only exposes the inbox count, not the items. The MCP OAuth token is held by the remote MCP server and cannot safely be extracted or reused as a Tripletex REST session token. Consequently, this spike proves that the REST listing capability exists, but it does not yet prove that the current REST credentials can list exactly the same 27 items.

## Capability matrix

| Question | Finding | Confidence |
|---|---|---|
| Can all 27 unregistered items be listed? | The REST listing endpoint exists and is paginated. An authenticated regression call is still required to confirm that it returns the same 27 visible through MCP. | Medium pending authenticated test |
| Can metadata be fetched per document? | Yes, when the voucher response exposes a document ID. `GET /document/{id}` returns filename, size, MIME type, version, and URL. | High |
| Can the PDF or image be fetched? | Yes. `GET /document/{id}/content` returns the original binary content. Voucher and supplier-invoice PDF endpoints also exist, but may return a representation rather than the original file. | High |
| Can OFA see a supplier interpreted by Tripletex? | Possibly through voucher fields or preliminary postings. OpenAPI does not define a dedicated “OCR-suggested supplier” field, so the actual reception response must be inspected. | Unresolved |
| Is EHF/XML available in addition to PDF? | Voucher has an `ediDocument` reference, and supplier invoice has `originalInvoiceDocumentId`. If populated and authorized, the document content endpoint can retrieve the original content. Must be verified on a real EHF item. | Medium |
| Can new items be detected by webhook? | Yes. The live event catalogue includes `voucherstatus.ready`; archive relation events also exist but cover a different document flow. Polling should remain a reconciliation fallback. | High |
| Which credentials are required? | A Tripletex REST session token obtained from an internal JWT refresh token, or from consumer + employee tokens for a commercial integration. The token owner must have the relevant accounting and document entitlements. | High for token model; exact entitlement names need live verification |

## Endpoint map

### Voucher inbox and voucher reception

```http
GET /v2/voucherInbox/inboxCount
GET /v2/voucherInbox/emailAddress
GET /v2/ledger/voucher/>voucherReception
```

`inboxCount` only returns the count. `voucherReception` is the endpoint that lists vouchers ready for processing.

Supported `voucherReception` parameters:

- `dateFrom` — inclusive lower date bound
- `dateTo` — exclusive upper date bound
- `searchText`
- `from` and `count` — pagination
- `sorting`
- `fields` — response field expansion

Suggested read-only verification request:

```http
GET /v2/ledger/voucher/>voucherReception
    ?from=0
    &count=1000
    &fields=*,document(*),attachment(*),ediDocument(*),postings(*)
```

The request must paginate until `hasMore` is false and compare the result count with the MCP count of 27. Authorization-filtered or missing fields must not be interpreted as absent source data without checking the token's entitlements.

### Generic document access

```http
GET /v2/document/{id}
GET /v2/document/{id}/content
```

The metadata model contains:

- `id`
- `version`
- `fileName`
- `size`
- `mimeType`
- `url`
- optional change history when requested through `fields`

The content endpoint returns `application/octet-stream`. OFA must use the returned MIME type and must not assume that every document is a PDF.

### Document archive

The archive can be queried only through a supported target object:

```http
GET /v2/documentArchive/account/{id}
GET /v2/documentArchive/asset/{id}
GET /v2/documentArchive/customer/{id}
GET /v2/documentArchive/employee/{id}
GET /v2/documentArchive/product/{id}
GET /v2/documentArchive/project/{id}
GET /v2/documentArchive/supplier/{id}
```

There is no general `GET /documentArchive` endpoint in the current OpenAPI specification.

```http
POST /v2/documentArchive/reception
```

is an upload endpoint, not a listing endpoint, and was not called during this spike.

An `ArchiveRelation` associates a `DocumentArchive` record with an `archiveObjectId` and `archiveObjectType`. It can also carry flags controlling whether an order attachment follows an invoice, offer, or order confirmation. The current OpenAPI specification does not expose a general GET search endpoint for all archive relations.

### Registered supplier invoices

```http
GET /v2/supplierInvoice
GET /v2/supplierInvoice/{id}
GET /v2/supplierInvoice/{invoiceId}/pdf
```

The `SupplierInvoice` model includes supplier, invoice number and dates, amounts, currency, voucher, order lines, payments, approvals, outstanding amount, and `originalInvoiceDocumentId`.

These endpoints apply after an item has become a registered supplier invoice. They do not replace the voucher reception endpoint.

### Voucher documents and attachments

The `Voucher` model contains three separate document references:

- `document`
- `attachment`
- `ediDocument`

It also contains potentially useful reception fields such as:

- `description`
- `vendorInvoiceNumber`
- `supplierVoucherType`
- `wasAutoMatched`
- `postings`

Additional read endpoints:

```http
GET /v2/ledger/voucher/{id}
GET /v2/ledger/voucher/{voucherId}/pdf
```

The voucher PDF is a PDF representation of the voucher. It must not automatically be treated as identical to the original `document`, `attachment`, or `ediDocument` content.

## Supplier interpretation

OpenAPI does not provide a field explicitly named “OCR supplier suggestion”. A supplier visible in voucher reception may instead be represented through:

- preliminary voucher postings,
- voucher description or vendor invoice number,
- matching state such as `wasAutoMatched`, or
- another authorization-dependent expanded field.

OFA must label the provenance explicitly:

- **Tripletex value** — returned directly by Tripletex.
- **Derived from Tripletex posting** — inferred from a preliminary posting.
- **OFA suggestion** — inferred from text, account history, or OFA entity context.

An OFA suggestion must never be presented as a supplier already interpreted by Tripletex.

## EHF and XML

`Voucher.ediDocument` is the strongest REST indication that electronic invoice data can be available separately from a PDF. If present, OFA should:

1. Fetch its document metadata.
2. Check `mimeType` and filename.
3. Fetch the original content using `/document/{id}/content`.
4. Treat XML parsing as a separate, untrusted-input processing step.

For registered supplier invoices, `originalInvoiceDocumentId` may provide another path to the original invoice document. Neither field is guaranteed to be populated for scanned or emailed PDFs.

## Events and polling

The live production event catalogue was queried read-only and contained:

- `voucherstatus.ready` — voucher ready for processing
- `voucher.create`, `voucher.update`, `voucher.delete`
- `archiverelation.create`, `archiverelation.update`, `archiverelation.delete`

`voucherstatus.ready` is the event most directly related to voucher reception.

Archive relation events are beta events for documents related to objects such as invoices, orders, and projects. Tripletex states that these events do not cover every document added directly through the general Document → Archive UI flow.

A future implementation should use:

1. `voucherstatus.ready` to trigger prompt ingestion.
2. A read-only fetch of the referenced voucher/reception item.
3. Periodic reconciliation against `voucherReception` to recover missed or coalesced event versions.

Creating a subscription uses `POST /event/subscription`, so no webhook subscription was created in this read-only spike.

## Authentication and authorization

Tripletex REST API uses Basic Authentication:

- username `0` or blank for the employee token owner's company,
- a target company ID as username for permitted accounting-office clients,
- a short-lived session token as password.

For an internal integration against one company, Tripletex recommends a JWT refresh token created by a user administrator and exchanged through:

```http
POST /v2/token/session/:createFromRefreshToken
```

For a commercial multi-customer integration, authentication uses a Tripletex consumer token plus an employee token to create the session token.

The token owner and token configuration must provide read access to:

- voucher inbox / voucher reception,
- vouchers and postings,
- documents and attachments,
- supplier invoices when registered invoices are required.

OpenAPI does not state the exact Norwegian entitlement labels for each of these endpoints. Tripletex may filter response objects or individual fields based on authorization. The exact entitlement set must therefore be established through a least-privilege authenticated test; missing fields must not be worked around by granting broad write access.

The existing remote MCP OAuth token is server-held and should not be exported or reused for direct REST calls.

## Recommended next read-only test

Use a dedicated, server-side Tripletex REST token with least-privilege read entitlements and perform the following without logging token values or document content:

1. Read `voucherInbox/inboxCount` and record the expected count.
2. Paginate `ledger/voucher/>voucherReception` with expanded document fields.
3. Confirm whether the result contains exactly the same 27 items.
4. Record which voucher and document metadata fields survive authorization filtering.
5. Select one PDF/image item and verify metadata plus content headers without persisting the file.
6. Select one EHF item, if present, and verify whether `ediDocument` or `originalInvoiceDocumentId` exposes XML.
7. Record whether preliminary supplier data is returned and where it appears.
8. Repeat with a deliberately reduced entitlement set to document the minimum required rights.

If the list count differs from 27, stop and report whether the difference comes from pagination, status filtering, company context, or authorization. Do not compensate by weakening permissions.

## Sources

- [Tripletex production OpenAPI documentation](https://tripletex.no/v2-docs/new)
- [Tripletex production OpenAPI specification](https://tripletex.no/v2/openapi.json)
- [Tripletex authentication and tokens](https://developer.tripletex.no/docs/documentation/authentication-and-tokens/)
- [Tripletex webhooks](https://developer.tripletex.no/docs/documentation/webhooks/)
- [Tripletex archive relation webhook announcement](https://developer.tripletex.no/new-document-webhook-events-are-now-available-in-beta/)
- [Tripletex API 2 official GitHub repository](https://github.com/Tripletex/tripletex-api2)

## Changes made by this spike

- Added this documentation file only.
- No Tripletex write calls.
- No OFA database or schema changes.
- No production code changes.
- No commit created.
