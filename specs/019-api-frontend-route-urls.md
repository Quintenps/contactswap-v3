# 019: API and Frontend Route URLs

## Status

Implemented

## Goal

Replace the frontend's existing owner and guest URL structure with a named owner area and short guest links:

- Owner pages use `/quinten` and `/quinten/...`.
- A guest link uses `/token/{token}` without a `/guest` prefix.
- `/` becomes a cheerful, animated welcome page without an owner-dashboard link.

## Product Decisions

- ContactSwap remains a single-owner application. The owner route name is a URL organization choice, not a new account or authorization mechanism.
- The owner profile page moves from `/` to `/quinten`. The owner link and submission pages move from `/owner/...` to `/quinten/...`.
- The root route `/` displays a cheerful welcome page without an owner-dashboard link. It does not load or expose owner or guest data, and its decorative animations respect reduced-motion preferences.
- Guest links use the existing opaque link token after the `/token` path prefix, for example `https://contactswap.quinten.dev/token/{token}`.
- The application is not yet in production. Supporting or redirecting the old `/guest/{token}` and `/owner/...` URLs is not required.
- Changing a page route does not change owner authorization, guest-link access, link lifecycle, or any API authorization boundary.

## Scope

- Update the frontend route table, owner navigation, links, and route-specific tests.
- Add a minimal welcome page at `/`.
- Route `/token/{token}` to the guest flow and preserve its existing loading, unavailable, submission, and success behavior.
- Update guest URL validation so the owner interface accepts the new root-level guest URL shape.
- Update the owner link-creation API to return an absolute guest URL with `/{token}` as its pathname.
- Update related product and architecture documentation to describe the active route structure.
- Keep frontend routes working for direct navigation, refresh, and browser history in Cloudflare Pages.

## Out of Scope

- Renaming, moving, or changing any `/api/...` endpoint.
- Changing the shape or authorization requirements of API requests and responses, except for the `guestUrl` pathname returned by `POST /api/owner/links`.
- Changing token generation, storage, link signing, link resolution, submission, consumption, revocation, or retention behavior.
- Changing owner-token storage, owner session behavior, or server-side authorization.
- Adding public profiles, guest discovery, guest accounts, multiple owners, or additional welcome-page features.
- Maintaining aliases or redirects for the previous frontend URLs.

## Frontend Routes

| Path | Page | Access and behavior |
| --- | --- | --- |
| `/` | Welcome page | Minimal generic content; does not make owner or guest API requests or display private data. Provides a clear path to `/quinten`. |
| `/quinten` | Owner profile | Preserve the existing token-entry, profile load/edit/save, photo, and vCard-download behavior. |
| `/quinten/links` | Guest-link management | Preserve existing owner authorization, link creation, copying, listing, and revocation behavior. |
| `/quinten/submissions` | Guest submissions | Preserve existing owner authorization, privacy-minimized list, retry, and vCard-download behavior. |
| `/token/{token}` | Guest flow | Resolve the token and preserve the existing vCard, optional submission, validation, unavailable, and thank-you behavior. |
| Other paths | Not-found page | Show a safe not-found state without loading private data. |

- Match the `/token/{token}` guest route as a distinct route namespace; do not interpret arbitrary one-segment paths as guest tokens.
- Use the token from the guest route as the existing API link token; do not put tokens in query strings or add new credentials to URLs.
- Encode the token as a path component when calling guest API endpoints.
- Update owner navigation targets and active-route behavior to the `/quinten/...` paths.
- The route path itself is not an authorization boundary. Owner API requests remain authorized by the existing token and server middleware.

## API Contract

### `POST /api/owner/links`

- Keep the endpoint, request, response shape, authorization, and status behavior unchanged.
- Continue returning the absolute shareable URL in the `guestUrl` field.
- Construct `guestUrl` using the configured `PUBLIC_APP_ORIGIN` and the path `/token/{token}`. Do not include `/guest/`, query parameters, or fragments.
- Continue returning the guest token only to the authorized owner and do not log it.

The guest-facing API paths remain unchanged:

- `GET /api/guest/links/{token}`
- `POST /api/guest/links/{token}/submissions`
- `GET /api/guest/vcard/{linkId}/{signature}`
- `GET /api/guest/profile-photo/{linkId}/{signature}`

The frontend continues to use these same-origin API endpoints. The guest page URL is distinct from these API resource paths.

## Privacy and Behavior Requirements

- Preserve owner API authorization and all existing guest-link validation and single-use behavior.
- The welcome page must not request owner profile, link, or submission data, nor resolve a guest token.
- Do not expose owner tokens, guest contact data, or signed vCard URL signatures in page URLs, query parameters, or logs.
- Preserve existing no-store and referrer protections for sensitive guest responses.
- Keep the generated guest URL as a bearer credential visible only in the authorized owner link-creation flow.
- Do not treat route-level checks as a substitute for API authorization.

## Acceptance Criteria

- `/` renders a cheerful welcome page with no link or button to the owner dashboard, and makes no owner or guest API calls.
- Welcome-page animations are decorative, do not interfere with reading or navigation, and are disabled when reduced motion is requested.
- `/quinten` renders the existing owner profile and preserves token entry, session restoration, authorization failure, logout, and profile actions.
- `/quinten/links` and `/quinten/submissions` render their existing pages, and owner navigation points to and identifies the active `/quinten/...` route.
- `/token/{token}` renders the guest flow and sends the same token to the unchanged guest API endpoints.
- The guest URL returned by `POST /api/owner/links` is absolute, has exactly `/token/{token}` as its pathname, and has no query or fragment.
- Generated guest URLs resolve to the guest flow in local development and when directly loaded or refreshed on Cloudflare Pages.
- Unknown paths render a safe not-found state without exposing private data.
- The former `/guest/{token}` and `/owner/...` paths are not required to work or redirect.
- API authorization, request/response behavior outside the generated guest URL path, guest link lifecycle, privacy protections, and all existing owner and guest workflows remain unchanged.
- Focused frontend tests cover all route cases, owner navigation, welcome-page isolation, unknown paths, and guest API calls using a root-level token.
- Focused API tests verify the new generated guest URL path and preserve authorization and response-header coverage.
- Type checking, the relevant frontend and API tests, and production builds pass.

## Verification

Run the focused web and API tests, type checking, and production builds. Verify link creation returns the expected absolute `/token/{token}` URL, open that URL directly through the deployed Pages routing behavior, and exercise owner navigation and guest resolution without changing the `/api/...` paths.
