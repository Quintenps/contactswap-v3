# 009: API Hono Route Restructure

## Status

Proposed

## Goal

Restructure the API Worker from a single large `index.ts` into a small Hono composition root and clearly organized, declarative route modules. Preserve all existing API behavior, product rules, and Cloudflare Worker entry-point behavior.

## Scope

- Split HTTP route definitions into focused Hono routers and mount them from the API entry point with Hono's `.route()` composition.
- Keep the root entry point responsible for assembling the API, registering cross-cutting middleware and error handling, and exporting the Worker.
- Separate scheduled retention and notification processing from HTTP route definitions while preserving the scheduled Worker handler.
- Move helpers and types out of the entry point only when doing so makes route ownership or shared behavior clearer; keep shared logic reusable and narrowly scoped.
- Preserve and extend the existing API tests to verify the refactor has not changed externally observable behavior.

## Out of Scope

- Changes to endpoint paths, HTTP methods, request or response shapes, status codes, headers, or error codes.
- New endpoints, API versioning, OpenAPI generation, RPC clients, or additional routing or validation dependencies.
- Changes to authorization, guest-link lifecycle, submission validation, photo processing, vCard generation, retention, webhook delivery, database schema, or frontend behavior.
- A broad domain/service-layer rewrite, dependency-injection framework, or unrelated cleanup.

## Routing Structure

Use small Hono routers with route paths relative to their mount point. Mount them explicitly from the root app so the full API surface is easy to discover. A suitable organization is:

- `routes/health.ts`: `GET /api/health`.
- `routes/owner/profile.ts`: owner profile read and update, profile vCard, and profile photo upload, preview, and removal.
- `routes/owner/links.ts`: owner guest-link list, creation, and revocation.
- `routes/owner/submissions.ts`: owner submission list, detail, and vCard download.
- `routes/guest/links.ts`: guest-link resolution.
- `routes/guest/submissions.ts`: guest submission.
- `routes/guest/vcard.ts`: link-scoped signed owner vCard delivery.

The exact module names may follow repository conventions, but each endpoint must have one clear route owner. Avoid a single router module that simply recreates the current monolith in another file.

The root API composition should mount all route groups under their existing `/api/...` prefixes. Keep route registration explicit and declarative; do not introduce dynamic route discovery or a generic route registry.

Register root prefix middleware before mounting route groups so it runs for every matching request, regardless of which router handles the path.

## Hono Application and Worker Lifecycle

- Preserve the existing `Env` bindings type on the Hono application and on route modules that access bindings. Keep TypeScript strict and avoid weakening types to make router composition compile.
- Preserve the default Worker export as a fetch-capable Hono app with its existing `scheduled` handler. Scheduled work is not an HTTP route and must not be registered as one.
- Keep `runScheduledTasks(environment)` exported from the API entry point for its existing test and operational callers, re-exporting it from its new module if it is moved.
- Preserve the public import surface currently used by tests: the default app and `runScheduledTasks` remain importable from `src/index`.

## Middleware, Errors, and Privacy

- Apply owner authorization to every path under `/api/owner/*`, including future owner routes. Missing or invalid authorization continues to return `401` with the existing JSON error shape.
- Apply `Cache-Control: no-store` to all owner and guest API responses, including errors and non-JSON photo or vCard responses.
- Preserve prefix behavior for unmatched paths: an unknown `/api/owner/*` path returns the existing unauthorized response when authorization is missing or invalid, and reaches the existing not-found response after valid authorization. An unmatched `/api/guest/*` path retains `Cache-Control: no-store` before returning not found.
- Preserve current guest-route behavior: guest routes do not require owner authorization, and signed vCard URLs remain scoped to an active guest link.
- Register the centralized error handler once on the root app. Preserve its generic `500` response, `Cache-Control: no-store`, request ID header, and safe structured logging.
- Do not log authorization headers, guest tokens, signed vCard signatures, webhook URLs, request bodies, contact details, uploaded photo bytes, or other bearer credentials or personal data. Error messages must not expose internal exception details.
- Preserve the existing not-found response for unmatched routes.
- Ensure middleware still runs for every route in its intended prefix after the routers are mounted. Router composition must not create paths that bypass owner authorization or cache headers.

## Existing API Contract

The refactor must preserve these routes and their current behavior:

| Method | Path | Access |
|---|---|---|
| `GET` | `/api/health` | Public |
| `GET` | `/api/owner/profile` | Owner |
| `PUT` | `/api/owner/profile` | Owner |
| `GET` | `/api/owner/profile/vcard` | Owner |
| `PUT` | `/api/owner/profile/photo` | Owner |
| `GET` | `/api/owner/profile/photo` | Owner |
| `DELETE` | `/api/owner/profile/photo` | Owner |
| `GET` | `/api/owner/links` | Owner |
| `POST` | `/api/owner/links` | Owner |
| `DELETE` | `/api/owner/links/:id` | Owner |
| `GET` | `/api/owner/submissions` | Owner |
| `GET` | `/api/owner/submissions/:id` | Owner |
| `GET` | `/api/owner/submissions/:id/vcard` | Owner |
| `GET` | `/api/guest/links/:token` | Guest |
| `POST` | `/api/guest/links/:token/submissions` | Guest |
| `GET` | `/api/guest/vcard/:linkId/:signature` | Guest |

All existing validation and response semantics remain intact, including required profile and submission fields, optional photo handling, active-link checks, single-use submission behavior, 30-day submission expiry, and privacy-minimizing webhook notifications, except for the guest lifecycle revision in spec 021.

Preserve the existing response headers for binary content:

- Owner profile photo preview: `Content-Type: image/jpeg`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store`.
- Owner profile vCard and owner submission vCard: `Content-Type: text/vcard; version=3.0; charset=utf-8`, their existing attachment `Content-Disposition`, and `Cache-Control: no-store`.
- Guest link-scoped owner vCard: the same vCard content type and profile attachment disposition, plus `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.

## Shared Logic and Scheduled Work

- Keep photo optimization and vCard rendering in their existing focused modules.
- Extract additional shared helpers or types only where they are used by multiple route groups or have a distinct responsibility, such as request parsing, token/signature operations, or scheduled work.
- Do not move route-specific behavior into a generic abstraction that obscures the request-to-handler flow.
- Preserve scheduled cleanup of expired submissions and notification outbox retry behavior, including the fixed webhook message and omission of guest details.

## Acceptance Criteria

- The HTTP routes are defined in focused Hono modules and composed declaratively from `src/index.ts`; `index.ts` no longer contains the full set of route handlers.
- Every existing route remains available at the same path and method, with unchanged request validation, response bodies, status codes, content types, and relevant headers.
- Owner authorization and no-store cache headers consistently cover every owner and guest route, including failures, photos, and vCard downloads.
- The root error handler and not-found behavior remain centralized and retain their existing safe response and logging behavior.
- The Worker continues to execute scheduled retention cleanup and notification retries. Existing imports of the default app and `runScheduledTasks` remain valid.
- Guest submissions remain single-use and signed vCard access remains link-scoped. The revised lifecycle in spec 021 records submission separately and consumes the link only after a successful card response.
- Existing focused API tests continue to pass. Add or adjust tests where necessary to cover route mounting and middleware boundaries, including unauthorized requests, cache headers, not-found behavior, and scheduled task invocation.
- Type checking, the API test suite, and the production Worker build pass.
- No new runtime dependency is introduced. Guest-flow changes and the required submitted-link timestamp migration are specified in spec 021.

## Verification

Run the API type-check, API test suite, and production Worker dry-run build. Confirm the complete route list remains covered by the existing endpoint tests and exercise representative mounted routes for public, owner-authorized, guest, error, and scheduled execution paths.
