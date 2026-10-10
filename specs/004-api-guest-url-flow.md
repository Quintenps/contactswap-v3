# 004: Guest URL API Flow

## Status

Done

## Goal

Implement the guest-facing API flow for a link created by spec 003. An unauthenticated guest with an active link can obtain that link's signed URL for Quinten's current vCard 3.0 and submit their own required contact details. A successful submission stores the guest record and triggers a privacy-safe notification while leaving the signed URL active until a successful card response consumes the link. The revised lifecycle is also specified in spec 021.

## Scope

- Add a public API endpoint to resolve an active guest link into its link-scoped signed vCard URL.
- Add a public API endpoint to download the owner's current vCard using that signed URL.
- Add a public API endpoint to submit guest contact details through an active guest link.
- Store guest submissions in D1 and record the successful submission without consuming the link.
- Consume the link after its first successful signed vCard response.
- Send the configured summary webhook after a successful submission without guest contact details.
- Retain submissions and associated stored files for 48 hours from successful submission, then delete them through the scheduled cleanup process.
- Add migrations, local `.http` examples, and focused API tests for link access, signing, validation, single-use behavior, webhook delivery, and retention.

## Out of Scope

- Guest-page or owner-interface changes; the frontend consuming these APIs is specified separately.
- Owner APIs for listing, reading, deleting, or downloading guest submissions.
- Owner APIs for manually deleting links. A link manually deleted by a separately specified owner endpoint must be inaccessible through these guest endpoints.
- Multiple owners, guest accounts, age-based link expiration, or unrelated account features.

## API Contract

All guest endpoints are unauthenticated in the account sense. The link token or signed vCard URL is the bearer credential. Responses must use `Cache-Control: no-store`; vCard responses must also use `Referrer-Policy: no-referrer`. Never log guest tokens, vCard signatures, authorization headers, or contact values.

### `GET /api/guest/links/{token}`

- Resolves the opaque token from the guest URL against the stored token hash and returns access information only while the link is active.
- Returns `200` JSON containing the link-scoped `vcardUrl` path, for example `/api/guest/vcard/{linkId}/{signature}`. The frontend combines this path with its configured API origin; the signature is not returned by the owner link-creation endpoint.
- Returns `submissionComplete: true` when the link has already accepted a submission but its card has not yet been downloaded. This allows the guest to resume the card download without exposing submission data or reopening the form.
- Does not return the owner's contact fields or vCard contents in JSON.
- Does not consume the link.
- Indicates whether the guest has already submitted so the frontend can prevent a second submission and offer the pending card download.
- Returns a stable `404` error for an unknown token and `410` when a known link has already been consumed or revoked.

### `GET /api/guest/vcard/{linkId}/{signature}`

- Validates that the supplied signature matches the signature persisted for the link and that the link remains active and unconsumed.
- Returns the owner's current vCard 3.0 as an attachment with `Content-Type: text/vcard; version=3.0; charset=utf-8` and a stable `.vcf` filename.
- Reads the current owner vCard at download time; it does not snapshot profile data when the guest link is created.
- Atomically marks the link consumed when this request successfully returns the vCard. Only one concurrent request for a link may succeed.
- Returns a stable unavailable response when the signature is invalid or the associated link is revoked or consumed. It must not disclose whether a link ID exists.

### `POST /api/guest/links/{token}/submissions`

- Accepts `multipart/form-data` with `name`, `email`, `address`, and `birthday`. All four values are required strings; the `picture` file field may be omitted. Arbitrary client-provided picture URLs are not accepted.
- Trims required text values, rejects blank fields, validates email and a real `YYYY-MM-DD` birthday, and rejects malformed multipart bodies or unsupported fields with `400`.
- Creates one guest submission and records a submission timestamp on the link without consuming it. A successful response is `201` with a small success body that contains no guest contact values.
- A repeated or concurrent submission using a submitted, consumed, or revoked link cannot create a second guest record. Guest record creation, submission timestamp, and notification outbox entry must be atomic in D1.
- Returns a stable `404` for an unknown token and `410` when its known link is already submitted, consumed, or revoked. Invalid submissions do not change link state.
- Returns safe generic errors without contact values or internal details.

## Data and Behavior

- Store only the guest fields needed for Quinten's owner review and vCard 3.0 download, plus timestamps required for the 48-hour retention rule. Do not duplicate Quinten's profile or store the generated guest vCard unless separately required.
- Each guest submission is retained for 48 hours from successful submission. Scheduled cleanup deletes expired guest records and any associated stored files.
- Use a D1 transaction or equivalent conditional write so concurrent requests cannot both submit through the same link. The submission record, link submission timestamp, and notification outbox entry either all succeed or none do.
- Persist the submission timestamp independently of the retained guest record so deletion after 48 hours does not make a used-for-submission link accept another submission.
- Use a conditional D1 update after preparing the vCard so concurrent card requests cannot both consume and download through the same link. Failed vCard requests leave the link active.
- On successful submission, send a webhook summary that says a submission was completed and contains no guest contact details. Webhook credentials remain Worker Secrets.
- Do not include signed URL signatures in page URLs that make external requests; the guest frontend must not leak them through referrers. Responses containing the signed vCard path and the vCard file must be non-cacheable.
- A guest link remains usable for vCard access until it is manually deleted or a successful vCard response consumes it. Viewing or resolving the link does not consume it; link age alone does not invalidate it.
- A link accepts at most one successful guest submission. After submission, link resolution and vCard access remain available until the card is successfully downloaded; resubmission is rejected.
- A guest submission does not include owner authorization and cannot read or modify another guest's submission.

## Acceptance Criteria

- An active token resolves to one link-scoped signed vCard URL; an unknown token receives the documented unavailable response.
- A valid signed URL downloads the current owner vCard 3.0 only while its associated link is active. Invalid, cross-link, consumed, or revoked signatures do not return vCard data.
- vCard responses have the specified media type, attachment disposition, `Cache-Control: no-store`, and `Referrer-Policy: no-referrer` headers.
- Missing or blank required fields, invalid email, invalid birthday, JSON requests, malformed multipart bodies, and unsupported fields are rejected without storing a submission or consuming a link.
- One successful submission stores exactly one guest record, records the link's submitted state, and sends the privacy-safe webhook summary while leaving the card available. Repeated and concurrent submissions cannot store a second record.
- One successful vCard response consumes the link. Failed and concurrent vCard requests cannot produce more than one successful card download.
- Guest submission, submitted state, and notification enqueue are atomic; a failed persistence operation leaves the link active and unsubmitted.
- Guest records and associated stored files are removed after 48 hours by the scheduled cleanup process.
- Error responses do not disclose guest or owner contact values, credentials, signatures, or internal exception details.
- Automated tests cover active, unknown, consumed, and revoked links; valid and invalid signatures; current vCard delivery; field validation; single-use and concurrent submissions; webhook privacy; and 48-hour cleanup using local Workers bindings only.
- Local `.http` requests demonstrate guest link resolution, vCard download, and submission without committed tokens or personal contact data.
- Type checking, the API test suite, and production builds pass.

## Implementation Decisions

- Guest submissions use `multipart/form-data` whether or not the optional photo is included; photo validation and storage are specified in spec 008.
- Webhook delivery is asynchronous and retried after failures; a persisted submission remains successful regardless of notification delivery.

## Verification

Run focused API tests, then the repository type-check, test, and production build commands. Validate the local flow end to end with an active test link, confirm single-use behavior and retention cleanup, and verify that tokens, signatures, and contact values are absent from logs and error responses.