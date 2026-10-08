# 025: API and Frontend - Split Name and Address Fields

## Status

Implemented

## Goal

Collect first and last names and structured address components separately for the owner profile and guest submissions, and render those components in the correct vCard 3.0 order with the required delimiters.

## Product Decisions

- Replace the single required `name` value with required `firstName` and `lastName` values for new and updated owner profiles and guest submissions.
- Replace the single required `address` value with required `street`, `city`, `postalCode`, and `country` values for new and updated owner profiles and guest submissions.
- Keep email, birthday, E.164 phone number, optional picture, optional organization, and optional title behavior unchanged.
- Keep D1 as the source of truth for the owner profile and guest submissions. Generate vCards from the matching saved record; do not store rendered vCards.
- Use vCard 3.0 structured properties as defined by [RFC 2426](https://www.rfc-editor.org/rfc/rfc2426.html): `N` components are ordered Family Name, Given Name, Additional Names, Honorific Prefixes, and Honorific Suffixes; `ADR` components are ordered PO Box, Extended Address, Street, Locality, Region, Postal Code, and Country Name.
- Existing owner-profile and guest-submission data does not need to be preserved during this schema change. Affected tables may be dropped and recreated with the new schema; no legacy-data backfill is required.

## Scope

- Update owner profile and guest submission data models, D1 schema, API validation, API request/response shapes, and vCard generation.
- Update both existing frontend forms—the owner profile editor and guest submission form—to collect the new required fields; changing only the API is not sufficient.
- Update owner and guest display names, guest-link preview names, and vCard filenames to use `firstName` and `lastName`.
- Replace the existing profile and guest-submission schema with the new fields. Existing rows may be discarded; no data migration is required.
- Update local API examples, synthetic fixtures, and focused API and frontend tests.

## Out of Scope

- Changes to email, birthday, phone, photo, organization, title, link lifecycle, authorization, retention, webhook behavior, or vCard version.
- Additional name components such as middle names, prefixes, or suffixes.
- Additional address components such as PO Box, extended address, or region/state.
- Country-code selection, country validation, address verification, or locale-specific formatting.
- Changes to the guest-submission list's privacy-minimized response.

## Data and API Behavior

- Store `firstName`, `lastName`, `street`, `city`, `postalCode`, and `country` as required canonical text fields for new or updated records. Use the repository's established database naming convention for corresponding D1 columns.
- Trim surrounding whitespace before validation and persistence. Reject missing or blank required components with the existing safe validation response; do not partially save a profile or submission.
- Replace `name` and `address` with these fields in the owner profile read and write API contract. The profile response and write request include each of the six fields.
- Replace `name` and `address` with these fields in guest multipart submission requests and authorized guest-submission detail responses.
- Do not add these fields to guest-link responses except for the existing owner's display name, which is formatted from the saved `firstName` and `lastName`. Do not add them to submission list rows, webhook payloads, URLs, or logs.
- Use a consistently formatted display name made by joining non-empty `firstName` and `lastName` with one space. Use it in the active guest-link owner preview and wherever a human-readable contact name is shown.
- Derive the existing sanitized `firstname-lastname.vcf` download filename from the corresponding record's `firstName` and `lastName`.
- Invalid requests must not partially persist data, create a guest submission, send a webhook, or consume a guest link. Preserve all existing authorization and link-lifecycle behavior.

## Schema Reset

- No existing owner-profile or guest-submission rows need to survive this change. Do not add a parser or backfill for the legacy `name` and `address` values.
- Use the existing versioned D1 migration workflow to establish the new schema. The migration may drop and recreate the affected profile and guest-submission tables if that is the simplest safe approach.
- Discard any associated stored profile or guest photos when their records are discarded, so the reset does not leave orphaned personal data in R2.
- Preserve the existing link lifecycle, authorization, and retention behavior for data created under the new schema. The reset is not a change to ongoing single-use links or 30-day submission retention.
- Verify the resulting tables enforce the new required fields and that the migration is repeatable through the repository's normal local D1 setup.

## Frontend Behavior

- In the owner profile editor, replace the Name control with separate required First name and Last name controls, and replace Address with separate required Street, City, Postal code, and Country controls.
- Make the same six-control change in the guest submission form. Keep each component required for new submissions and provide a clear visible label for every control.
- Put Street, City, Postal code, and Country together in a dedicated Address section, separate from the other contact details, in both the owner profile editor and guest submission form.
- Prepopulate the Country control with `The Netherlands` when creating a new owner profile and when opening a new guest submission form. Keep the control editable; when loading an existing owner profile, show its saved country instead of replacing it with the default.
- Remove the old single Name and Address controls from both forms. Connect each new control to its corresponding API field so editing, validation, save, and submission flows use the split values end to end.
- Preserve entered values after validation or recoverable service errors and show field-level feedback for missing or invalid values.
- Do not silently combine, reorder, or infer user-entered components. Owner and guest forms submit each value in its own corresponding API field.
- Preserve the existing optional picture, Organization, and Title controls and all existing submission/download flow behavior.

## vCard 3.0 Behavior

- Generate `FN` by joining the saved first and last names with one space, then apply the existing vCard text escaping and line-folding behavior.
- Generate the required structured `N` property in RFC 2426 component order: family name first, given name second, then empty additional-name, prefix, and suffix components. Its shape is:
  `N:<lastName>;<firstName>;;;`
- Generate the required structured `ADR` property using the existing home-address type and RFC 2426 component order. Populate street, locality from `city`, postal code from `postalCode`, and country; leave PO Box, extended address, and region empty. Its shape is:
  `ADR;TYPE=HOME:;;<street>;<city>;;<postalCode>;<country>`
- Escape each component value before joining structured components. Literal semicolons, commas, backslashes, and line breaks in field values must be escaped according to vCard 3.0 text rules so they cannot introduce components or properties. Do not escape the structural semicolon separators.
- Preserve UTF-8 content, CRLF-delimited output, and vCard line folding. Do not allow submitted newlines to inject vCard properties.
- Apply the same name and address behavior to the owner-authorized profile vCard, the active guest-link vCard for the owner's current profile, and owner-authorized guest-submission vCards.
- Continue deriving the card from its matching canonical D1 record and optional photo in private R2. Preserve the existing vCard 3.0 version, response headers, filenames, no-store behavior, referrer protection, and authorization.

## Acceptance Criteria

- Owner profile creation and update require non-blank first name, last name, street, city, postal code, and country, and save/read each value independently.
- Guest submissions require the same six components. Invalid or missing values do not create a record, send a webhook, or consume the guest link.
- The owner profile editor and guest submission form each display the six separate required controls; neither form retains the old single Name or Address control, and both submit the component values through the matching API fields.
- Both forms group their four address controls under a dedicated Address section, separate from the remaining contact details.
- A new owner profile and a new guest submission form start with Country set to `The Netherlands`. The user can change the value, and loading an existing owner profile displays its saved country.
- Authorized guest-submission details return the saved component values, while submission list rows, guest-link metadata, and webhook payloads remain privacy-minimized.
- The guest-link preview displays the owner's joined first and last name and does not expose any address component.
- Every owner and guest vCard download uses the matching record's values in `FN`, `N`, and `ADR`; the `N` property orders last name before first name, and the `ADR` property places street, city, postal code, and country in the correct RFC-defined slots.
- Component values containing commas, semicolons, backslashes, CR/LF, non-ASCII characters, or long text are correctly escaped and folded without changing the intended component boundaries or injecting properties.
- The versioned D1 migration establishes the new profile and guest-submission schemas without attempting to preserve or parse old `name` and `address` data; dropping and recreating affected tables is permitted.
- Existing profile and guest vCard flows, optional photo embedding, filenames, response headers, authorization, link consumption, retention, and webhook privacy continue to behave as before.
- Focused API tests cover component validation, persistence, authorized responses, the new schema, all vCard generation paths, exact `N`/`ADR` delimiters and component positions, escaping, folding, and unchanged privacy behavior.
- Focused frontend tests cover the six required controls in both forms, dedicated address-section grouping, the default and editable Country value, loading a saved owner country, removal of the old single Name and Address controls, separate field submission, error preservation, and display-name rendering from the two name components.
- Local `.http` examples and synthetic fixtures use separate name and address values without real personal data.
- Type checking, relevant API and frontend tests, and production builds pass.

## Verification

Run focused API and frontend tests, type checking, and production builds. Exercise owner profile read, save, and download; guest submission, authorized detail, and vCard download; and guest-link preview using synthetic values. Parse generated vCards and assert the exact component order and delimiters for `N` and `ADR`, including escaped delimiter characters. Apply the schema migration using the normal local D1 workflow and verify that the new required fields are present.
