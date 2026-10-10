# 016: Frontend Styling

## Status

Proposed

## Goal

Refresh ContactSwap's visual style with a light, white-and-blue palette across the entire frontend. Make the guest experience feel warmer and more playful than a corporate form, including a small personal preview of the owner, while keeping it calm, readable, and easy to use on a phone.

## Product Decisions

- Apply the updated color palette throughout the app, including the owner login/session screens, owner profile, guest-link management, submissions, and guest flow.
- Focus the more playful visual treatment on the guest flow: its active-link landing page, form, loading state, thank-you state, unavailable-link state, and recoverable-error state.
- Make the guest landing page a clear download-first welcome, with a prominent owner contact-card hero and explicit copy that the downloaded vCard contains the owner's latest saved information.
- Keep owner-page layouts and workflows familiar; the owner pages receive the palette update, not a separate playful redesign.
- Keep the existing mobile-first, minimal, straightforward product experience. Playfulness must support clarity rather than compete with it.
- The styling work preserves existing behavior except for the explicitly scoped guest profile preview: an active guest link may show the owner's name and optional profile picture.
- The preview does not create a public profile, expose other owner contact fields, or weaken link access controls.

## Scope

- Replace the current green, muted-earth, and terracotta palette with a cohesive white-and-blue palette using shared design tokens.
- Apply the palette consistently to page backgrounds, panels, text, links, navigation, buttons, form controls, borders, focus indicators, hints, and feedback states.
- Use a bright white surface with a subtle pale-blue page background or wash, dark blue/navy text, and a clear blue accent for primary actions and active states.
- Add restrained, friendly details to guest pages, such as soft shapes, gentle color variation, or small decorative accents that complement the existing content and emoji. Keep the form itself uncluttered.
- On the guest landing page, show the owner's name and a large profile picture when available to make the experience personal and visually prominent. If no picture is available, show a large initials avatar.
- Obtain preview data only through the active guest-link flow. Include only the owner's display name and optional picture; do not expose email, address, birthday, or phone number in the preview.
- Preserve the guest flow's clear primary and secondary actions, including the visual priority of the owner's latest contact-card download.
- Keep layouts responsive and touch-first on narrow mobile screens, including Safari on iPhone and Chrome on Android.
- Update or add focused frontend tests where needed to protect key semantic and accessibility behavior affected by styling.

## Out of Scope

- Changing owner authentication, session persistence, authorization, or login behavior.
- Changing guest form fields, validation, submission, download behavior, error handling, or success behavior.
- Broad API, backend, or data-model changes, retention changes, link-lifecycle changes, or changes to vCard generation. The limited guest-preview API extension described in this spec is in scope.
- Redesigning owner-page information architecture or introducing new product features.
- Adding a component library, design system dependency, analytics, or third-party assets.
- Adding elaborate illustrations, decorative motion, or visual effects that make the app heavier, slower, or harder to use.

## Visual Direction

- **Palette:** predominantly white surfaces and pale blue backgrounds, dark blue/navy text, and a saturated blue interaction color. Use semantic color tokens rather than scattered one-off values so the palette stays consistent across shared components and states.
- **Guest personality:** friendly, human, and lightly playful rather than corporate. Use small decorative touches and the existing friendly tone; keep the guest form visually calm and easy to scan.
- **Guest welcome:** replace the generic “Stay in touch” introduction with personal, direct copy such as “Here's my contact card” and “Download my latest details and save them to your contacts.” Lead with the owner's large photo/avatar and name in a prominent card.
- **Download and reciprocity:** label the main action **Download my card & share your details** so it clearly invites both actions. Explain immediately that it opens an optional guest form, and that the guest's details are not shared unless the guest submits the form. Keep the download-only choice available as the secondary action.
- **Owner interface:** apply the same palette to the existing owner screens and shared navigation, but preserve their current layout density and straightforward utility.
- **Hierarchy:** preserve clear headings, readable supporting text, and unmistakable primary, secondary, disabled, loading, success, and error states.
- **Restraint:** maintain generous whitespace, simple surfaces, and decoration that does not obscure form content or actions. Avoid low-contrast pastel text and excessive gradients or motion.

## Accessibility and Responsive Requirements

- Maintain semantic HTML, visible keyboard focus, associated labels, accessible error/status announcements, and reduced-motion support.
- Ensure normal text meets at least 4.5:1 contrast, large text at least 3:1, and important control boundaries and focus indicators remain clearly visible against adjacent colors.
- Do not rely on color alone to communicate active navigation, validation, errors, or success; preserve text, icons, and other existing state cues.
- Keep controls comfortable to use by touch and prevent horizontal overflow at 320px viewport width and above.
- Respect `prefers-reduced-motion`; any new motion must be nonessential and disabled or reduced when requested.

## Functional, Privacy, and Security Requirements

- Preserve the existing owner session flow, including token entry, loading and error feedback, logout, and unauthorized-session handling.
- Preserve the guest flow, including active-link resolution, both download choices, explicit form submission before the combined card download, validation, recoverable errors, unavailable-link handling, and the thank-you state only after a successful card response.
- Extend guest-link resolution only as needed to provide the active-link owner's display name and an optional link-scoped profile-picture resource. Require the link to remain active when serving the picture, and return no-store responses.
- Do not expose additional owner profile fields, make the private R2 photo publicly addressable, or put photo bytes/base64 data into persistent storage.
- Do not change the single-use link behavior or 48-hour retention. Guest submissions still require name, email, address, birthday, and an international E.164 phone number; picture remains optional. Preserve vCard 3.0 behavior.
- Do not add tracking, third-party assets, or requests that could expose guest tokens, signed vCard URLs, owner credentials, or personal contact data.
- Keep guest form values out of browser storage and URLs; keep signed vCard URL handling and referrer protections unchanged.
- Styling and client-side route state must not be treated as an authorization boundary.

## Acceptance Criteria

- The whole app consistently uses a white-and-blue palette, including owner login/session, profile, links, submissions, and guest pages.
- The guest landing, form, and state screens feel more welcoming and lightly playful while remaining simple, readable, and form-focused.
- The active guest landing page displays the owner's name and, when set, profile picture; otherwise it displays a simple initials avatar.
- The guest landing page replaces “Stay in touch” with personal, download-focused copy and presents the owner in a prominent card with a larger photo/avatar and name.
- The main CTA clearly invites the guest to download the owner's card and share their details, and explains its existing combined behavior: it opens the optional form after downloading without submitting guest details. A clearly labeled secondary action remains available to download without opening the form.
- After the combined action opens the form, hide the owner-card and download-choice panels so the guest can focus on filling it in. Closing the form restores the welcome view.
- Guest preview information is limited to name and optional picture, is available only through an active guest link, and becomes unavailable when that link is deleted or consumed.
- The guest primary action remains visually dominant over the download-only secondary action; styling does not change either action's behavior.
- Owner pages retain their existing structure and workflows, with the palette update applied consistently to shared and page-specific UI.
- Text and interactive elements meet the contrast thresholds in this spec; focus indicators and validation/status cues remain visible and are not conveyed by color alone.
- The frontend remains usable without horizontal overflow on mobile widths, with visible keyboard focus and reduced-motion behavior intact.
- Existing owner and guest behavior remains unchanged apart from the specified guest preview and its visual presentation; privacy protections remain intact and the API change is limited to serving that preview through the active-link flow.
- Focused frontend tests, the web application's type check, the frontend test suite, and the production web build pass.

## Verification

- Review the palette on every existing owner and guest route, including loading, disabled, success, unavailable, and error states.
- Check layouts at 320px mobile width and a desktop viewport; verify text, controls, active navigation, validation messages, and focus indicators against their backgrounds.
- Verify keyboard navigation, form labels and feedback, and reduced-motion behavior.
- Run the web application's type check, frontend and API tests, and production build. Confirm route, authentication, form, download, and submission behavior remains unchanged and test preview access for active, deleted, consumed, and picture-less links.

## Self-Review

- Scope is resolved: the palette applies across the app, while added playful styling is focused on the guest flow.
- The visual direction supports the requested white/blue preference without locking implementation to arbitrary hex values or requiring new assets.
- The spec protects the existing primary/secondary guest actions, owner workflows, accessibility, and privacy. Its one functional addition is explicitly limited to an active-link name/photo preview.
- The contrast, small-screen, and reduced-motion criteria make the visual direction testable rather than relying only on subjective terms such as “playful.”
