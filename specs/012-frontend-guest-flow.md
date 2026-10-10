# 012: Guest Link Frontend Flow

## Status

Done

## Goal

Provide a mobile-first guest experience for an active shared link. Let guests submit their details before automatically downloading Quinten's current vCard 3.0, while retaining a clear download-only option.

## Scope

- Resolve the guest token from the shared `/token/{token}` URL.
- For an active link, show the owner's name and optional profile picture on the landing page; show an initials avatar if there is no picture.
- Present an active-link landing page with a primary option to open the contact submission form, plus a secondary download-only option.
- Let the guest choose whether to complete and submit the contact form.
- Submit required guest contact fields and an optional picture through the existing guest API.
- Provide loading, validation, success, unavailable-link, and recoverable-error states.

## Out of Scope

- Changes to the guest API contract beyond the link-scoped name and optional profile-photo preview, revised in spec 021.
- Guest accounts, owner authentication, or access to submitted guest data after submission.
- A public owner profile URL or a vCard download that is not scoped to the guest's active link.

## Guest Flow

1. The guest opens the shared `/token/{token}` URL.
2. While the frontend resolves the link, show a clear loading state and do not expose internal errors or credentials.
3. If the link is active, show a prominent owner contact-card preview containing only the owner's name and optional profile picture. Use a large initials avatar when no picture exists. Introduce the page with personal copy that makes clear the card contains the owner's latest saved details. Show a landing page with two choices, giving the primary visual emphasis to:
   - **Share my details, then get the card**, which opens the guest submission form without downloading the vCard.
   - **Download the card only**, a clearly available but visually secondary action that downloads the vCard without opening the form.
4. When the guest chooses the combined action, show the form without requesting the vCard. Hide the owner-card and download-choice panels while the form is open, and focus the form heading. The guest may leave the form incomplete or close it without submitting; the guest must explicitly submit the form to share their details.
5. Label the form's submit action clearly as **Submit & download card**. After the submission API confirms success, request and download the owner's current vCard. The successful card response consumes the guest link.
6. If submission succeeds but the card request fails, tell the guest their details were submitted and offer a card-download retry without resubmitting. A failed card request does not consume the link.
7. If the guest chooses download-only, download the vCard without submitting the form. A successful card response consumes the guest link.
8. A guest who returns through a submitted but not yet consumed link can resume the card download; do not show the form or permit another submission.

## API Integration

- Resolve the token with `GET /api/guest/links/{token}`. Use the returned link-scoped `vcardUrl` for download and only the owner's display name plus optional link-scoped `profilePhotoUrl` for the preview. Do not request or embed other owner contact fields in frontend JSON. Respect `submissionComplete` to show only a resumable card download when the form was already submitted.
- Serve `profilePhotoUrl` through the active guest-link flow. The Worker must validate that the link is still active before returning the private R2 photo, use `Cache-Control: no-store`, and return a safe unavailable response for deleted or consumed links. Do not make the photo publicly addressable.
- Use the returned vCard path as a same-origin URL. Keep the signed path in memory only; do not persist it, include it in analytics, or send it to external resources. Set `referrerPolicy="no-referrer"` on the download link.
- The vCard download is a `GET` to the signed URL. The API returns the current owner vCard as an attachment and consumes the link only on a successful response. A failed request must not be presented as a successful download.
- Submit to `POST /api/guest/links/{token}/submissions` as `multipart/form-data`, including `name`, `email`, `address`, and `birthday`. Include the optional `picture` file only when selected. Do not submit JSON or arbitrary picture URLs.
- Treat the API as authoritative for link status, required-field and image validation, and single-use behavior. A successful submission blocks resubmission but leaves the signed URL available until a successful download. Do not report submission success until the API returns its documented success response.
- Respect `Cache-Control: no-store` responses. Do not log guest tokens, signed vCard URLs, contact fields, birthday, uploaded files, or full request/response bodies.

## Form and Submission Behavior

- Name, email, address, and birthday are required. Use associated visible labels, an email input, and a date input using the API's `YYYY-MM-DD` representation.
- Picture is optional. Accept the API-supported JPEG, PNG, and WebP formats and show safe, actionable feedback for rejected files. Do not claim an upload succeeded before the submission succeeds.
- Provide client-side required-field checks for usability, while retaining server-side validation as the authority. Show field-level feedback where practical and preserve entered values if validation or a recoverable service request fails.
- Prevent duplicate submissions while a request is in progress. Keep the entered form values available after a recoverable error so the guest can correct the input or retry.
- A successful submission automatically starts the card download. Show the thank-you state after that card request succeeds; if it fails, show that the form succeeded and provide a retry without displaying or retaining submitted contact details.
- A `404` unknown-link or `410` revoked/consumed-link response displays a stable unavailable-link state. Do not show the form or a download action for an unavailable link.
- If a link becomes unavailable between resolution and submission or download, show the corresponding safe unavailable state. Do not imply that the link remains usable based only on the earlier resolution.

## UI, Accessibility, and Error States

- Use a simple, touch-first responsive layout suitable for mobile Safari and Chrome.
- Make the combined form action visually prominent and keep **Download the card only** clearly available as a secondary action. The combined action opens the form without starting a download.
- The landing-page heading, owner card, and action copy should clearly communicate that the guest can download Quinten's latest saved contact information after submitting details, or download the card only. Guest details are shared only after explicit form submission.
- When the guest chooses the combined action, hide the owner-card and download-choice panels and show the form as the page's focus. Scroll it into view near the top of the viewport and move keyboard focus to its heading. Closing the form restores the landing page panels.
- Use concise supporting text to explain that the combined action opens a form and downloads Quinten's card only after successful submission; the form is not submitted until the guest explicitly submits it.
- Give the thank-you, unavailable-link, and recoverable link-error states a friendly, vertically centered full-page layout. Use decorative emoji and subtle entrance motion, and disable nonessential animation when reduced motion is preferred.
- Use semantic buttons, links, and form controls; associate labels with inputs; provide visible keyboard focus; and announce loading, submission, and error status changes accessibly.
- Provide distinct loading, active-link, unavailable-link, form-open, submitting, submitted/card-retry, downloaded, thank-you, and recoverable service-error states.
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
- The combined action opens the form without downloading or submitting. The download-only alternative remains clear and available.
- The profile-photo resource is available only through an active guest link, is returned with `Cache-Control: no-store`, and is not served after the link is deleted or consumed.
- The landing page makes the combined submit-then-download flow the primary action and offers **Download the card only** as a secondary action.
- Choosing **Download the card only** opens a localized prompt encouraging the guest to share their details; dismissing it leaves the link active, while continuing downloads the owner's current vCard without submitting the form.
- Choosing the combined action opens the form without requesting the vCard.
- While the form is open, the owner-card and download-choice panels are hidden; closing the form restores them.
- After the combined action, the form appears before the download options, scrolls near the top of the viewport, and receives keyboard focus.
- Submitting valid details sends the form before requesting the link-scoped signed URL. A successful vCard response downloads the owner's current vCard 3.0 and consumes the link.
- A guest can choose not to submit after opening the form, and no submission request is sent unless they explicitly submit it.
- The form requires name, email, address, and birthday and allows a picture to be omitted.
- Invalid fields and unsupported/invalid pictures produce safe feedback; rejected or failed submissions do not show the thank-you state or discard the guest's entered values.
- A successful submission sends multipart form data and starts the vCard download. A successful card response displays the thank-you state; a failed card request offers a retry without resubmission or exposing submitted details.
- Unknown, revoked, and consumed links display the unavailable state without exposing whether a link token or signature exists.
- Thank-you, unavailable-link, and recoverable link-error screens are vertically centered, use friendly visual treatment, and respect reduced-motion preferences.
- Concurrent or repeated submission attempts cannot create multiple submissions. Only one successful vCard response can consume a link; a failed card request leaves it available.
- Signed URLs, guest tokens, and personal data are not persisted in browser storage, sent to third parties, or written to logs.
- Automated frontend tests cover active-link resolution, both download choices, form opening without a download, submission-before-download ordering, download retry without resubmission, required-field and optional-picture behavior, unavailable links, and recoverable errors.
- Type checking, the frontend test suite, and the production build pass.
