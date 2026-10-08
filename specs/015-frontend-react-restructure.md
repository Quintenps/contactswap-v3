# 015: Frontend React Restructure

## Status

Proposed

## Goal

Make the React frontend easier to read, test, and maintain by replacing the large, multi-purpose `App.tsx` with route-level pages and focused, reusable modules. Use React Router for client-side navigation while preserving the current owner and guest workflows.

## Product Decisions

- This is a frontend maintainability change, not a change to ContactSwap's product behavior.
- ContactSwap remains a single-owner application with the existing owner profile, guest-link management, guest-submission, and guest form flows.
- The owner token continues to authorize owner API requests. Client-side routing is not an authorization boundary; the API remains responsible for enforcing owner access.
- Guest links remain single-use for successful submissions, link-scoped signed vCard URLs remain revocable bearer credentials, and guest submissions retain their existing 30-day retention.
- Required profile and submission fields, optional pictures, vCard 3.0 behavior, and all existing privacy protections remain unchanged.

## Scope

- Add React Router to the web application and define explicit routes for the existing pages.
- Split route-level UI and page-specific state/behavior out of `App.tsx`.
- Extract shared API access, data types, validation, and small presentation components where doing so removes meaningful duplication.
- Update frontend tests to exercise routed pages and navigation.
- Keep the existing visual design and CSS unless a small adjustment is required to preserve the current layout or behavior.

## Out of Scope

- Changes to API routes, data models, D1/R2 storage, vCard generation, webhook behavior, token policy, link lifecycle, or retention.
- Adding multiple owners, guest accounts, a full authentication system, new product features, analytics, or a global state-management library.
- A visual redesign, component-library migration, or broad styling rewrite.
- Changing how long the owner token is persisted or otherwise changing authentication UX as part of this restructuring.

## Routing

Use React Router with browser-history routing. Preserve the existing URL paths:

| Path | Page | Access and behavior |
| --- | --- | --- |
| `/` | Owner profile | Keep the current token-entry, profile-load, edit, save, photo, and vCard-download behavior. |
| `/owner/links` | Guest-link management | Keep current owner authorization, link creation, copying, listing, and revocation behavior. |
| `/owner/submissions` | Guest submissions | Keep current owner authorization, privacy-minimized list, retry, and vCard-download behavior. |
| `/guest/:token` | Guest flow | Keep the link-scoped vCard download, optional guest form, validation, submission, and success/unavailable states. |

- Use router links for in-app navigation and expose the active owner navigation item accessibly.
- Read the guest token from the route parameter; do not put owner credentials, guest contact details, or signed vCard URL signatures into new routes or query parameters.
- Preserve useful loading, error, unauthorized, unavailable, and successful-submission states. Invalid or unknown frontend paths must resolve to a safe not-found or unavailable state, not display private data.
- Ensure direct navigation, refresh, and browser back/forward work for every frontend route in the deployed Cloudflare Pages application. Preserve API paths and responses; they are not frontend routes.

## Suggested Frontend Organization

The exact filenames may follow repository conventions, but organize around responsibilities rather than one large application component. For example:

```text
apps/web/src/
  app/
    App.tsx
    routes.tsx
  pages/
    OwnerProfilePage.tsx
    OwnerLinksPage.tsx
    OwnerSubmissionsPage.tsx
    GuestPage.tsx
    NotFoundPage.tsx
  components/
    OwnerLayout.tsx
    OwnerNavigation.tsx
  features/
    owner-profile/
    owner-links/
    owner-submissions/
    guest/
  lib/
    api/
    validation/
  types/
```

- Keep `main.tsx` as the application entry point and mount the router once at the app boundary.
- Keep route configuration and top-level composition small and easy to scan.
- Give each page responsibility for its own page-level behavior. Share an owner layout/navigation where it prevents duplicated markup without coupling unrelated page logic.
- Move API request and response handling into focused modules; validate untrusted API responses at the boundary and retain explicit user-facing error handling.
- Keep form validation and shared data types in reusable modules only where owner and guest flows genuinely share the same rules. Keep feature-specific behavior close to its page or feature.
- Keep transient state local to the page or feature that owns it. Add shared context only for state that multiple routes genuinely need; do not introduce a general-purpose state library for this refactor.
- Retain semantic HTML, responsive behavior, visible focus states, and existing accessibility labels and live feedback.

## Functional and Privacy Requirements

- Preserve all current page content, actions, request methods, API paths, authorization headers, cache behavior, response validation, and download behavior.
- A route change must not bypass owner token validation. Owner-only requests continue to be authorized by the API, and unauthorized responses continue to clear the active owner session and return to the token-entry experience.
- Do not embed secrets in frontend assets, log owner credentials, or put credentials in URLs. The token entered by the owner remains a request credential and must only be used for the existing owner API flow.
- Do not expose guest contact details in the guest-link list, routes, logs, or unrelated UI. Preserve the privacy-minimized submission list.
- Treat signed guest vCard URLs as bearer credentials: keep them within their intended guest-sharing flow and preserve existing referrer and no-store protections.
- Preserve guest-link single-use behavior, guest form required-field validation, optional picture behavior, and the thank-you state only after a successful card download. A failed post-submission card request remains retryable without resubmission.
- Do not change backend contracts or use route-level UI checks as a substitute for backend authorization.

## Acceptance Criteria

- `App.tsx` no longer owns the implementation of every page, all route matching, and all page-specific behavior; the top-level app and route definitions are concise and focused.
- React Router handles all existing frontend paths, including owner profile, owner links, owner submissions, and the guest token route.
- In-app navigation updates the URL without requiring a full page reload, and active owner navigation is correctly identified.
- Directly loading or refreshing each supported path renders the correct page in a production Cloudflare Pages deployment.
- Unknown paths and malformed guest paths show a safe unavailable or not-found state without exposing private information.
- Owner token entry, persistence, authorization failures, logout, and route restoration after successful authentication behave as before.
- All owner profile, link-management, submission-list/download, and guest submission/download behavior remains intact, including loading and error feedback.
- API authorization remains server-enforced; no secrets or guest personal data are added to browser bundles, URLs, or logs.
- Focused frontend tests cover the route table, direct rendering of each route, client-side navigation, and representative existing behaviors for owner authorization, profile actions, links, submissions, and guest flow.
- Type checking, frontend tests, and the production web build pass.

## Verification

Run the web application's type check, tests, and production build. Verify the four supported routes through both in-app navigation and direct page loads, including refresh and browser back/forward. Confirm tests still cover the existing authorization, validation, privacy, and success/error behavior after the code is split into modules.
