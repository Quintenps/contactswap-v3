# Architecture

## Runtime

ContactSwap runs primarily on Cloudflare's platform.

- Cloudflare Pages hosts the frontend.
- Cloudflare Workers provides server-side functionality, including scheduled retention cleanup.
- Cloudflare D1 stores application data.

## Frontend

TypeScript-based, mobile-first web application with an owner interface and a guest submission form. Show clear feedback for validation and service errors, and show the guest a thank-you state only after a successful submission.

The frontend communicates with Workers through HTTP APIs. Owner-only operations must be authorized server-side; the admin token and webhook configuration must never be embedded in or exposed to the browser.

## Backend

Cloudflare Worker APIs provide:

- Owner profile read and update, plus an owner-authorized download of the current profile vCard
- Guest-link creation, including creation of a distinct signed URL for the owner's current vCard, and manual deletion
- Guest form access and submission
- Owner access to submitted guest records and on-demand vCard 4.0 downloads generated from those records
- Delivery of the owner's current vCard 4.0 through the signed URL associated with an active guest link
- A summary webhook notification after successful submissions, without guest contact details

The owner's vCard is not available through a public profile URL. Each guest link has a distinct signed URL, validated server-side and scoped to that link. The URL is valid only while its associated link is active and is revoked when the link is deleted or consumed. Guest links are single-use for submissions: a link is consumed only when a submission succeeds.

## Database

Cloudflare D1.

Store only the single owner's editable profile fields and optional private R2 photo object key in D1 as canonical data, so the owner interface can load and update them directly. Do not store image bytes, base64 image data, or rendered vCard text in D1. Generate the current vCard 4.0 when requested from the current profile fields and, when present, the optimized photo bytes read from R2. Embed the photo as a base64 `PHOTO` data URI in the generated vCard. Do not require downloading or extracting a vCard to edit the profile.

Store guest submission data in D1 and generate vCard 4.0 downloads from the saved guest records for the owner. Guest vCards can be generated on demand; the pre-rendered owner vCard requirement does not require storing duplicate guest vCards.

Guest submissions are retained for 30 days. A scheduled Worker process deletes expired submissions and any associated stored guest files. Guest links do not expire by age; they are deleted manually by the owner or consumed after a successful submission.

Signed vCard URLs follow the lifecycle of their guest link and do not expire by age while that link remains active. Treat each URL as a bearer credential: do not log its signature, prevent it from leaking through referrers, and return vCard responses with `Cache-Control: no-store`.

Only data required for ContactSwap functionality should be stored, and contact data must only be exposed through the intended owner or guest flow.

## Storage

Use a private Cloudflare R2 bucket for optimized owner photos. Do not configure public delivery. Any stored guest picture must be deleted with its associated guest submission after 30 days.

## Secrets and integrations

The admin token, signed-URL signing key, and webhook credentials are Cloudflare Worker Secrets configured on the API Worker, not plaintext Wrangler `vars` or Cloudflare Pages variables. The Worker accesses them through its server-side bindings; they must never be included in frontend assets or logs. Use non-sensitive environment variables only for non-secret configuration. For local development, put secret values in an ignored `.dev.vars` file beside the Wrangler configuration and do not commit it. Admin-token rotation is performed by updating the API Worker's Worker Secret through Wrangler or the Cloudflare dashboard. Webhook messages contain only a submission summary unless the product requirements explicitly change.

## API

Use JSON for application requests and responses where appropriate. `GET /api/owner/profile/vcard` generates the current vCard 4.0 at request time from D1 profile fields and the optional optimized image in R2, and requires owner authorization. The signed guest-link vCard route generates the same current card only for its active link. Embed the image as a base64 `PHOTO` data URI; do not persist the vCard or image data in D1. Owner downloads of guest records also return generated vCard 4.0 files. Validate required fields on the server for both owner and guest forms: name, email, address, and birthday are required; picture is optional.

## Local API Requests

Keep runnable local API examples in `.http` files under `apps/api/requests/`. `apps/api/requests/health.http` exercises the health check, and `apps/api/requests/owner-profile.http` exercises the authorized profile read, save, and vCard download routes against the local Worker at `http://127.0.0.1:8787`. These requests are for local development and must not contain credentials or real personal contact data. The admin token is resolved from the ignored `apps/api/.env` file using the VS Code REST Client dotenv variable; use only a local development secret there. Keep request examples synchronized with the API contract and update them as routes change.