# 013: Owner Submitted vCard Downloads Frontend

## Status

Done

## Goal

Let Quinten find retained guest submissions in the owner interface and download an individual submission as a vCard 3.0 using the existing owner-authorized API.

## Scope

- Add a dedicated owner page for listing retained guest submissions, reachable from the existing owner navigation.
- Load the privacy-minimized submission list and show enough information to identify a submission.
- Provide an explicit download action for each retained submission.
- Reuse the existing owner token flow and submission API contracts; do not add or change API endpoints.
- Provide clear loading, empty, download-in-progress, authorization, expired-submission, and recoverable-error feedback.
- Add focused frontend tests for listing, downloading, authorization, and failure states.

## Out of Scope

- Changes to guest submission, retention, or vCard generation API behavior.
- Displaying full guest contact details, editing or deleting submissions, or adding search and filtering.
- Changes to the profile or guest-link management workflows.
- Owner or guest account features, multiple owners, or changes to the 48-hour retention period.

## Owner Flow

1. Quinten opens the submitted-contacts page from the existing owner navigation. It uses the already authenticated owner token; it must not ask for a second token.
2. The page loads retained submissions and displays them newest first. Each item shows the guest's submitted name and submission time, plus a Download action.
3. When there are no retained submissions, the page shows a clear empty state. It does not imply that expired submissions remain available.
4. Quinten selects Download for one submission. The page fetches that submission's vCard and initiates a file download only after receiving and validating a successful response.
5. The page reports completion or a safe, recoverable error. A failed download must not be presented as successful.
6. Quinten can navigate to the profile or guest-link page without entering the token again.

## API Integration

- Use the existing same-origin `/api` routes. Local development uses the configured Vite `/api` proxy.
- Send the existing admin token only in the `Authorization` header on every owner API request. Do not place it in a URL, request body, frontend build configuration, or logs.
- `GET /api/owner/submissions` returns `{ submissions: [...] }`. Each item contains only `id`, `name`, `createdAt`, and `expiresAt`. Validate the response before displaying or using its IDs.
- The list endpoint is ordered newest first and excludes submissions expired at the current time. Treat an empty list as a normal state.
- Download a selected submission with `GET /api/owner/submissions/{id}/vcard`, encoding the ID as a path component.
- The API returns a generated vCard 3.0 attachment with `Content-Type: text/vcard; version=3.0; charset=utf-8` and a sanitized `firstname-lastname.vcf` filename based on the submitted name. Use the returned file content and attachment filename when initiating the download; do not construct vCard content from the list response.
- Respect `Cache-Control: no-store`. Do not cache contact data or vCard blobs beyond what is needed to complete the immediate download.
- Do not log contact fields, submission IDs, authorization headers, response bodies, or vCard contents.

## Submission List and Download Behavior

- Display only each guest's name and localized submission time from the list response. Do not call the detail endpoint or show email, address, birthday, picture, expiration timestamp, or internal submission ID.
- Keep each download action associated with its own submission. Disable that action while its request is in progress and prevent duplicate requests for that record; unrelated records may remain available.
- Accept a download only when the response is successful, has a `text/vcard` content type, and contains a non-empty body. Create a temporary object URL to download the returned file and revoke it after use.
- Use the filename supplied by the API attachment response. If it cannot be read, use a fixed generic `.vcf` filename that does not contain guest contact information.
- On a `404` from the download endpoint, explain that the submission is no longer available (for example, it expired) and refresh the list so the UI no longer offers a stale download when the refreshed list succeeds. Do not distinguish missing from expired records.
- Do not claim a download succeeded if the response is invalid, the network fails, or the API returns an error. Preserve the list and allow retry for recoverable failures.

## Authentication, Privacy, and Error States

- Use the existing owner authentication flow and remembered-token behavior. A `401` clears the invalid token and returns to login without leaving submission data visible.
- Do not persist submission data or downloaded vCards in browser storage. Keep vCard contents only in the transient response/blob needed to initiate the requested download.
- Never expose contact details outside the authenticated owner page or include them in URLs, logs, analytics, or user-facing error details.
- Show distinct loading, empty, populated, downloading, unauthorized, no-longer-available, and recoverable service/network-error states.
- Use safe, actionable feedback that does not include response internals, credentials, or contact data.
- Use semantic headings and buttons, visible keyboard focus, accessible status/error announcements, and a responsive touch-first layout suitable for mobile Safari and Chrome.

## Acceptance Criteria

- An authenticated owner can navigate to a distinct submitted-contacts page and return to the profile and guest-link pages without re-entering a valid token.
- The page sends an authorized `GET /api/owner/submissions`, validates the response, and displays retained submissions newest first.
- A submission row shows only the submitted name and localized submission time; it does not expose email, address, birthday, picture, expiration timestamp, or submission ID.
- An empty list displays a useful empty state without a false error.
- Selecting Download requests only the selected record's `/vcard` endpoint and sends the owner token only in the authorization header.
- A valid, non-empty vCard response is downloaded as a `.vcf` attachment using the API's personalized filename; invalid content or failed requests do not trigger a false success state.
- Unknown or expired records are handled identically as unavailable; after a successful refresh they are removed from the list.
- Duplicate downloads for one submission are prevented while its request is in progress, and failed recoverable downloads can be retried.
- A `401` returns to the established login flow and leaves no submission details visible.
- Contact data, the admin token, and vCard contents are not persisted or logged by the frontend.
- Automated frontend tests cover authenticated headers, list validation and rendering, empty and populated lists, successful download and filename handling, invalid vCard responses, unavailable submissions, network/service failures, duplicate-action prevention, and unauthorized responses.
- Web type checking and the production build pass.

## Verification

Run the focused web tests, the web type check, and the web production build. Verify the listing and download flow against the existing API contracts, including empty and expired records, invalid authorization, failed downloads, and retry behavior. Confirm that contact details and vCard contents are not persisted or logged and that download filenames do not contain guest contact information.

## Implementation Decision

Use a separate `/owner/submissions` page alongside the existing profile and guest-link pages. Reuse the owner token flow, navigation conventions, and API contracts from spec 005. The frontend must not request or display the full submission detail endpoint for this download-only workflow.
