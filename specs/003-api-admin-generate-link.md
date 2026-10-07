# 003: Admin Generate Guest Link API

## Status

Done

## Goal

Allow Quinten to create an active, shareable guest link through the owner-authorized API. The guest can use the link to access Quinten's current vCard 3.0 and submit their own contact details, according to the existing product decisions.

## Scope

- Add an owner-authorized API endpoint to create a guest link.
- Persist the link and the credential material needed to validate its guest access and its link-scoped signed vCard URL.
- Return the URL Quinten can share with a guest.
- Require an existing owner profile before creating a link, so a new link cannot grant access to a missing vCard.
- Add focused tests for authorization, successful creation, profile absence, uniqueness, persistence, and response security headers.
- Add local API request examples for creating a link, without committed credentials or personal data.

## Out of Scope

- Owner interface changes for creating, displaying, copying, or sharing links.
- Guest page, vCard delivery, guest submission, or link deletion endpoints; these should be specified separately.
- Link expiry by age, multiple owners, guest accounts, or unrelated link management features.

## API Contract

### `POST /api/owner/links`

- Requires owner authorization with `Authorization: Bearer <admin-token>`, following the existing owner API convention.
- Accepts no request body.
- Creates one unique active guest link and its distinct signed URL for accessing the current owner vCard.
- Returns `201` with JSON containing the absolute shareable `guestUrl` in the form `{PUBLIC_APP_ORIGIN}/guest/{token}`. The URL is a bearer credential and must be returned only to the authorized owner.
- Uses the non-secret `PUBLIC_APP_ORIGIN` Worker variable and the `LINK_SIGNING_KEY` Worker Secret, which must contain at least 32 bytes.
- Does not return the signed vCard URL to the owner API caller; the signed URL stays within the intended guest flow.
- Returns `404` with a stable error code if no owner profile has been saved.
- Returns `401` for missing or invalid authorization, and a generic `500` for unexpected server failures.
- Includes `Cache-Control: no-store` on success and error responses. Do not log link tokens, signed URL signatures, or authorization headers.

## Data and Behavior

- Store only the information needed to validate and manage the active link and its signed vCard URL. Do not store a duplicate owner profile or vCard in each link.
- Each created link is unique, remains active without an age-based expiry, and is associated with a distinct signed URL for the owner's current vCard 3.0.
- This endpoint persists a distinct HMAC signature for each link. Guest-facing URL validation, vCard delivery, and link revocation are handled by their respective endpoints and are outside this spec.
- The guest URL opens the guest flow, where the guest can access the current owner vCard and optionally submit their own contact details.
- The vCard URL grants access only while its associated guest link is active. It is revoked when the link is manually deleted or consumed by a successful guest submission.
- Opening the guest link or downloading the vCard does not consume the link. The first successful guest form submission consumes it; invalid or failed submissions do not.
- Link creation must not expose the admin token, signing key, or other links. Link credentials and signed URL signatures must not appear in logs.
- The shareable URL must direct the guest to the intended ContactSwap guest flow, not expose an owner-only route or a public profile URL.

## Acceptance Criteria

- Requests without a valid admin token receive `401` and create no link.
- An authorized request with no saved owner profile receives the documented `404` and creates no link.
- Each successful request creates exactly one active link and returns its shareable URL with `201` and `Cache-Control: no-store`.
- Repeated successful requests produce distinct guest URLs and distinct stored link-scoped signatures; neither signature is included in the owner API response.
- Error responses do not disclose contact details, credentials, or internal exception details.
- Automated tests cover authorization, profile absence, creation, uniqueness, persistence, and response headers without live Cloudflare services or real personal data.
- A local `.http` request demonstrates link creation using a local development token supplied outside the committed request file.
- Type checking, the API test suite, and the production build pass.

## Verification

Run focused API tests, then the repository type-check, test, and production build commands. Verify local link creation through the API request example and confirm that credentials are supplied only at request time and do not appear in responses or logs.