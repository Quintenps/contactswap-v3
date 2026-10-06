# 011: Owner Guest-Link Management Frontend

## Status

Done

## Goal

Give Quinten a dedicated, owner-authorized page to review guest links and generate a new shareable link. Make the newly generated URL easy to copy without exposing link credentials through the link overview or other parts of the application.

## Scope

- Add a separate owner page for guest-link management, reachable from the existing owner interface.
- List guest links using their ID, creation time, and status, newest first.
- Allow Quinten to generate a new guest link and immediately copy its returned shareable URL.
- Allow Quinten to revoke a link from the overview using its link ID.
- Provide clear loading, empty, success, authorization, and recoverable service-error feedback.
- Use the existing owner authorization and link API contracts; do not add or change API endpoints.
- Add focused frontend tests for link listing, creation, copying, revocation, and error states.

## Out of Scope

- Changes to link creation, listing, revocation, guest access, or link lifecycle API behavior.
- Recovering or redisplaying a previously generated guest URL. The listing API intentionally does not return link credentials.
- Guest form, signed vCard access, guest submission review, or owner profile editing.
- Link expiry by age, multiple owners, guest accounts, or any additional account features.

## Owner Flow

1. Quinten opens the guest-link management page from the authenticated owner interface. The page uses the existing owner token flow and does not prompt for or store a second token.
2. The page requests the owner link list and shows links newest first with their creation time and status: active, consumed, or revoked.
3. If no links exist, the page shows a clear empty state and an action to generate a link.
4. Quinten chooses to generate a link. The page sends the authorized create request and waits for a successful response before showing a success state.
5. On success, the page presents the returned shareable guest URL with an explicit copy action and explains that the URL is available here only at creation time. It must not imply that the URL can be recovered from the overview later.
6. Quinten can revoke an active link from the overview. The page asks for confirmation before sending the delete request, then refreshes or updates the status after success. Cancelling leaves the link unchanged.
7. The owner can navigate back to the profile page without losing the established authenticated state.

## API Integration

- Use the existing same-origin `/api` routes. Local development uses the configured Vite `/api` proxy.
- Send the admin token only in the `Authorization` request header on every owner API request. Do not put it in a URL, request body, frontend build configuration, or logs.
- `GET /api/owner/links` returns `{ links: [...] }`. Each item contains only `id`, `createdAt`, and `status`; statuses are `active`, `consumed`, or `revoked`. Treat an empty list as a normal empty state.
- `POST /api/owner/links` accepts no body and returns the shareable `guestUrl` on success. Treat the URL as a bearer credential: keep it only in transient page state long enough for the owner to copy or use it, and do not persist it in browser storage, application logs, analytics, or the link list.
- `POST /api/owner/links` returns `404` when no owner profile exists. Show a clear explanation and direct Quinten to the owner profile page to complete the required profile before trying again. Do not treat this as a generic service failure.
- `DELETE /api/owner/links/{id}` revokes a link identified by its listed ID. The ID is not a guest token or a shareable URL. A successful `204` response has no body; update the list or reload it without assuming a response payload.
- Every owner request must use the existing authorization header convention. On `401`, clear the invalid token and return to the existing login flow without exposing link data.
- Do not display guest tokens, token hashes, signed vCard URL signatures, signing secrets, or admin credentials. Do not log full URLs returned by creation.
- Respect `Cache-Control: no-store`; do not cache link data or bearer URLs in shared storage.

## Link Overview and Actions

- Display each link's creation time in a readable, localized format and its current status. Do not imply that an active link expires by age.
- Do not display a link URL for existing links: the listing API deliberately omits the guest token and the frontend must not reconstruct it.
- Offer revocation only for active links. Consumed and revoked links remain visible with their current statuses but have no revoke action.
- Before revoking an active link, clearly explain that it will stop working for guests, including its associated signed vCard URL, and ask for confirmation.
- A confirmed revocation sends one `DELETE` request using the link ID. Disable that row's action while the request is in progress to prevent duplicate requests.
- If revocation fails, retain the last known status and show safe feedback. Do not display a false success state.
- After creating a link, refresh the overview so the new active link is included. If refreshing fails after creation succeeded, preserve the returned URL in transient page state so it can still be copied, and clearly distinguish the successful creation from the failed refresh.

## Generated URL Handling

- Provide a visible copy button for the newly returned `guestUrl`; provide an accessible fallback to select and copy the URL manually when the Clipboard API is unavailable or rejects the operation.
- Show a clear copied confirmation only after the copy operation succeeds. Copy failure must not discard the URL or claim success.
- Keep the URL out of browser storage, navigation query strings, referrer-bearing external requests, and unrelated page content. Do not send it to analytics or error reporting.
- Clear the transient URL when leaving the management page or ending the authenticated owner view. If the owner refreshes or returns later, the API does not provide a way to retrieve it; offer creation of another link rather than suggesting recovery.
- Do not create a link until the owner explicitly activates the generate action, and do not issue duplicate create requests while one is in progress.

## UI, Accessibility, and Error States

- Use a simple, touch-first responsive layout suitable for mobile Safari and Chrome.
- Use semantic headings, buttons, status text, visible keyboard focus, and accessible announcements for loading, successful creation, copy completion, revocation, and errors.
- Provide distinct loading, empty, populated, creating, copying, revoking, unauthorized, profile-missing, and recoverable service-error states.
- Keep actions unavailable while their corresponding request is in progress; preserve the generated URL if copying or the follow-up list refresh fails.
- Show safe, actionable feedback for network errors and API errors without exposing response internals, credentials, or bearer URLs.

## Acceptance Criteria

- An authenticated owner can open a distinct link-management page from the existing owner interface and return to the profile page without re-entering a valid token.
- The page loads links from `GET /api/owner/links`, orders them newest first, and displays only creation time and status alongside a non-secret identifier as needed for actions.
- An empty link list is presented as a useful empty state with an available generate action.
- An owner action creates exactly one link through `POST /api/owner/links`; on success, the UI shows the returned guest URL and offers copying it.
- A successful create followed by a failed list refresh still leaves the URL available for copying and does not misreport creation as failed.
- Copy success is confirmed only when copying succeeds; unsupported or denied clipboard access has a usable manual-copy fallback.
- Previously generated guest URLs are not recovered, stored persistently, included in the overview, or reconstructed from link IDs.
- When the profile is absent, the documented create response is explained and the owner is directed to complete the profile; no false link-created state is shown.
- Active links can be revoked after explicit confirmation using their link IDs; cancelling sends no request. Consumed and revoked links cannot be revoked from the UI.
- Link listing, creation, and revocation errors do not expose credentials, guest tokens, signed URL signatures, contact data, or internal exception details.
- A `401` returns the owner to the established login flow and does not leave link data visible.
- The page works by keyboard and on mobile-sized viewports, with visible focus and announced status and error messages.
- Automated frontend tests cover authenticated API headers, list ordering and empty state, successful and failed creation, profile absence, copy success and fallback/failure, successful and failed revocation, confirmation cancellation, unauthorized responses, duplicate-action prevention, and privacy of the generated URL.
- Web type checking and production build pass.

## Verification

Run focused web tests, the web type check, and the web production build. Verify the owner flow end to end against the existing API contracts, including profile absence, link creation and copying, list refresh failure, revocation and cancellation, and invalid authorization. Confirm the admin token and generated guest URL do not appear in production assets, persistent browser storage, URLs other than the intended copied guest URL, logs, or error messages.

## Implementation Decision

This spec places link creation and overview on a separate owner page rather than on the profile page. It reuses the existing API contracts from specs 003 and 006; the frontend must not add a way to retrieve previously generated guest URLs.
