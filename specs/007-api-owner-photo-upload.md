# 007: Owner Photo Upload API

## Status

Implemented; deployment smoke test pending

## Goal

Allow Quinten to upload, replace, preview, and remove the optional photo associated with his persisted owner profile. Photo bytes are stored privately in Cloudflare R2 and are accessible only through owner-authorized API routes.

## Scope

- Add a private R2 bucket binding for owner profile photos.
- Add the Cloudflare Images optimization binding to normalize uploaded photos before storing them.
- Persist the R2 object key for the single owner profile in D1.
- Add owner-authorized endpoints to upload or replace, preview, and remove the current profile photo.
- Extend the owner profile response with a boolean indicating whether a photo is present.
- Resize and compress photos on the server and strip image metadata. Embed the optimized image as base64 data in vCards generated when requested; never store image bytes or rendered vCard text in D1.
- Validate source image type and size on the server; never accept a client-supplied photo URL or object key.
- Add focused API tests, a D1 migration, and a local `.http` request example that uses local-only test data.

## Out of Scope

- Guest-submitted photos or changes to guest form validation.
- Serving the photo as a standalone guest-facing image or public URL. The existing link-scoped signed vCard route returns the embedded photo as part of the vCard.
- Image cropping or avatar generation. Resizing, compression, and metadata removal are in scope.
- Owner or guest interface changes.
- Multiple photos, photo history, or general-purpose file management.

## API Contract

All routes require `Authorization: Bearer <admin-token>`, following the existing owner API convention. All responses, including errors and image responses, include `Cache-Control: no-store`. Never log authorization headers, uploaded bytes, or personal photo content.

### `PUT /api/owner/profile/photo`

- Uploads a new photo or atomically replaces the current photo for the existing owner profile.
- The request body is the raw image bytes; `Content-Type` must be one of `image/jpeg`, `image/png`, or `image/webp`.
- The source upload must be at most 19 MiB, staying below the Images binding's documented 20 MB input limit. The server verifies that the bytes match the declared supported image type. Reject SVG, animated formats, mismatched content types, and empty bodies.
- The Worker uses the Cloudflare Images binding to normalize the source to JPEG, preserve its aspect ratio, and scale it down to fit within 256 by 256 pixels without upscaling. The Worker removes JPEG APP1-APP15 and comment segments from the transformed output, including EXIF GPS data.
- The Worker tries maximum dimensions of 256, 192, 128, and 96 pixels, in that order. At each dimension it tries JPEG qualities 85, 75, and 65, in that order. The Images binding's default `scale-down` fit preserves aspect ratio and does not upscale. The Worker checks the actual encoded size after metadata removal and accepts the first result no larger than 75 KiB. It returns the stable `photo_too_large` error if all 12 candidates exceed the cap; it does not encode below quality 65 or a 96-pixel maximum dimension.
- The exact optimized JPEG bytes are stored in private R2 and embedded on demand in generated vCard 4.0 `PHOTO` data URIs: `PHOTO:data:image/jpeg;base64,<base64-data>`. The vCard and base64 image are not stored; each download uses current D1 profile fields and the current R2 photo.
- Returns `200` JSON with `{ "hasPhoto": true }` after the new photo is stored and its object key is persisted.
- Returns `404` with a stable error code if the owner profile has not yet been created. The owner saves the required profile fields before uploading a photo.
- Returns `400` for an empty or malformed image, `413` when the source body exceeds 19 MiB, `415` for an unsupported media type, `422` with `photo_too_large` if an image cannot be normalized within the output cap, `401` for missing or invalid owner authorization, and a generic `500` for unexpected failures.

### `GET /api/owner/profile/photo`

- Returns the optimized JPEG bytes only to an authorized owner.
- Sets `Content-Type: image/jpeg`, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and `Cache-Control: no-store` response headers.
- Returns `404` with a stable error code when the profile or photo does not exist.

### `DELETE /api/owner/profile/photo`

- Removes the current photo and clears its object-key reference.
- Returns `204` with no response body if the profile exists, including when no photo is currently set. Repeating the request is safe.
- Returns `404` if the owner profile does not exist.

### Owner profile responses

- `GET /api/owner/profile` and successful `PUT /api/owner/profile` responses add `hasPhoto: boolean` without returning an R2 key, public URL, or image bytes.
- The existing profile `PUT` continues to reject a `picture` field; photo bytes are accepted only by the dedicated photo endpoint.
- Successful owner profile saves persist canonical profile fields only; do not render or store a vCard in D1 as part of the save.
- `GET /api/owner/profile/vcard` generates a current card on request from profile fields in D1 and, when present, the optimized photo bytes in R2.
- The existing guest-link-scoped signed vCard URL generates the same current card, including its embedded photo, only while its associated guest link is active. No standalone guest photo URL is added.

## Storage and Consistency

- The R2 bucket is private and is bound to the API Worker. Do not enable public bucket access, custom domains, public object URLs, or presigned URLs.
- Bind Cloudflare Images to the API Worker for server-side resizing and encoding; use its local/offline mode in tests where possible. The account must have Images binding access enabled; confirm plan and binding availability before deployment. Wrangler's offline binding does not emulate all production quality and metadata behavior, so verify those properties with a deployment smoke test.
- Add a nullable photo object-key column to the existing single-row `owner_profile` table and remove the legacy rendered `vcard` column. Store only the key needed to retrieve or delete the current object; do not store the original filename or any image bytes in D1.
- Store only the optimized JPEG in R2, not the original upload. Build the base64 data URI in memory only while generating a vCard response; neither the base64 image nor the rendered vCard is persisted in D1.
- Generate object keys server-side; never derive them from client filenames or accept keys from clients.
- Replacing a photo must not discard the old photo until optimization succeeds, the new object is written, and the D1 photo reference is updated. If the D1 update fails, remove the newly written object and leave the old photo available. Do not return success unless the replacement works through both the owner preview and on-demand vCard endpoints.
- Removing a photo clears its D1 reference and deletes the old R2 object. Handle partial failures without returning success for a stale profile reference.
- Owner photos are not subject to the 30-day guest-submission retention policy. They remain until replaced or explicitly removed.
- The base64 image data adds about one third to the binary image size. With the 75 KiB optimized-image cap, the generated vCard payload is at most 100 KiB of base64 image data before line folding and other fields; this size is held in Worker memory and in the HTTP response only, never in D1.
- A downloaded vCard contains a self-contained copy of the photo and cannot be remotely changed or revoked after download. Link revocation prevents future retrieval of the vCard but cannot retract copies already downloaded.

## Security and Privacy

- Enforce owner authorization before reading request bodies or accessing R2.
- Validate the media type against the file signature; do not trust the request header or extension alone.
- Enforce the 19 MiB source limit while reading the request stream so oversized bodies are rejected before being fully buffered or stored.
- Never trust browser-side resizing or compression as a substitute for server-side normalization.
- Fold the complete encoded `PHOTO` content line according to vCard 4.0 rules after base64 encoding, without changing the unfolded data URI or exceeding 75 octets per physical line.
- Do not reflect filenames, object keys, storage errors, or internal exception details in responses.
- Image responses must not be publicly cacheable or served from an unauthenticated route.
- Tests use generated synthetic image bytes only; never commit real photos or credentials.

## Acceptance Criteria

- Missing or invalid owner authorization receives `401` on upload, preview, and delete routes; unauthorized requests do not read or mutate R2 or D1.
- Upload before an owner profile exists returns the documented `404` and creates no R2 object.
- Valid JPEG, PNG, and WebP uploads succeed, are normalized to a metadata-free JPEG within the dimension and byte caps, are retrievable through the authorized preview endpoint, and set `hasPhoto` to `true` in owner profile responses.
- Generated owner and active-link vCards contain a `PHOTO` property with a `data:image/jpeg;base64,` URI whose decoded bytes exactly match the optimized R2 object; the line is correctly folded and unfolds to that exact URI.
- Owner-authorized and active-link signed vCard downloads include the embedded photo; no separate guest image route or public image URL is created.
- Updating profile text preserves the uploaded photo, and subsequent vCard downloads reflect both. Removing the photo removes the `PHOTO` property from subsequently generated vCards.
- A valid replacement becomes the current photo; a failed object write or D1 update leaves the prior photo intact and does not report success.
- Empty, oversized, unsupported, mismatched, malformed, animated, SVG, and uncompressible uploads are safely rejected without changing the current photo or vCard.
- Preview returns the optimized JPEG bytes with the required non-cacheable, no-sniff headers; missing photos return the documented `404`.
- Delete removes the current photo, clears profile metadata, and is idempotent. Repeated deletion does not fail or expose storage details.
- The bucket is private and no endpoint returns a public URL, R2 key, or unauthenticated access to the photo.
- Photo handling does not change existing profile required-field validation. Profiles without photos retain the current vCard output. D1 contains no rendered vCard, binary photo bytes, or base64 photo data.
- Automated tests cover authorization, profile absence, each supported media type, source/output size limits, normalization, metadata removal, vCard PHOTO data decoding and folding, replacement, deletion, response headers, and simulated Images/R2/D1 failures using local Workers bindings only. Add a deployment smoke test for actual binding transformations if local mode does not implement quality or metadata options.
- A local `.http` example demonstrates upload, preview, and removal with synthetic data and credentials supplied from ignored local configuration.
- Type checking, the API test suite, and production builds pass.

## Verification

Run focused owner-photo API tests, then the repository type-check, test, and build commands. Exercise upload, preview, replacement, and removal against local D1 and R2 bindings using generated test images. Confirm that an oversized source is reduced to the output caps, metadata is stripped, generated vCards contain exactly the matching base64 photo data, no photo or vCard content is persisted in D1, link deletion or consumption blocks later signed-vCard retrieval, and no standalone image object is publicly reachable. Validate vCard photo imports with current iOS and Android contact apps before release.
