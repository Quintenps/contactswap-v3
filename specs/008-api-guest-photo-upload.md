# 008: Guest Photo Upload API

## Status

Proposed

## Goal

Allow a guest to include an optional photo in the same request as their contact submission. Store only the optimized photo in private R2, keep its object key with the guest record in D1, include the photo in the owner's generated guest vCard 4.0, and automatically expire guest photos through an R2 lifecycle rule.

## Scope

- Extend the guest submission API from spec 004 to accept an optional uploaded photo.
- Keep existing JSON submissions without a photo working; accept multipart form submissions when a photo is supplied.
- Reuse the owner-photo image validation, optimization, output limits, private R2 bucket, and Cloudflare Images binding established by spec 007.
- Persist only the guest photo's R2 object key in D1.
- Include the optimized photo as a base64 `PHOTO` data URI in the owner-authorized vCard generated for that guest submission.
- Store every guest photo under a dedicated R2 key prefix with a lifecycle expiration rule of 30 days. Keep owner photos under a separate prefix that is not covered by this rule.
- Add a D1 migration, focused API tests, and a local `.http` example using synthetic data.

## Out of Scope

- Guest-facing form or other frontend changes.
- A standalone guest-photo preview, public image URL, or separate guest photo upload endpoint.
- Changes to required guest fields, single-use guest links, notification contents, or the 30-day retention period.
- Guest photo access through the owner's profile vCard or the link-scoped signed owner vCard.
- Multiple photos, original-file retention, photo history, or general-purpose file management.

## API Contract

### `POST /api/guest/links/{token}/submissions`

- Continue accepting the existing `application/json` request with required `name`, `email`, `address`, and `birthday` string fields. JSON requests do not accept `picture` or any other additional field; arbitrary picture URLs and object keys are not accepted.
- Also accept `multipart/form-data` with the same four required text fields and at most one optional file field named `picture`.
- The photo is part of the submission: store the guest record, consume the link, and enqueue its notification only when the complete submission succeeds. An omitted photo remains valid.
- Reject malformed multipart bodies, missing or duplicate required fields, duplicate or non-file `picture` values, multiple files, and unsupported extra fields with the stable `400 invalid_submission` error. Preserve existing required-field, email, birthday, and whitespace validation.
- For an included file, accept only `image/jpeg`, `image/png`, or `image/webp`. Verify the declared media type against the file signature; reject empty, malformed, mismatched, SVG, and animated images. Do not trust a filename or extension.
- Limit the source photo to 19 MiB. Return `413` with the stable photo-size error if the source exceeds that limit, `415` for an unsupported media type, `400` for an invalid image, and `422 photo_too_large` if it cannot be optimized within the output limit.
- Return the existing `201` success response with no contact values, image bytes, filename, or object key. Preserve the existing `404` response for an unknown link and `410` response for a consumed or revoked link. Invalid submissions do not consume a link.
- Continue setting `Cache-Control: no-store` on all guest API responses. Do not log tokens, submitted contact values, uploaded bytes, filenames, object keys, or photo content.

### Owner guest vCard download

- `GET /api/owner/submissions/{id}/vcard` remains owner-authorized and generates the card on demand from the retained guest record and, when present, its optimized R2 photo.
- Embed the optimized JPEG as `PHOTO:data:image/jpeg;base64,<base64-data>` using the existing vCard 4.0 renderer and line-folding behavior. Do not store a rendered vCard or base64 photo data.
- Keep the existing attachment content type, filename, `Cache-Control: no-store`, and not-found behavior for missing or expired submissions.
- Do not return the R2 object key or expose the photo through a separate guest-facing or public route. The existing guest-link signed vCard continues to contain the owner's photo only, not a guest photo.

## Photo Processing

- Use the same server-side photo processing as spec 007: normalize to JPEG, preserve aspect ratio, scale down without upscaling to fit within 256 by 256 pixels, and strip JPEG APP1-APP15 and comment metadata from the optimized output.
- Try maximum dimensions of 256, 192, 128, and 96 pixels, with JPEG qualities 85, 75, and 65 at each size, in that order. Accept the first metadata-stripped result no larger than 75 KiB; do not encode below quality 65 or a 96-pixel maximum dimension.
- Store only the optimized JPEG in the existing private R2 bucket. Generate the key on the server; never derive it from or persist the client filename.
- Use the same photo limits and stable image error codes as the owner photo upload. Do not return image data or an R2 URL in API responses.

## Data and Consistency

- Add a nullable `photo_key` column to `guest_submissions`. Existing records remain valid with no photo. Store no image bytes, original file, base64 data, public URL, or rendered vCard in D1.
- The guest submission and link consumption remain atomic in D1, including the new `photo_key` and existing notification-outbox record. A submission with no photo stores `NULL`.
- Validate the link before doing photo processing or writing an object, but retain the existing conditional D1 write as the authority for single-use behavior. Concurrent requests must not both create a submission.
- Generate keys for guest photos under a dedicated prefix such as `guest-submissions/`; do not use this prefix for owner photos or unrelated files. Configure an R2 object lifecycle expiration rule for this prefix at 30 days. The rule applies to every object under the prefix, including uploads left behind by failed submissions or concurrent requests that lose the single-use-link race.
- Because R2 and D1 cannot share a transaction, write the optimized object before the conditional D1 batch. Do not report success unless both the R2 write and the D1 batch succeed. If persistence fails after an object is written, return a safe generic failure without consuming the link or enqueueing a notification. Do not add a D1 staging journal or perform manual R2 deletion; the lifecycle rule expires unreferenced guest objects automatically.
- The owner vCard endpoint reads photo bytes from the referenced private R2 object. If the object is unexpectedly missing or unreadable, fail safely rather than returning a vCard that silently omits the stored photo; do not expose storage details or guest data in the error.
- At the 30-day expiry boundary, an expired submission and its photo are unavailable to the owner API even if scheduled cleanup or R2 lifecycle processing has not completed. D1's `expires_at` remains the access-control boundary. Scheduled cleanup deletes expired submission rows as before but does not delete R2 objects. R2 lifecycle processing removes guest-prefix objects asynchronously; Cloudflare documents that objects are typically removed within 24 hours of their lifecycle expiration time.
- The notification continues to contain only the existing fixed submission summary. Never include guest contact fields, photo data, filenames, or object keys.

## Security and Privacy

- The R2 bucket remains private and is accessed only through the API Worker binding. Do not enable public delivery, custom domains, presigned URLs, or standalone guest-photo routes.
- Configure the lifecycle rule at the R2 bucket level for the dedicated guest-photo prefix only. Owner photo keys must remain outside the prefix, so owner photos are not automatically expired.
- Limit photo access to the existing owner-authorized submission vCard endpoint. Guest endpoints must not gain a way to retrieve a submitted photo after submission.
- Do not expose `photo_key` in owner list or detail responses, guest responses, logs, or error messages.
- Apply the existing owner authorization before reading a guest submission or its R2 object. Expired and missing submissions return the same not-found response.
- Return generic safe errors for unexpected failures; never include exception details, credentials, personal data, or uploaded content.
- A downloaded vCard contains a self-contained copy of the guest photo and cannot be revoked after download. The submission becomes unavailable through ContactSwap at the 30-day expiry boundary; the private R2 object is removed asynchronously by its lifecycle rule, and previously downloaded copies cannot be retracted.

## Acceptance Criteria

- Existing JSON guest submissions without a photo continue to succeed with the existing validation, single-use behavior, notification, and response contract.
- A valid multipart submission with all required fields and one supported photo succeeds once, stores the guest record and optimized JPEG, consumes the link, and creates the existing privacy-safe notification.
- The guest's uploaded file is normalized to a metadata-free JPEG within the specified dimension and 75 KiB output limits. Invalid, animated, oversized, unsupported, mismatched, and uncompressible files are rejected with the documented stable errors and do not consume the link or leave a stored guest record.
- Submissions without a photo have a null photo key and generate the same vCard content as before. Submissions with a photo generate an owner-downloadable vCard 4.0 whose decoded `PHOTO` bytes exactly match the optimized R2 object and whose folded line unfolds correctly.
- Unauthorized owner requests cannot retrieve contact data or photo content. The photo key is not exposed by owner list/detail responses or any guest response, and no guest or public route returns photo bytes or a URL.
- Unknown, consumed, and revoked links retain the existing behavior. Concurrent submissions cannot create more than one guest record. Any object written for a losing request remains private under the guest-photo prefix and is automatically expired by the R2 lifecycle rule.
- Failed R2 or D1 persistence does not consume the link or enqueue a notification, and does not return success. Any uploaded but unreferenced object is automatically expired by the same R2 lifecycle rule; no staging journal or manual object deletion is required.
- Expired submissions are unavailable at the 30-day D1 boundary. Scheduled cleanup removes expired D1 records, and the R2 lifecycle rule asynchronously expires guest-photo objects within the documented lifecycle processing window.
- Webhook notifications contain no contact values, photo content, filename, object key, or other guest-provided content.
- Automated tests cover JSON compatibility, multipart success, optional photos, field and file validation, image limits and normalization, link single-use and concurrency, R2 and D1 failures, vCard photo embedding, owner authorization, missing R2 objects, and expiry using local Workers bindings only. Verify the deployed R2 lifecycle rule targets only the guest-photo prefix and expires objects after 30 days.
- A local `.http` example demonstrates a multipart guest submission using synthetic data and no committed credentials or personal contact data.
- Type checking, the API test suite, and production builds pass.

## Verification

Run focused guest-photo API tests, then the repository type-check, test, and production build commands. Exercise photo submission and owner vCard download against local D1 and R2 bindings with generated test images. Verify the optimized bytes embedded in the vCard exactly match the stored R2 object, failed submissions do not consume links or enqueue notifications, D1 expiry blocks access at 30 days, the deployed R2 lifecycle rule expires guest-prefix objects without affecting owner photos, and no photo data or object keys appear in API responses, logs, or errors.
