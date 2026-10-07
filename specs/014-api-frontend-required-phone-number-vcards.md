# 014: API and Frontend - Required Phone Numbers in Contact Profiles and vCards

## Status

Proposed

## Goal

Ensure every owner and guest vCard contains the contact's phone number so a downloaded card can match an existing contact on the recipient's phone.

## Product Decision

- Phone number is required in both the owner profile and guest submission.
- Phone numbers use international E.164 format: a leading `+` followed by 2 to 15 digits, with the first digit after `+` nonzero (for example, `+31600000000`).
- Dutch-facing phone guidance and examples use the `+31` country code; the API continues accepting any valid international E.164 number.
- The API validates the E.164 representation but does not verify that a number is assigned, reachable, or controlled by the submitter.
- Every generated owner and guest vCard 3.0 includes the corresponding number in a `TEL` property.
- This is a pre-production change. There are no legacy production profiles or submissions to backfill.

## Scope

- Add the required phone field to the owner profile and guest submission data models and D1 schemas.
- Validate and persist phone numbers through the owner profile and guest submission APIs.
- Include the phone number in owner profile JSON and authorized guest-submission detail responses. Keep the submission list response privacy-minimized and unchanged.
- Render the corresponding phone number as a preferred cell/voice vCard 3.0 `TEL` property for owner and guest cards.
- Add required phone inputs and clear E.164 guidance to the owner profile and guest submission forms.
- Update local API examples, synthetic test fixtures, and focused tests.

## Out of Scope

- SMS, phone ownership verification, click-to-call, or phone-number lookup.
- Multiple phone numbers, phone labels, or a default-country selector.
- Changes to guest-link lifecycle, retention, webhook behavior, owner authentication, or photo handling.
- Phone collection in webhook notifications or privacy-minimized submission list responses.

## Data and Validation

- Add a non-null `phone` field to the owner profile and guest submission records.
- Keep D1 as the canonical source for the phone number; do not duplicate it in rendered vCard storage or other tables.
- Trim surrounding whitespace before validation. Accept only the E.164 representation defined above; reject spaces, punctuation, a missing country code, an empty value, and values longer than 15 digits (excluding the leading `+`).
- Owner profile JSON read and write operations include `phone`. Guest multipart submissions require a `phone` field.
- The API remains authoritative. Invalid or missing phone values return the existing safe `400` validation response, do not persist a partial profile/submission, and do not consume a guest link.
- Update fresh-install migrations and local D1/test setup so every required profile and submission record has a valid phone value. No legacy-data backfill is needed before production.

## vCard Behavior

- Generate the owner's current vCard from the canonical owner profile, including its phone, for both the owner-authorized download and an active link-scoped guest download.
- Generate each guest vCard from that guest's stored submission, including that guest's phone.
- Encode the international number as a vCard 3.0 text telephone value, for example `TEL;TYPE=CELL,VOICE,PREF:+31600000000`; do not use a URI value or `tel:` prefix.
- Preserve vCard 3.0 escaping, line folding, binary photo embedding, response headers, access controls, and no-store/referrer protections. Name each downloaded card using a sanitized `firstname-lastname.vcf` filename derived from that card's name.
- Never return a successful vCard response that omits `TEL` or substitutes a phone number from another record.

## Frontend Behavior

- Show a required phone field on the owner profile form and guest submission form. Use a telephone-appropriate input and visible guidance to include the Dutch `+31` country code, with an example such as `+31600000000`.
- Do not infer a country code or silently rewrite an invalid number. Preserve entered values after validation or recoverable service errors.
- Show field-level validation feedback where practical. A guest with invalid data can correct and retry; the guest link is consumed only after a valid successful submission.
- Do not display the phone number in submission list rows, webhook notifications, URLs, analytics, or logs.

## Acceptance Criteria

- An owner cannot create or update a profile without a valid E.164 phone number; an authorized profile read returns the saved phone number.
- A guest submission without a valid E.164 phone number is rejected with the existing safe validation response, creates no guest record, sends no webhook, and leaves the link usable.
- Valid owner and guest phone numbers are persisted exactly in E.164 representation and returned only through the already authorized profile or submission detail flows.
- The privacy-minimized guest submission list continues to return only its documented fields and does not expose phone numbers.
- Every owner vCard (owner-authorized and active guest-link scoped) includes the owner's matching preferred cell/voice `TEL` property.
- Every authorized guest-submission vCard includes the selected guest's matching preferred cell/voice `TEL` property.
- vCards remain valid vCard 3.0 files with existing escaping, folding, optional photo, filename, response-header, authorization, cache-control, and referrer behavior unchanged.
- Neither webhook payloads nor application logs contain phone numbers.
- Focused API tests cover valid and invalid profile phone values, valid and invalid guest phone values, persistence, guest-link non-consumption for rejected input, owner and guest vCard telephone properties, and privacy-minimized list/webhook behavior.
- Focused frontend tests cover required phone controls, E.164 guidance, validation feedback, preserving values on errors, and successful submission with a valid number.
- Local `.http` examples and synthetic test fixtures use valid non-personal E.164-formatted example values with the Dutch `+31` country code.
- Type checking, the relevant test suites, and production builds pass.

## Verification

Run focused API and frontend tests, repository type checking, and production builds. Exercise local owner profile save/read/download and guest submission/download flows with synthetic numbers. Confirm every generated owner and guest vCard contains the correct `TEL` value and that invalid input neither persists nor consumes a link.
