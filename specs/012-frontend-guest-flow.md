# 012: Guest Link Frontend Flow

## Status

Done

## Goal

Provide a mobile-first guest experience for an active shared link. Encourage guests to download Quinten's current vCard 3.0 and share their own details, while retaining a clear download-only option.

## Scope

- Resolve the guest token from the shared `/guest/{token}` URL.
- For an active link, show the owner's name and optional profile picture on the landing page; show an initials avatar if there is no picture.
- Present an active-link landing page with a primary option to download Quinten's current vCard 3.0 and open the contact submission form, plus a secondary download-only option.
- Let the guest choose whether to complete and submit the contact form.
- Submit required guest contact fields and an optional picture through the existing guest API.
- Provide loading, validation, success, unavailable-link, and recoverable-error states.

## Out of Scope

- Changes to the guest API contract beyond the link-scoped name and optional profile-photo preview, link lifecycle, vCard format, notification behavior, or retention policy.
- Guest accounts, owner authentication, or access to submitted guest data after submission.
- A public owner profile URL or a vCard download that is not scoped to the guest's active link.

## Guest Flow

1. The guest opens the shared `/guest/{token}` URL.
2. While the frontend resolves the link, show a clear loading state and do not expose internal errors or credentials.
3. If the link is active, show a prominent owner contact-card preview containing only the owner's name and optional profile picture. Use a large initials avatar when no picture exists. Introduce the page with personal copy that makes clear the card contains the owner's latest saved details. Show a landing page with two choices, giving the primary visual emphasis to:
   - **Download my card & share your details**, which starts the owner's current vCard 3.0 download and opens the guest submission form.
   - **Download card only**, a clearly available but visually secondary action that downloads the vCard without opening the form.
4. The guest may download the card without submitting anything. Downloading or viewing the card does not consume the guest link.
5. When the guest chooses **Download my card & share your details**, begin the download and show the form. Hide the owner-card and download-choice panels while the form is open, and focus the form heading. The guest may leave the form incomplete or close it without submitting; the guest must explicitly submit the form to share their details.
6. The guest may complete the form with their required details and optionally attach a picture. A download failure must be reported separately and must not prevent the form from being shown or submitted.
7. After a successful submission, replace the active-link view with a thank-you state. The guest link is consumed by the successful submission, and its signed vCard URL is no longer usable.

## API Integration

- Resolve the token with `GET /api/guest/links/{token}`. Use the returned link-scoped `vcardUrl` for either download choice and only the owner's display name plus optional link-scoped `profilePhotoUrl` for the preview. Do not request or embed other owner contact fields in frontend JSON.
- Serve `profilePhotoUrl` through the active guest-link flow. The Worker must validate that the link is still active before returning the private R2 photo, use `Cache-Control: no-store`, and return a safe unavailable response for deleted or consumed links. Do not make the photo publicly addressable.
- Use the returned vCard path as a same-origin URL. Keep the signed path in memory only; do not persist it, include it in analytics, or send it to external resources. Set `referrerPolicy="no-referrer"` on the download link.
- The vCard download is a `GET` to the signed URL. The API returns the current owner vCard as an attachment. A download failure must not be presented as a successful download or as a completed guest submission.
- Submit to `POST /api/guest/links/{token}/submissions` as `multipart/form-data`, including `name`, `email`, `address`, and `birthday`. Include the optional `picture` file only when selected. Do not submit JSON or arbitrary picture URLs.
- Treat the API as authoritative for link status, required-field and image validation, and single-use behavior. Do not report submission success until the API returns its documented success response.
- Respect `Cache-Control: no-store` responses. Do not log guest tokens, signed vCard URLs, contact fields, birthday, uploaded files, or full request/response bodies.

## Form and Submission Behavior

- Name, email, address, and birthday are required. Use associated visible labels, an email input, and a date input using the API's `YYYY-MM-DD` representation.
- Picture is optional. Accept the API-supported JPEG, PNG, and WebP formats and show safe, actionable feedback for rejected files. Do not claim an upload succeeded before the submission succeeds.
- Provide client-side required-field checks for usability, while retaining server-side validation as the authority. Show field-level feedback where practical and preserve entered values if validation or a recoverable service request fails.
- Prevent duplicate submissions while a request is in progress. Keep the entered form values available after a recoverable error so the guest can correct the input or retry.
- A successful submission displays a thank-you state and does not display or retain a copy of the submitted contact details in the page.
- A `404` unknown-link or `410` revoked/consumed-link response displays a stable unavailable-link state. Do not show the form or a download action for an unavailable link.
- If a link becomes unavailable between resolution and submission or download, show the corresponding safe unavailable state. Do not imply that the link remains usable based only on the earlier resolution.

## UI, Accessibility, and Error States

- Use a simple, touch-first responsive layout suitable for mobile Safari and Chrome.
- Make **Download my card & share your details** the visually prominent primary action. Keep **Download card only** clearly available as a secondary action. The primary action must both start the download and reveal the form.
- The landing-page heading, owner card, and action copy should clearly communicate that the guest can download Quinten's latest saved contact information. Explain that the primary action opens the optional guest form after starting the download; guest details are shared only after explicit form submission.
- When the guest chooses the combined action, hide the owner-card and download-choice panels and show the form as the page's focus. Scroll it into view near the top of the viewport and move keyboard focus to its heading. Closing the form restores the landing page panels.
- Use concise supporting text to explain that the primary action downloads Quinten's card and opens a form for the guest's details; the form is not submitted until the guest explicitly submits it.
- Give the thank-you, unavailable-link, and recoverable link-error states a friendly, vertically centered full-page layout. Use decorative emoji and subtle entrance motion, and disable nonessential animation when reduced motion is preferred.
- Use semantic buttons, links, and form controls; associate labels with inputs; provide visible keyboard focus; and announce loading, submission, and error status changes accessibly.
- Provide distinct loading, active-link, unavailable-link, form-open, submitting, thank-you, and recoverable service-error states.
- Explain errors in guest-safe language. Do not show API internals, credentials, signed URL signatures, or submitted personal information in error messages.

## Privacy and Security

- Treat the guest token and signed vCard path as bearer credentials. Do not store them beyond the active page state, log them, or expose them to third-party requests.
- Treat any link-scoped profile-photo path as guest-link-scoped access; do not expose a public owner-photo URL or return the photo after the link is deleted or consumed.
- Do not place the signed vCard URL in page metadata, analytics, or links that make external requests. The download link must not send a referrer.
- Do not store guest form values in browser storage or include them in URLs.
- The frontend is not an authorization boundary. The API must continue validating the active link on every resolution, profile-photo request, vCard download, and submission request.
- Do not add any guest-facing endpoint or frontend view that can retrieve a submission after it has been accepted.

## Acceptance Criteria

- Opening an active shared link shows a loading state followed by the guest landing page.
- The active landing page shows the owner's name and optional profile picture; without a picture it shows an initials avatar. The preview does not expose other owner contact fields.
- The active landing page uses personal, download-focused copy and gives the owner card more visual prominence than surrounding text or secondary actions.
- The primary action clearly offers the owner's latest contact card, explains that it also opens the optional form, and does not submit guest details. The download-only alternative remains clear and available.
- The profile-photo resource is available only through an active guest link, is returned with `Cache-Control: no-store`, and is not served after the link is deleted or consumed.
- The landing page makes **Download my card & share your details** the primary action and offers **Download card only** as a secondary action.
- Choosing the secondary download-only action downloads the owner's current vCard and leaves the submission form closed.
- Choosing **Download my card & share your details** starts the vCard download and reveals the submission form without submitting it.
- While the form is open, the owner-card and download-choice panels are hidden; closing the form restores them.
- After the combined action, the form appears before the download options, scrolls near the top of the viewport, and receives keyboard focus.
- Downloading the card requests the link-scoped signed URL and downloads the owner's current vCard 3.0 without consuming the link.
- A guest can choose not to submit after opening the form, and no submission request is sent unless they explicitly submit it.
- The form requires name, email, address, and birthday and allows a picture to be omitted.
- Invalid fields and unsupported/invalid pictures produce safe feedback; rejected or failed submissions do not show the thank-you state or discard the guest's entered values.
- A successful submission sends multipart form data, displays the thank-you state, and does not expose the submitted details in the success response or UI.
- Unknown, revoked, and consumed links display the unavailable state without exposing whether a link token or signature exists.
- Thank-you, unavailable-link, and recoverable link-error screens are vertically centered, use friendly visual treatment, and respect reduced-motion preferences.
- Concurrent or repeated submission attempts cannot create multiple submissions; link consumption remains controlled by the API's successful atomic submission behavior.
- Signed URLs, guest tokens, and personal data are not persisted in browser storage, sent to third parties, or written to logs.
- Automated frontend tests cover active-link resolution, both download choices, form opening from the combined choice, required-field and optional-picture behavior, successful submission, unavailable links, and recoverable errors.
- Type checking, the frontend test suite, and the production build pass.
