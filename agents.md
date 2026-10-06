# ContactSwap

## Project

ContactSwap is a privacy-focused, single-owner contact collection application.

Quinten maintains a persisted contact profile and shares one-time links so friends and family can submit their own contact details. Quinten reviews submissions in the authorized owner interface and downloads them as vCard 4.0 files.

## Technology

- TypeScript
- Cloudflare Workers
- Cloudflare Pages
- Cloudflare D1
- Cloudflare R2 when object storage is required
- Web APIs where possible
- npm
- Wrangler

## Development principles

- Keep the architecture simple.
- Prefer Cloudflare platform primitives over additional infrastructure.
- Prefer TypeScript throughout the project.
- Avoid unnecessary dependencies.
- Keep frontend and backend boundaries clear.
- Do not introduce abstractions without a concrete need.
- Privacy and minimal data collection are core requirements.
- Never store data that isn't required for the application's functionality.
- Treat security and privacy requirements as functional requirements.
- Keep personal contact data protected and expose it only through the intended owner or guest flow.
- Never expose the owner token or webhook secret in client-side code or include guest contact details in webhook notifications.
- Treat link-scoped signed vCard URLs as bearer credentials; do not leak them outside their intended sharing flow or write their signatures to logs.
- Prefer Cloudflare free-tier services unless product needs require otherwise.

## Product boundaries

- The product is for one owner, Quinten; do not add multiple owners, guest accounts, public discovery, or unrelated account and analytics features.
- Each guest link supports guest submission and has a distinct signed URL for Quinten's current vCard 4.0; there is no public profile URL. The signed URL is valid only while its link is active and is revoked when that link is deleted or consumed.
- Owner and guest forms require name, email, address, and birthday. Picture is optional.
- Owner profile fields persist in D1 for direct editing; optional optimized photos are stored in private R2. Generate the current owner vCard 4.0 when requested from the D1 fields and optional R2 photo, embedding photo data as base64 in the response. Never store image bytes, base64 photo data, or rendered owner vCard text in D1. Guest submissions are stored and used to generate vCard 4.0 downloads for the owner.
- Guest submissions and associated stored files are retained for 30 days, then deleted.
- Guest links do not expire with age. The owner can delete them, and a link is removed after its first successful submission.
- A successful submission stores the guest record, sends a summary webhook notification, and shows a thank-you page.
- The admin token is configured as a Cloudflare Worker Secret on the API Worker and can be rotated there; no full account system is required.

## Agent workflow

When implementing a feature:

1. Read this file.
2. Read `docs/product.md`.
3. Read `docs/architecture.md` and the relevant feature specification in `specs/` if those documents exist.
4. Read any relevant skills and inspect the existing implementation.
5. Identify the applicable product decisions and acceptance criteria before changing code.
6. Implement the smallest change that satisfies them.
7. Run focused tests, the existing test suite, and type checking as applicable.
8. Review the implementation against the product brief and fix discovered issues.
9. Consider the feature complete only when its applicable acceptance criteria are satisfied.

## Requirements

`docs/product.md` is the source of truth for product behavior. Its final product decisions resolve any earlier conflicting descriptions in that document.

Do not invent requirements or broaden v1 scope. Preserve the single-owner model, guest-submission flow, required fields, 30-day retention, and single-use link behavior unless the product brief is explicitly revised.

If the final product decisions do not resolve an ambiguity or contradiction, stop and ask for clarification rather than making assumptions.

## Testing

Every feature should have appropriate automated tests.

At minimum:

- Type checking must pass.
- Existing tests must continue to pass.
- Add focused tests for changed business rules, especially required-field validation, single-use links, retention/deletion, access control, vCard generation, and webhook behavior when applicable.
- Test important API behavior at the integration boundary when practical.
- Before release, validate vCard 4.0 imports with current iOS and Android contact apps.

## Git

Keep changes focused.

Do not modify unrelated files.

Do not remove existing functionality unless the specification explicitly requires it.