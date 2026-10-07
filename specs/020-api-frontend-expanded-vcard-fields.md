# 020: API and Frontend - Expanded vCard Fields

## Status

Implemented

## Goal

Allow Quinten and guests to optionally provide an organization and job title, and include those values in their generated vCard 3.0 files.

## Product Decisions

- Add an optional `org` field for an organization and an optional `title` field for a job title to both the owner profile and guest submissions.
- Present `org` as “Organization” and `title` as “Title” in the owner and guest forms.
- Keep the existing required fields unchanged: name, email, address, birthday, and E.164 phone number. Picture remains optional.
- Store the values as canonical profile or submission data. An absent, null, or blank optional value is normalized to no value and omitted from the vCard.
- Generate vCard 3.0 `ORG` and `TITLE` properties from the matching record. Do not alter vCard version, existing property behavior, or download flows.
- Do not expose these fields in guest-link previews, guest-submission list summaries, or webhook notifications.

## Scope

- Add nullable `org` and `title` fields to the owner profile and guest submission data models and D1 schema.
- Extend owner profile read and write APIs and authorized guest-submission detail responses to support both fields.
- Accept both fields optionally in guest multipart submissions and persist them with the guest record.
- Add optional Organization and Title inputs to the owner profile and guest submission forms.
- Render the fields in owner profile vCards, link-scoped owner vCards, and guest-submission vCards.
- Add migrations, update local API examples and synthetic fixtures, and add focused API and frontend tests.

## Out of Scope

- Making organization or title required, or changing validation of existing required fields.
- Changes to photo handling, guest-link lifecycle, owner authorization, submission retention, webhook behavior, or privacy-minimized list responses.
- Adding organization or title to the guest landing-page preview.
- Additional organization fields, department hierarchies, role taxonomies, or multiple titles.
- Changing vCard version, filenames, response headers, or storage of rendered vCards.

## Data and API Behavior

- Store `org` and `title` as nullable text fields for the single owner profile and each guest submission. Existing profiles and submissions receive no value for these fields; no backfill is required.
- The owner profile JSON read response includes `org` and `title`, using `null` when unset. The owner profile write request may omit either field, provide a string, or provide `null`; blank strings are trimmed and normalized to `null`.
- Guest multipart submissions may omit either field or provide an optional string. Trim surrounding whitespace and normalize blank strings to no value. Reject a supplied field with a non-string value or malformed multipart content using the existing safe validation behavior.
- The authorized guest-submission detail response includes `org` and `title`, using `null` when unset. The submission list response remains unchanged and must not include either field.
- Continue validating all existing required fields as specified in the product brief, including international E.164 phone numbers. Invalid requests must not partially persist data or consume a guest link.
- Do not include `org` or `title` in webhook payloads, guest-link responses, guest landing-page preview data, URLs, or logs.
- Keep D1 as the source of truth. Do not persist rendered vCards or duplicate these values in unrelated records.

## Frontend Behavior

- Add optional Organization and Title controls to both the owner profile form and guest submission form.
- Clearly present both controls as optional and preserve entered values after validation or recoverable service errors.
- Use plausible synthetic organization and job-title placeholders (for example, “Larkspur Creative Studio” and “Senior Product Designer”); placeholders are not submitted unless the user enters them.
- The owner can save or clear either field without affecting other profile values. The guest may submit with either or both fields omitted.
- Do not change the behavior or required status of existing fields, including the optional picture control.

## vCard Behavior

- Include a vCard 3.0 `ORG` property when the corresponding record has a non-empty `org` value, and a `TITLE` property when it has a non-empty `title` value.
- Apply this consistently to the owner-authorized profile download, the active guest-link signed download of the owner's current card, and owner-authorized guest-submission downloads.
- Render each property from the matching canonical owner profile or saved guest record; never use values from a different record or from an untrusted request at download time.
- Escape property values using the existing vCard text escaping and line-folding behavior. Preserve UTF-8 and CRLF-delimited output. Literal delimiter characters in values must not create unintended vCard components or properties.
- Omit an unset `ORG` or `TITLE` property rather than emitting an empty property.
- Preserve all existing properties, including formatted and structured name, email, telephone, birthday, address, and optional photo, as well as vCard 3.0 response headers, sanitized filenames, authorization, `Cache-Control: no-store`, and applicable referrer protections.

## Acceptance Criteria

- Owner profile creation and update succeed when `org` and `title` are omitted, null, blank, or valid strings, without weakening validation of required fields.
- An authorized owner profile read returns the saved `org` and `title`, represented as `null` when unset.
- A valid guest submission succeeds with neither, either, or both optional fields; saved values are available only through the authorized submission detail flow.
- Invalid required guest fields still prevent persistence and leave the guest link usable. The guest-link single-use behavior remains unchanged.
- Every owner vCard download path includes the saved `ORG` and `TITLE` values when present and omits either property when its value is unset.
- Every authorized guest-submission vCard includes that submission's saved `ORG` and `TITLE` values when present and omits either property when unset.
- Values containing vCard delimiters, line breaks, non-ASCII text, or long content are escaped, encoded, and folded without injecting unintended properties or corrupting the card.
- The guest-submission list response, guest-link preview, and webhook payload remain unchanged and do not expose organization or title values.
- Existing authorization, link validation and revocation, retention, photo behavior, filenames, response headers, and privacy protections continue to pass their tests.
- Migrations support existing profile and submission rows without requiring a backfill; no rendered vCard or duplicate field data is stored.
- Focused API tests cover persistence, null and blank normalization, invalid inputs, authorized profile/detail responses, all vCard generation paths, optional-property omission, escaping and line folding, and unchanged privacy controls.
- Focused frontend tests cover optional controls, save and clear behavior, omission during guest submission, and preserving values after recoverable errors.
- Local `.http` examples and synthetic fixtures demonstrate both fields without containing real personal data.
- Type checking, relevant API and frontend tests, and production builds pass.

## Verification

Run focused API and frontend tests, type checking, and production builds. Exercise owner profile read, save, clear, and download flows; guest submission with neither, either, and both optional fields; and authorized guest-submission detail and vCard downloads. Verify the generated vCards contain correctly escaped `ORG` and `TITLE` properties only when corresponding values are set, while all existing access controls and privacy-minimization behavior remain unchanged.
