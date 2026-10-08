# 021: Guest Submit and Download Flow

## Status

Done

## Goal

Make the guest's combined action submit their contact details first and download Quinten's current vCard only after the submission succeeds. Consume a guest link when its card download succeeds, not when the submission is stored.

This spec intentionally revises the guest download and link-consumption behavior in specs 004 and 012. It does not change the required guest fields, submission validation, webhook privacy, or 30-day retention policy.

## Scope

- Update the guest interface so the combined action opens the form without downloading the card.
- Make the form's submit action clearly communicate that it submits the guest's details and downloads Quinten's card.
- Download Quinten's card only after the submission API confirms success.
- Consume a guest link when its signed vCard request succeeds, whether the guest chooses the download-only action or submits the form first.
- Preserve a retry path for a failed card download after a successful submission, without submitting the guest's details again.
- Add focused frontend and API tests for the revised flow and link lifecycle.

## Out of Scope

- Changes to guest fields, validation rules, vCard format or contents, webhook payload, or retention.
- Changes to owner flows, guest accounts, multi-owner support, public profiles, or age-based link expiration.
- Changes to the existing download-only option.

## Guest Flow

1. The guest opens an active shared link and sees the existing owner-card preview and download choices.
2. Choosing **Download the card & share my details** opens the form without requesting or downloading the vCard.
3. The form's primary action is labeled to make both effects clear, such as **Submit & download card**. The guest's details are not sent until this action is pressed.
4. The frontend submits the form to `POST /api/guest/links/{token}/submissions`.
5. Only after the API confirms a successful submission does the frontend request the link-scoped vCard and start its download.
6. A successful card response completes the guest flow and consumes the link. The frontend shows a clear completion state.
7. If submission succeeds but the card request fails, tell the guest their details were submitted and that the card could not be downloaded. Offer a card-download retry without resubmitting the form.
8. Choosing **Download card only** continues to download the vCard without submitting guest details. A successful card response consumes the link.

## API and Link Lifecycle

- A successful form submission stores exactly one guest record and triggers the existing privacy-safe webhook, but does not consume the link or revoke its signed vCard URL.
- Persist the submission timestamp on the link so deletion of the guest record after 30 days does not permit a second submission.
- After one successful submission, the same link cannot create another submission. Repeated or concurrent submission requests must not create another guest record or send another submission notification.
- Until a successful card response consumes the link, the signed vCard URL remains usable. This allows the combined flow to download the card after submission and to retry after a failed card request.
- A successful `GET /api/guest/vcard/{linkId}/{signature}` response consumes the associated link. This applies both to a download-only request and to a request following form submission.
- A rejected or failed vCard request does not consume the link. A manually revoked link remains unavailable regardless of submission state.
- Link resolution must allow the guest to recover the pending card download after a successful submission, without allowing another submission. It must not return guest contact details.
- Link consumption and successful card delivery must not leave a link usable for a second download or submission. Concurrent requests must not create duplicate submissions or successful downloads for the same link.
- Responses retain the existing `Cache-Control: no-store` and vCard `Referrer-Policy: no-referrer` requirements. Tokens, signatures, contact values, and uploaded files must not be logged.

## Form, Feedback, and Error Behavior

- Preserve the existing required fields, optional picture behavior, client/server validation, and entered values on recoverable submission errors.
- Prevent duplicate form submissions while a request is in progress.
- Do not request the vCard if form validation fails or the submission request fails.
- Do not report a successful submission until the API confirms it. Do not report a successful card download unless the vCard request succeeds.
- After a successful submission followed by a failed card request, retain only the state needed to retry the card download; do not retain or display submitted contact values.
- A consumed, deleted, or otherwise unavailable link shows the existing safe unavailable-link state. Do not offer another submission or download for a consumed link.

## Acceptance Criteria

- Choosing **Download the card & share my details** opens the form and does not start a vCard request.
- The form's primary action clearly indicates both submission and card download.
- A valid form is submitted before any vCard request is made; invalid or failed submissions do not trigger a vCard request.
- A successful submission stores one guest record and sends one privacy-safe webhook notification while leaving the signed vCard URL usable.
- After successful submission, a successful vCard response downloads the card and consumes the link.
- If the post-submission vCard request fails, the guest can retry the card request without resubmitting or creating another guest record.
- The download-only action remains available, does not submit guest details, and consumes the link only after a successful vCard response.
- Failed vCard requests do not consume the link; successful card responses do not permit a second successful download or another submission.
- Repeated and concurrent submission requests cannot create duplicate guest records or duplicate submission notifications.
- Automated tests cover action labels and ordering, no download before successful submission, submission and download failures, download retry, download-only behavior, consumption after successful card response, and single-use behavior.
- Type checking, focused tests, the existing test suite, and production builds pass.

## Verification

Test the combined flow and download-only flow with active test links. Verify that the form submission precedes the card request, that failed requests preserve the appropriate retry path without duplicate submissions, and that a successful card response makes the link unavailable for further use. Confirm no tokens, signatures, contact values, or file contents appear in logs or error responses.
