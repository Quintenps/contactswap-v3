# 027: API and Frontend - Form Value Normalization

## Status

Implemented

## Goal

Store consistently cased names and address values submitted through the owner profile and guest contact forms, regardless of whether a request comes from the browser forms or directly from the API.

## Product Decisions

- Normalize first name, last name, street, and city to title case when either form is submitted.
- Convert postal codes to uppercase when either form is submitted.
- Apply the same normalization in the API before persisting owner profile updates or guest submissions. Browser-side normalization is for a consistent submission experience and does not replace server-side enforcement.
- Preserve all existing required-field, validation, trimming, persistence, and guest-link lifecycle behavior unless explicitly changed below.
- Do not retroactively rewrite existing database records. Values are normalized when a profile is created or updated, or a guest submission is accepted.

## Scope

- Normalize the owner profile form submission and owner profile create/update API requests.
- Normalize the guest submission form submission and guest multipart API requests.
- Persist normalized values and return the canonical normalized values in existing API responses.
- Add focused frontend and API tests for the normalization rules and their application to both form flows.

## Out of Scope

- Changing the set of required or optional fields, validation rules, API shapes, database schema, vCard structure, or link lifecycle.
- Normalizing email, country, birthday, phone, organization, title, or picture values beyond existing behavior.
- Address lookup, country-specific address or postal-code formatting, locale-specific name rules, or transliteration.
- Rewriting existing database rows as a migration or backfill.

## Normalization Rules

- Apply existing surrounding-whitespace trimming first.
- For `firstName`, `lastName`, `street`, and `city`, lowercase each whitespace-separated word and uppercase its first Unicode letter. Preserve whitespace, punctuation, and international letters; do not transliterate or infer missing text. For example, `JOHN DOE` becomes `John Doe`, and `MAIN STREET` becomes `Main Street`.
- Convert `postalCode` to uppercase. Preserve its digits, whitespace, and punctuation; do not apply country-specific format validation.
- Leave all other values subject only to their existing validation, trimming, and persistence behavior.
- Continue enforcing existing control-character and length rules. The normalized result must also satisfy the existing text-field length limits.

## Frontend Behavior

- Apply the rules to the owner profile editor and guest submission form immediately before building the request payload.
- Do not change values while the user is typing. Keep existing behavior for validation errors and recoverable request failures, including preserving entered form values.
- Submit normalized values to the existing API fields. Keep the existing successful save, guest submission, download retry, and thank-you behavior unchanged.

## API Behavior

- Apply the same normalization rules to owner profile create/update requests and guest multipart submission requests before persistence, including requests that bypass the browser forms.
- Persist only normalized values for the four name/address fields covered by this spec. Existing reads return the saved values without applying additional formatting.
- Preserve existing safe validation responses. If validation fails, do not partially update the owner profile, create a guest submission, send a webhook, mark a link submitted, or consume a link.
- Preserve authorization, webhook privacy, no-store behavior, and all existing submission and link concurrency guarantees.
- Do not log submitted contact values or request bodies.

## Acceptance Criteria

- Submitting `JOHN DOE` as a first or last name stores and returns `John Doe`; mixed-case input such as `jOhN dOE` is normalized the same way.
- Submitting `MAIN STREET` as a street or `NEW YORK` as a city stores and returns `Main Street` and `New York`, respectively.
- Alphabetic postal-code characters are uppercase after submission; for example, `sw1a 1aa` is stored as `SW1A 1AA`, with digits, spaces, and punctuation otherwise preserved.
- The owner form and API, and the guest form and API, all produce the same normalized values.
- Direct API requests cannot persist differently cased values for the fields covered by this spec.
- Email, country, birthday, phone, organization, and title retain their existing behavior and are not changed by these normalization rules.
- Existing validation still rejects invalid values without partially saving data or triggering guest-submission side effects.
- Existing records are not rewritten automatically; subsequent successful profile updates and guest submissions use normalized values.
