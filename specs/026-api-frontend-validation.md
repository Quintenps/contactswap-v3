# 026: API and Frontend - Immediate Form Validation

## Status

Implemented

## Goal

Help users correct invalid contact details while completing either form, without requiring a submission attempt, while keeping the API authoritative for all validation.

## Product Decisions

- Validate both the owner profile form and the guest submission form in the browser as the user completes each field, and validate the same rules again on the server.
- Keep validation simple and deterministic. Validate the entered representation; do not perform address lookup, email delivery checks, phone ownership checks, or other external verification.
- A birthday must be a real `YYYY-MM-DD` calendar date and must not be later than the current UTC date. Do not impose a minimum date or age.
- Limit contact text fields to 255 characters and email to 254 characters after trimming surrounding whitespace. Use the same character-counting rule in the browser and API.
- Reject control characters in text fields, including line breaks and NUL. Preserve international characters, spaces, and ordinary punctuation.
- Trim optional organization and title values too; treat values that are blank after trimming as unset.
- Continue applying existing required-field, email, and E.164 phone validation rules. Do not silently rewrite or infer user-entered values.

## Scope

- Add consistent immediate client-side validation to the owner profile editor and guest submission form.
- Apply the same validation rules to owner profile create/update requests and guest submission requests in the API.
- Return safe, field-specific validation information from the API so the frontend can show errors for server-rejected values.
- Add focused frontend and API tests for the rules, feedback timing, and failure behavior.

## Out of Scope

- Address lookup, country-specific postal-code or house-number formats, geocoding, or address normalization.
- Email confirmation, phone verification, age eligibility checks, or external validation services.
- Changes to required or optional fields, data retention, guest-link lifecycle, authorization, webhook contents, or vCard generation.
- Persisting form values in browser storage or adding analytics or other collection of validation data.

## Validation Rules

- Trim surrounding whitespace from required text fields before validation and persistence. Reject missing or blank values for first name, last name, email, street, city, postal code, country, birthday, and phone.
- Limit first name, last name, street, city, postal code, country, organization, and title to 255 characters after trimming. Limit email to 254 characters after trimming. Measure Unicode code points consistently in the browser and API.
- Reject control characters, including NUL, tabs, and line breaks, in text and email values before trimming. Do not reject international characters, spaces, or ordinary punctuation.
- Trim surrounding whitespace from email before applying the existing API email-format rule. Reject embedded whitespace and overlength values. Do not claim that the address exists or is reachable.
- Validate phone numbers using the existing E.164 rule: a leading `+`, 2 to 15 digits, and a nonzero first digit after `+`. Keep the number otherwise unchanged after trimming.
- Validate birthday as an actual calendar date in the exact `YYYY-MM-DD` representation. Reject impossible dates and dates after the current UTC calendar date; do not reject old dates solely because of their age.
- Trim optional organization and title values before validation and persistence. Store blank-after-trimming values as unset, and apply the same 255-character limit and control-character rejection when values are supplied.
- Do not add unapproved character, length, postal-code, or country-format restrictions. Preserve the existing field requirements and validation rules not changed by this spec.
- Apply equivalent validation to the owner profile JSON API and guest `multipart/form-data` submission API. Browser validation is for usability and never replaces server validation.

## Frontend Behavior

- Apply the same rules in both forms, including required fields, email, birthday, and phone.
- Enforce the 255-character limit for text fields and the 254-character limit for email in the browser, with matching limits in the API. Count Unicode code points rather than relying on native `maxlength` UTF-16 code-unit counting. Prevent additional input beyond each limit and provide clear feedback when a value is too long.
- Check text and email input for control characters, including pasted tabs or line breaks; explain the issue without discarding the user's other form values.
- Trim optional organization and title values consistently with the API and treat blank values as unset.
- Do not show validation errors for untouched, empty fields on initial render. Validate a field when it is blurred or changed; after it has been touched, update its feedback as the user edits it. A form submission attempt validates every field and displays all current field errors.
- Revalidate after each edit so corrected fields clear their errors without requiring another submit. Keep invalid values editable and do not silently transform them.
- Use native input semantics where appropriate, including email, telephone, and date controls. Set the birthday maximum consistently to the current UTC date. Ensure equivalent custom checks run even where browser-native validation differs.
- Show concise, field-level messages that explain how to correct the value. Associate each message with its input, expose invalid state accessibly, and announce newly displayed errors without moving focus unexpectedly.
- Preserve all entered values when client validation fails or when a recoverable API request fails. Do not store form values in browser storage.
- On server-side validation failure, map the returned field errors to the corresponding controls and preserve the form values. Do not show raw server details or submitted personal data in the error message.
- Keep existing successful save, guest submission, download retry, and thank-you behavior unchanged.

## API Behavior

- Run the complete validation before writing a profile or guest submission.
- For invalid input, return `400` using the existing safe validation error response shape, with machine-readable field errors keyed by the API field names. Include only stable field identifiers and safe validation codes/messages; do not echo rejected values.
- An invalid owner profile request must not partially create or update the profile.
- An invalid guest submission must not create a guest record, send a webhook, mark the link submitted, or consume the link. The guest may correct the form and retry.
- Preserve existing authorization checks, request formats, success responses, no-store behavior, webhook privacy, and link concurrency guarantees.
- Do not log form values, birthdays, email addresses, phone numbers, addresses, or request bodies when validation fails.

## Acceptance Criteria

- Both owner and guest forms show validation feedback while the user completes fields, before a form submission is attempted, and update or clear feedback as invalid values are corrected.
- Untouched empty fields do not show errors on initial render; a submit attempt validates all fields and identifies every invalid field.
- Invalid calendar dates, malformed date strings, and future birthdays are rejected by the frontend and API. A valid past birthday, including one before 1900, is accepted.
- Text values of 255 characters are accepted and values longer than 255 are rejected; email values of 254 characters are accepted only when they also satisfy the existing email rule, and longer values are rejected. Browser and API character counting agrees for international text.
- Control characters, including NUL, tabs, and line breaks, are rejected in text and email fields; international characters, spaces, and ordinary punctuation remain accepted.
- Email surrounding whitespace is trimmed before validation, embedded whitespace is rejected, and values are never echoed in validation errors.
- Optional organization and title values are trimmed, blank values are stored as unset, and supplied values follow the same length and control-character rules as other text fields.
- The owner profile API and guest submission API apply the same birthday rules, as well as their existing required-field, email, and E.164 rules.
- API validation errors identify affected fields without echoing submitted values or exposing internal details, and the frontend displays them against matching inputs.
- Invalid owner input does not change the saved profile. Invalid guest input does not persist a submission, send a webhook, or alter the link's submission or consumption state.
- User-entered values remain available after client validation errors and recoverable API errors; successful flows and optional fields retain their existing behavior.
- Validation works without address or contact verification services and does not add storage, logs, URLs, analytics, or webhook content containing submitted contact details.
- Focused API and frontend tests cover valid and invalid values, maximum lengths and Unicode character counting, control-character rejection, email whitespace handling, optional-field normalization, client feedback before submission, correction and error clearing, field-error mapping, persistence guarantees, and unchanged guest-link behavior.
- Type checking, relevant API and frontend tests, and production builds pass.

## Verification

Run focused API and frontend tests, then type checking and production builds. Exercise both forms with invalid and corrected birthday values, including values entered without submitting first. Exercise the corresponding API requests directly and verify invalid data is not persisted and does not change guest-link state or trigger a webhook.
