# 002: Owner Profile API

## Status

Done

## Goal

Provide authorized API endpoints for Quinten to read and save his contact profile. The profile is persisted in D1, and its current vCard 4.0 is rendered and stored whenever a profile save succeeds.

## Scope

- Add an owner-authorized endpoint to read the persisted profile.
- Add an owner-authorized endpoint to create or update the profile.
- Add an owner-authorized endpoint to download the current stored vCard 4.0.
- Persist the required profile fields in D1: name, email, address, and birthday.
- Render and persist the current vCard 4.0 as part of each successful profile save.
- Validate profile data on the server and return safe, non-cacheable responses.
- Add D1 migration(s) and focused API tests for authorization, validation, persistence, and vCard consistency.
- Add local VS Code REST Client `.http` requests for reading, saving, and downloading the owner profile.

## Out of Scope

- Owner or guest interface changes.
- Guest links, signed vCard URLs, guest submissions, or guest downloads.
- Webhook delivery and guest-submission retention cleanup.
- Picture upload or object storage. The profile must allow a missing picture; picture handling can be specified separately.
- Owner-secret setup or rotation in Cloudflare deployment configuration.

## API Contract

### `GET /api/owner/profile`

- Requires owner authorization.
- Returns the persisted profile fields as JSON.
- Returns `404` with a stable error code when no profile has been saved yet.

### `PUT /api/owner/profile`

- Requires owner authorization.
- Accepts a JSON profile containing `name`, `email`, `address`, and `birthday`; all four fields are required. A picture is not required and is not accepted as an arbitrary client-provided URL.
- Creates the profile if none exists, otherwise replaces its editable fields.
- Returns the saved profile as JSON only after both the profile data and its rendered vCard have been persisted successfully.

### `GET /api/owner/profile/vcard`

- Requires owner authorization.
- Returns the current vCard 4.0 persisted with the profile, as a downloadable file with `Content-Type: text/vcard; version=4.0; charset=utf-8` and `Content-Disposition: attachment; filename="contactswap-profile.vcf"`.
- Returns `404` with a stable error code when no profile has been saved yet.
- Does not regenerate the vCard during download; profile saves are responsible for keeping the stored vCard current.

### Authorization and responses

- Require `Authorization: Bearer <owner-secret>` on all three endpoints and compare the supplied value against the API Worker's owner-secret binding configured as a Cloudflare Worker Secret. Never bundle the secret into frontend assets, return it in a response, place it in a URL, or write it or the authorization header to logs.
- Return `401` for missing or invalid authorization, `400` for malformed JSON or invalid profile fields, and a generic `500` response for unexpected server failures. Error responses must not contain contact data or internal details.
- Return profile data as JSON. Set `Cache-Control: no-store` on all responses from these endpoints, including the vCard download.
- JSON errors use a stable shape with a machine-readable error code and a user-safe message.

## Data and Behavior

- D1 is the canonical store for the single owner's editable profile. The implementation must not introduce multiple owners or account records.
- Trim required text fields and reject missing or blank values. Validate email format and accept a valid birthday representation consistently; malformed values must not be saved.
- Treat a profile save and its vCard refresh as one logical operation. If validation, rendering, or persistence fails, the request must not leave the stored profile and stored vCard out of sync.
- Generate vCard 4.0 from the saved profile values using correct escaping and line formatting. Do not derive editable profile values by parsing a previously generated vCard.
- The vCard download is available only through the owner-authorized endpoint. Guest-link-scoped delivery is specified separately.
- Store only data needed for the profile and its vCard. Do not add analytics or unrelated personal data.

## Acceptance Criteria

- An unauthenticated or incorrectly authorized request to any owner profile endpoint receives `401` and does not disclose profile or vCard data.
- An authorized `GET` returns the saved required profile fields, or the documented `404` when no profile exists.
- An authorized `PUT` creates a profile and a subsequent `GET` returns the saved values.
- An authorized `GET /api/owner/profile/vcard` downloads the current stored vCard with the specified media type, filename, and `Cache-Control: no-store`; it returns `404` when no profile exists.
- A later `PUT` updates the existing single-owner profile rather than creating a second profile.
- Missing or blank required fields, invalid email, invalid birthday, and malformed JSON are rejected with `400`; rejected input does not change the profile or vCard.
- A successful save persists a vCard 4.0 generated from the saved fields. A failed save cannot leave the profile and vCard inconsistent.
- All endpoint responses include `Cache-Control: no-store`; error responses do not expose secrets, contact values, or internal exception details.
- Automated tests cover authorization, initial profile absence, create/read/update, vCard download headers and body, invalid input, and profile-vCard consistency using the Workers test environment without live Cloudflare services or real personal data.
- `apps/api/requests/owner-profile.http` provides runnable local requests for profile read, save, and vCard download; its admin token is loaded from the ignored local `.env` file and is not committed.
- Type checking, the API test suite, and the production build pass.

## Verification

Run the focused API tests, then the repository type-check, test, and build commands. Verify the endpoints against the local D1 binding and confirm that admin credentials are supplied only at request time and are absent from built frontend assets and logs. Start the local API and execute each request in `apps/api/requests/owner-profile.http` with the VS Code REST Client extension.