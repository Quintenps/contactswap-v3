# 018: Change Generated vCards to Version 3.0

## Status

Implemented; device import verification pending

## Goal

Generate vCard 3.0 files for all ContactSwap downloads so phone numbers and optional profile photos import correctly in the target contact apps, including iOS and Android.

## Product Decision

- vCard 3.0 replaces vCard 4.0 as the required generated contact-file format.
- This decision supersedes earlier vCard 4.0 requirements in the product brief, architecture, and feature specifications. Update those documents as part of implementation so they describe vCard 3.0 consistently.
- This changes only the generated file format. It does not change profile or submission data, required fields, link behavior, authorization, retention, privacy protections, or filenames.
- Verify imports with current iOS and Android contact apps; do not assume format selection alone guarantees identical behavior across devices or import paths.

## Scope

- Generate the owner's current vCard 3.0 for the owner-authorized download and active guest-link signed URL.
- Generate vCard 3.0 files for owner-authorized guest-submission downloads.
- Use vCard 3.0-compatible telephone and photo property syntax.
- Update response `Content-Type` headers and any API or local request examples that specify the vCard version.
- Update focused API tests and any affected documentation and synthetic fixtures.

## Out of Scope

- Changes to owner or guest profile fields, validation, persistence, or user interfaces.
- Changes to how profile photos are uploaded, optimized, stored, or served in the guest landing-page preview.
- Changes to authorization, signed-URL lifecycle, link consumption, retention, download filenames, or webhook behavior.
- Persisting generated vCards, image bytes, or base64 data in D1.
- Guaranteeing import behavior for every contacts application or device.

## vCard Behavior

- Render every owner and guest card with `VERSION:3.0`.
- Preserve the existing card properties and source values: formatted and structured name, email, telephone, birthday, address, and optional photo.
- Escape property text and fold content lines according to vCard 3.0 and its required text encoding. Preserve valid CRLF-delimited output and UTF-8 handling.
- Render the required E.164 phone number as a vCard 3.0 text telephone value with cell, voice, and preferred types. For example:
  `TEL;TYPE=CELL,VOICE,PREF:+31600000000`
- Do not use vCard 4.0 URI telephone syntax such as `VALUE=uri` or a `tel:` URI value.
- When a photo is present, embed its base64-encoded JPEG bytes using vCard 3.0 binary-photo syntax, for example:
  `PHOTO;ENCODING=b;TYPE=JPEG:<base64-data>`
- Do not encode the photo as a vCard 4.0 data URI. Omit the `PHOTO` property when no photo is present.
- Return downloads with `Content-Type: text/vcard; version=3.0; charset=utf-8`, retaining the existing attachment filename, cache-control, and access-control behavior.
- Generate cards from the canonical profile or submission data at request time. The owner's photo bytes continue to come from private R2 when present; do not persist rendered cards or photo data in D1.

## API and Privacy Requirements

- Apply the format consistently to owner profile downloads, active guest-link signed downloads of the owner's card, and owner downloads of guest-submission cards.
- Preserve existing owner authorization and guest-link validation. A signed URL remains scoped to its active link and is revoked when that link is deleted or consumed.
- Continue returning `Cache-Control: no-store` for vCard responses. Do not log vCard contents, photo data, contact details, authorization credentials, or signed URL signatures.
- Keep current sanitized `firstname-lastname.vcf` filenames and do not expose guest contact details outside the existing authorized download flow.
- Continue generating the owner's card from D1 fields and the optional private R2 photo; do not add vCard or image-data columns, tables, or storage.

## Acceptance Criteria

- Every successful owner-profile vCard response has `VERSION:3.0`, the vCard 3.0 content type, and the existing sanitized attachment filename.
- Every successful active guest-link vCard response has `VERSION:3.0` and represents the owner's current saved fields and optional photo.
- Every successful guest-submission vCard response has `VERSION:3.0` and represents the selected guest's saved fields and optional photo.
- Each generated card contains its matching contact's phone number as a vCard 3.0 text `TEL` value with the preferred cell/voice types; it does not use vCard 4.0 URI syntax.
- When a photo exists, the card contains a decodable vCard 3.0 base64 JPEG `PHOTO` property. When no photo exists, the card remains valid and has no `PHOTO` property.
- Generated cards retain correct names, email, birthday, address, escaping, line folding, UTF-8 content, and CRLF-delimited output.
- All existing authorization, active-link validation and revocation, no-store headers, response filenames, and privacy protections continue to apply.
- No rendered vCard, base64 photo, or image bytes are stored in D1, and no schema migration is required solely to change the generated format.
- Focused API tests cover vCard version and content type for all download flows, required property values, optional photo encoding and omission, escaping and line folding, and unchanged access controls.
- Import representative synthetic owner and guest cards into current iOS and Android contact apps and verify that the telephone number and optional picture are present. Record any platform-specific limitation rather than claiming unverified compatibility.
- Update the product brief, architecture, relevant feature specifications, and API examples so they no longer require vCard 4.0.
- Type checking, the relevant API tests, and production builds pass.

## Verification

Run focused API tests, type checking, and the production build. Exercise the owner-authorized profile download, active signed guest-link download, and owner-authorized guest-submission download using synthetic data, with and without a photo. Check response headers and parsed vCard properties, then validate import of representative files in current iOS and Android contact apps.
