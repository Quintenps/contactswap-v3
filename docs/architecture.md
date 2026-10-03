# Architecture

## Runtime

ContactSwap runs primarily on Cloudflare's platform.

- Cloudflare Pages hosts the frontend.
- Cloudflare Workers provides server-side functionality, including scheduled retention cleanup.
- Cloudflare D1 stores application data.

## Frontend

TypeScript-based, mobile-first web application with an owner interface and a guest submission form. Show clear feedback for validation and service errors, and show the guest a thank-you state only after a successful submission.

The frontend communicates with Workers through HTTP APIs. Owner-only operations must be authorized server-side; the owner secret and webhook configuration must never be embedded in or exposed to the browser.

## Backend

Cloudflare Worker APIs provide:

- Owner profile read and update
- Guest-link creation, including creation of a distinct signed URL for the owner's current vCard, and manual deletion
- Guest form access and submission
- Owner access to submitted guest records and on-demand vCard 4.0 downloads generated from those records
- Delivery of the owner's current vCard 4.0 through the signed URL associated with an active guest link
- A summary webhook notification after successful submissions, without guest contact details

The owner's vCard is not available through a public profile URL. Each guest link has a distinct signed URL, validated server-side and scoped to that link. The URL is valid only while its associated link is active and is revoked when the link is deleted or consumed. Guest links are single-use for submissions: a link is consumed only when a submission succeeds.

## Database

Cloudflare D1.

Store the single owner's editable profile fields in D1 as the canonical data, so the owner interface can load and update them directly. On every successful profile create or update, render the current vCard 4.0 from those fields and persist the rendered owner vCard in D1 as part of the same logical save, keeping it ready for use and in sync with the profile. Do not require downloading or extracting a vCard to edit the profile.

Store guest submission data in D1 and generate vCard 4.0 downloads from the saved guest records for the owner. Guest vCards can be generated on demand; the pre-rendered owner vCard requirement does not require storing duplicate guest vCards.

Guest submissions are retained for 30 days. A scheduled Worker process deletes expired submissions and any associated stored guest files. Guest links do not expire by age; they are deleted manually by the owner or consumed after a successful submission.

Signed vCard URLs follow the lifecycle of their guest link and do not expire by age while that link remains active. Treat each URL as a bearer credential: do not log its signature, prevent it from leaking through referrers, and return vCard responses with `Cache-Control: no-store`.

Only data required for ContactSwap functionality should be stored, and contact data must only be exposed through the intended owner or guest flow.

## Storage

Cloudflare R2 should only be introduced if optional picture uploads require object storage. Any stored guest picture must be deleted with its associated guest submission after 30 days.

## Secrets and integrations

The owner secret, signed-URL signing key, and webhook credentials are Cloudflare Worker Secrets configured on the API Worker, not plaintext Wrangler `vars` or Cloudflare Pages variables. The Worker accesses them through its server-side bindings; they must never be included in frontend assets or logs. Use non-sensitive environment variables only for non-secret configuration. For local development, put secret values in an ignored `.dev.vars` file beside the Wrangler configuration and do not commit it. Owner-secret rotation is performed by updating the API Worker's Worker Secret through Wrangler or the Cloudflare dashboard. Webhook messages contain only a submission summary unless the product requirements explicitly change.

## API

Use JSON for application requests and responses where appropriate. Owner downloads of guest records and signed guest-link URLs for the owner's profile return a vCard 4.0 file. Validate required fields on the server for both owner and guest forms: name, email, address, and birthday are required; picture is optional.