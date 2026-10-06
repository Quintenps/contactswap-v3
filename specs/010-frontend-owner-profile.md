# 010: Owner Login and Profile Frontend

## Status

Proposed

## Goal

Build the mobile-first owner interface for Quinten to authorize with the existing admin token, view and update his persisted contact profile, and manage the optional profile photo.

## Scope

- Replace the current web welcome screen with an owner login and profile flow.
- Load the saved owner profile and display its required fields: name, email, address, and birthday.
- Allow the owner to create the profile when none has been saved, or edit and save the existing profile.
- Allow the owner to view, upload, replace, and remove the optional profile photo.
- Provide clear loading, validation, success, authorization, and service-error feedback.
- Keep the API Worker as the authority for authentication, validation, profile persistence, and photo processing.

## Out of Scope

- Guest submission, guest-link management, guest-submission review, and guest vCard downloads.
- Owner account creation, password authentication, multiple owners, or a new authentication/session API.
- Changes to API routes, API response contracts, profile fields, photo processing rules, or data retention.
- Downloading the owner's profile vCard from this screen.

## Owner Flow

1. The owner opens the owner page. If a token is remembered in browser storage, the frontend tries it; otherwise, the owner is prompted to enter the existing admin token.
2. The frontend sends the token only in the `Authorization` request header and requests `GET /api/owner/profile`. It remembers the token only after an authenticated profile response, including the documented profile-not-found response.
3. On success, the owner sees the saved profile fields and whether a photo is present. The photo preview is loaded from the owner-authorized photo endpoint.
4. If the API reports that no profile exists, the owner sees an empty profile form and can create one by saving all required fields.
5. The owner edits the required fields and explicitly saves them with `PUT /api/owner/profile`. Unsaved changes are not presented as saved.
6. After a profile exists, the owner can upload or replace a photo using `PUT /api/owner/profile/photo`, or choose to remove it. Removal requires explicit confirmation before sending `DELETE /api/owner/profile/photo`; cancelling leaves the photo unchanged.
7. The owner can log out, which removes the token from browser storage and active frontend state and returns to the login screen.

## API Integration

- Use the existing same-origin `/api` routes. Local development uses the Vite `/api` proxy to the API Worker.
- Send `Authorization: <admin-token>` on every owner API request. Do not put the token in a URL, request body, frontend build configuration, or logs.
- `GET /api/owner/profile` returns `name`, `email`, `address`, `birthday`, and `hasPhoto`. A `404` profile-not-found response means the profile has not yet been created; it is not a generic service failure.
- `PUT /api/owner/profile` sends JSON containing only `name`, `email`, `address`, and `birthday`. Profile saves do not accept a photo URL, object key, image bytes, or `picture` field.
- The photo upload uses the raw selected file as the body of `PUT /api/owner/profile/photo` and declares its actual supported media type (`image/jpeg`, `image/png`, or `image/webp`).
- `GET /api/owner/profile/photo` returns the optimized JPEG for an authenticated preview. Render it only within the authorized owner interface; do not publish or persist a public image URL.
- `DELETE /api/owner/profile/photo` removes the current photo. A successful removal clears the displayed preview and updates the UI to reflect no photo.
- Do not send profile or photo requests until a token has been entered. The API remains responsible for validating every request; frontend gating is not an authorization boundary.

## Form and Photo Behavior

- Name, email, address, and birthday are required. Trim text values before saving; use an email input and a date input with the API's `YYYY-MM-DD` birthday representation.
- Keep user-entered values available after validation or service errors. Show field-level feedback for invalid required fields, email, or birthday when the API rejects the save.
- Keep profile-field saving separate from photo management, matching the existing API. Photo upload is enabled only after the profile has been created.
- Ask for explicit confirmation before removing a photo. Do not send the delete request when the owner cancels.
- Accept only JPEG, PNG, or WebP source images. The API enforces the authoritative source-size and image-content limits and returns stable errors; the frontend must show those errors safely rather than claiming an upload succeeded.
- Use the authenticated photo endpoint for preview. If using an object URL for a fetched image, revoke it when replaced, removed, or when the authenticated view ends.
- Do not claim that a save or photo operation succeeded until its API request succeeds. Refresh displayed profile/photo state from the response or a subsequent authorized read as appropriate.

## Authentication and Privacy

- The admin token is a bearer credential, not an account password. Never bundle it into static assets, persist it in source-controlled files, include it in analytics, or expose it to browser logs or user-visible error details.
- Remember the token in `localStorage` so it survives browser restarts, as selected for this feature. Store it only after the API confirms it is valid; do not store a token following a network or server error.
- Never render a token in the page after it has been entered. Provide a deliberate logout action that clears the active token.
- Remove the stored token and return to login on an API `401`; do not retry repeatedly with invalid credentials.
- Do not store profile responses, photo bytes, or generated previews in a shared cache. Respect the API's `Cache-Control: no-store` responses.
- Do not log contact fields, birthday, photo contents, token, authorization headers, or full request/response bodies.

## UI, Accessibility, and Error States

- Use a simple, touch-first responsive layout suitable for mobile Safari and Chrome.
- Use semantic form controls, associated labels, visible keyboard focus, and accessible status/error announcements.
- Provide distinct loading, empty-profile, saved-profile, saving, photo-uploading, photo-removing, unauthorized, and recoverable service-error states.
- Keep the save action unavailable while a save is in progress; prevent duplicate submissions and preserve edits if saving fails.
- Explain that authorization is required without displaying or echoing the entered token.
- Show safe, actionable feedback for network errors, API validation errors, missing profile/photo responses, unsupported photo types, oversized uploads, and unexpected server errors.

## Acceptance Criteria

- An owner can enter the admin token and load an existing profile, or reach an empty form when the profile API returns its documented not-found response.
- The token is sent only in the `Authorization` header and never appears in built frontend assets, URLs, logs, or error messages.
- A valid profile can be created and subsequently loaded with all four required fields and the correct birthday representation.
- An existing profile can be updated without creating another profile; rejected saves do not discard the owner's entered values or show a false success state.
- Missing or invalid authorization returns the UI to login without exposing profile data.
- An owner can upload and replace a supported photo after profile creation and see the optimized photo using the authorized preview endpoint.
- An owner can remove a photo, and the UI accurately reflects that it is no longer present.
- Cancelling photo-removal confirmation leaves the photo and its preview unchanged and sends no delete request.
- Failed photo or profile operations show safe feedback and do not make the UI claim that unsaved changes were persisted.
- The login and profile form are usable by keyboard and on mobile-sized viewports, with labels, visible focus, and announced status/errors.
- Automated frontend tests cover login/authenticated API headers, profile loading including initial absence, create/update payloads, invalid credentials, photo preview/upload/replacement/removal, and service failures.
- Web type checking and production build pass.

## Verification

Run the focused web tests, web type check, and web production build. Verify that the production bundle contains no admin token and that profile and photo requests are sent through the configured `/api` route with the token only in the authorization header.
