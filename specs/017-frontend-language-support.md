# 017: Frontend Language Support

## Status

Done

## Goal

Let ContactSwap's owner and guests use the frontend in Dutch or English, with Dutch as the default language.

## Product Decisions

- Dutch (`nl`) is the default language for visitors without a previously saved language choice. Do not infer the language from browser or device settings.
- Visitors can explicitly switch between Dutch and English (`en`).
- Remember the selected language in the current browser so it remains selected on later visits.
- Frontend copy should feel friendly and personal for friends and family: relaxed, direct, and clear rather than corporate. The audience is tech-savvy, but do not add jargon where plain language works.
- Language support changes frontend presentation only. It does not translate or modify contact data, vCard contents, API contracts, webhook notifications, or stored records.
- This is a presentation feature and does not change the single-owner model, guest flow, authorization, link lifecycle, required fields, or privacy protections.

## Scope

- Provide a language selector on all frontend routes, including owner pages, guest pages, login/token entry, success and error states, and not-found pages.
- Translate all frontend-authored user-facing text into Dutch and English. This includes navigation, headings, field labels, helper text, validation feedback, loading and empty states, confirmation and error messages, and accessibility labels and announcements.
- Show language-matched example placeholders in the guest form, including Dutch names, addresses, and a `+31` phone number.
- Format frontend-generated dates and times using the selected language's locale while preserving the underlying values and API data.
- Add focused tests for default language, switching, persistence, translation coverage, locale-aware formatting, and the existing owner and guest flows in both languages.

## Out of Scope

- Translating backend responses, webhook messages, vCard property values, user-entered contact data, or API request and response schemas.
- Adding languages beyond Dutch and English.
- Browser-language detection, region selection, or a language setting synchronized across devices.
- Changes to frontend routes, application behavior, authentication, server-side authorization, storage of contact data, or backend services.
- A visual redesign or changes to product copy beyond translation and minor adjustments needed for clear, equivalent translations.

## Language Selection and Persistence

- Use a subtle dropdown trigger showing a flag and language code. The menu shows flags alongside the languages' native names: `Nederlands` and `English`. Provide touch targets at least 44px tall and keep the control clear of page content on narrow screens.
- The selector is available without owner authentication and can be used throughout the guest flow, including after a successful submission.
- Changing the language updates the current page immediately without navigating away, reloading, or resetting form values, pending state, or guest-flow state.
- Store only the selected language code (`nl` or `en`) in browser local storage. Do not store contact data or credentials as part of this feature.
- On startup, use a valid saved language choice when present; otherwise use Dutch. If the stored value is unrecognized or unavailable, fall back to Dutch.
- Preserve the choice across route changes, page reloads, and later visits in the same browser. Do not send the preference to the API.

## Translation and Formatting

- Keep translations in a maintainable, type-checked frontend resource, reusing an existing project convention if one exists. Avoid a translation dependency unless implementation needs demonstrate it is necessary.
- Use stable message keys rather than duplicating translated strings across components. Both language resources must provide every required key; missing translations must be detected by type checking or automated tests rather than silently displaying a key or empty string.
- Translate all frontend-owned copy, including text shown for known API outcomes. Keep API behavior unchanged and map errors to safe, localized frontend messages; do not display raw response bodies, contact data, credentials, or server internals.
- Use locale-aware formatting for dates and times displayed by the frontend. Keep machine-readable form values, API payloads, phone numbers, and vCard data unchanged by the selected language.
- Keep phone-number validation unchanged: accept valid international E.164 numbers, and retain the existing Dutch `+31` example where used. Translate surrounding labels and guidance without implying that only Dutch numbers are accepted.
- Localize guest-form examples with the selected language, using realistic Dutch-format values in Dutch and English-format values in English. Keep examples out of submitted data unless the guest enters them.
- Use semantic controls, a visible focus state, and an accessible label for the language selector. Expose the selected language programmatically and announce language changes where appropriate.

## Functional and Privacy Requirements

- Owner and guest flows must behave the same in both languages, including route navigation, required-field validation, photo handling, API requests, authorization failures, link-scoped vCard access, downloads, and the thank-you state.
- Changing language must not clear or resubmit forms, change field values, trigger extra API requests, or expose data on routes where it was not previously available.
- Do not add language codes to URLs, API requests, logs, analytics, or server-side storage.
- Do not modify the owner token's storage or handling. The language preference is a separate, non-sensitive value and must never contain or be derived from credentials or contact data.
- Keep the selector usable on mobile and by keyboard and assistive technology.

## Acceptance Criteria

- A first-time visitor sees the frontend in Dutch regardless of browser language.
- The visitor can switch to English or Dutch from every supported route, including before owner authentication and throughout the guest success and error states.
- The selected language takes effect immediately without a page reload, lost form state, or unintended network request.
- A valid saved selection is restored after reload and on later visits in the same browser. Missing or invalid stored values result in Dutch.
- All frontend-authored visible text, form validation and feedback, and accessible labels/announcements are available in both languages; no missing key, untranslated frontend copy, or raw backend error is shown.
- Guest-form placeholders match the selected language, and switching languages preserves any entered values.
- Frontend-generated dates and times use the selected language's locale, while form values, API payloads, phone validation, and vCard contents remain unchanged.
- The language preference is the only new value persisted by this feature; it is not sent to the server or included in URLs.
- Owner authentication, profile editing, link management, submissions and downloads, guest submission, and error handling continue to work in both languages.
- Automated tests cover Dutch default behavior, language switching across routes, persistence and fallback, translated validation and service states, locale-aware date/time formatting, and representative owner and guest workflows.
- Web type checking, frontend tests, and the production build pass.

## Verification

Run the focused web tests, the web type check, and the production build. Exercise both languages on the owner profile, guest-link management, submissions, login/token entry, guest form, thank-you, error, and not-found states. Verify that switching language preserves in-progress state, local storage contains only the language code, and no language preference is sent to the API.

## Implementation Decision

Use a type-checked English message catalog and a Dutch catalog with the same keys; do not add a translation dependency. Mount the language provider above the router and keep the selector available independently of route and authentication state. Persist only `nl` or `en` under a dedicated local-storage key, store message keys in page state so existing feedback re-renders in the selected language, and format generated dates with `Intl.DateTimeFormat` for the selected locale.
