# 006: Owner Guest-Link Revocation API

## Status

Done

## Goal

Allow Quinten to revoke a guest link by its ID at any time, including when the shareable guest URL has been lost. After revocation, neither the guest link nor its link-scoped signed vCard URL can be used, and the link cannot accept a submission.

## Scope

- Add an owner-authorized API endpoint to list created guest links by ID and status, without exposing link credentials.
- Add an owner-authorized API endpoint to revoke a guest link.
- Identify the link by its ID from the existing owner-authorized link-listing endpoint.
- Mark the link revoked in D1 and preserve the existing guest API behavior for known revoked links.
- Ensure revocation is safe when it races with guest submission.
- Add focused API tests and a local `.http` request example without committed credentials.

## Out of Scope

- Editing guest links, creating links, or changing their share URLs.
- Revoking links automatically by age.
- Deleting guest submissions or notification records associated with a submission.
- Changing guest submission or download behavior. A submitted link whose card is still pending can still be revoked by the owner; a successfully consumed link is already unavailable.
- Owner or guest interface changes.

## API Contract

### `GET /api/owner/links`

- Requires owner authorization with `Authorization: Bearer <admin-token>`.
- Returns `200` JSON with a `links` array ordered newest first. Each item contains only `id`, `createdAt`, and `status`, where status is `active`, `consumed`, or `revoked`.
- Does not return guest tokens, token hashes, signed vCard signatures, or contact data.
- Returns an empty array when no links exist and includes `Cache-Control: no-store` on every response.

### `DELETE /api/owner/links/{id}`

- Requires owner authorization with `Authorization: Bearer <admin-token>`, following the existing owner API convention.
- The `{id}` path parameter is the link ID returned by `GET /api/owner/links`. It is an identifier, not a bearer credential; the guest token and signed vCard signature are not accepted by this endpoint.
- Accepts no request body.
- Returns `204` with no response body when the ID identifies a link, whether that link was active, already revoked, or already consumed. Repeating the request is safe and does not change the outcome.
- Returns `400` with a stable error code for a malformed link ID.
- Returns `404` with a stable error code when the link ID does not identify a link.
- Returns `401` for missing or invalid owner authorization and a generic `500` for unexpected server failures.
- Includes `Cache-Control: no-store` on success and error responses. Error responses must not disclose credentials, contact values, or internal exception details.

## Data and Behavior

- Revoke an active link by setting its `revoked_at` timestamp. Do not consume the link or create a guest submission.
- The admin can revoke a link using its ID from `GET /api/owner/links`, even if the shareable guest URL or its token is no longer available. Revocation does not require an owner profile.
- Keep the minimal link row as a revocation tombstone so the guest endpoints can continue returning `410` for a known revoked link. Do not retain the raw guest token; do not add guest contact data to the link record.
- Revocation must be a conditional D1 write that cannot clear `consumed_at` or overwrite an existing `revoked_at` timestamp.
- A revoked link cannot resolve through `GET /api/guest/links/{token}`, download the owner's vCard through its signed URL, or submit guest details. Existing guest endpoints return their documented unavailable responses for revoked links.
- Revocation does not delete or modify a guest submission or its queued notification. A successfully consumed link remains consumed; revocation never rolls back a completed submission.
- If revocation and submission race, D1 serialization/conditional writes must ensure only one outcome wins: if revocation commits first, submission fails without storing a record; if submission commits first, its successful record remains and the owner may then revoke the still-pending card link. The revocation response remains `204` for either known-ID outcome.
- The endpoint does not require an owner profile; revocation must remain possible if the profile is absent or incomplete.

## Acceptance Criteria

- Requests without valid owner authorization receive `401` and do not change link state.
- The owner link listing returns only IDs, creation timestamps, and statuses; it never returns link credentials or contact data.
- A submission ID returned by `/api/owner/submissions` is not a guest-link ID and cannot be used to revoke a link.
- A valid link ID for an active link receives `204`, stores `revoked_at`, and creates no submission or notification.
- Repeating revocation for an already revoked or consumed link returns `204` without changing existing submission data or timestamps.
- A malformed link ID and an unknown well-formed ID return the documented safe errors; no other link is modified.
- After revocation, link resolution and submission return `410`, and the associated signed vCard URL does not return the owner vCard.
- Revoking a link does not delete an existing guest submission or its notification outbox record.
- If revocation commits before submission, the submission fails. If submission commits first, the guest record and notification remain even if the owner then revokes the pending card link.
- All success and error responses are non-cacheable; the guest token and signed vCard signature are not accepted or returned by the revocation endpoint and are never logged.
- Automated tests cover listing authorization and data minimization, active and repeated revocation, unknown and malformed IDs, guest-flow denial after revocation, preservation of existing submissions, and concurrent revocation/submission using local Workers bindings only.
- A local `.http` request demonstrates listing and revocation using a link ID returned by the listing endpoint and an admin token supplied outside the committed request file.
- Type checking, the API test suite, and production builds pass.

## Verification

Run focused API tests, then the repository type-check, test, and production build commands. Verify that an admin can use a listed link ID to revoke a link after losing its guest URL; verify both guest access and submission are denied after revocation; and exercise the race against a test-only D1 database.