# 022: API README

## Status

Proposed

## Goal

Add a short, practical `apps/api/README.md` that reminds Quinten what the API Worker does and how its less-obvious operational pieces work, especially scheduled tasks.

## Scope

- Document the API's role in ContactSwap and its main owner and guest capabilities.
- Summarize the HTTP route groups and the Cloudflare bindings and secrets the Worker uses.
- Explain the scheduled handler, its cron interval, and the work it performs.
- Include the most useful local development, test, type-check, build, and deployment commands, with their working directory clear.
- Keep the README concise and consistent with the product brief, architecture documentation, Wrangler configuration, and current implementation.

## README Content

The README should be straightforward personal-use documentation, not a replacement for the product brief or full API specification. It should cover:

- **Purpose:** The API is the server-side Worker for ContactSwap's single owner, Quinten. It persists the owner's editable profile, creates and manages guest links, accepts guest submissions, and generates vCard 3.0 downloads.
- **Routes:** Summarize the health check, owner-authorized profile/link/submission routes, and guest link/submission/link-scoped vCard routes. Make clear that owner routes require the admin token and that guest vCard access is scoped to an active link.
- **Storage and configuration:** Identify D1 for profile, link, submission, and notification-outbox data; private R2 for optimized photos; and the image-processing binding. Explain that the admin token, link-signing key, and webhook URL are secrets, while the public app origin is non-secret configuration. Do not include actual secret values.
- **Scheduled work:** State that Wrangler invokes the Worker's scheduled handler every five minutes (`*/5 * * * *`). Each run deletes guest submission records and associated guest photos whose 48-hour retention deadline has passed, and processes up to ten due webhook notification outbox jobs. Successful notifications are removed from the outbox; failed deliveries are rescheduled with exponential backoff, capped at 24 hours between attempts. Notifications contain a summary, not guest contact details.
- **Photo cleanup distinction:** Explain that the scheduled cleanup removes associated expired guest photos and that the R2 lifecycle rule for the `guest-submissions/` prefix provides an asynchronous safeguard for any remaining objects. The lifecycle rule must not cover owner photos.
- **Local development and checks:** Point to the existing local secret setup and request examples. Include only current commands and explain whether they run from the repository root or `apps/api`; do not suggest using production credentials locally.
- **Deployment reminder:** Mention that the API deploys separately from the Pages frontend and relies on configured Cloudflare resources and Worker Secrets. Refer to the repository README for the full setup sequence rather than duplicating it.

## Out of Scope

- Changes to API behavior, Worker bindings, cron configuration, retention, notification delivery, or storage lifecycle rules.
- A complete endpoint reference, OpenAPI specification, tutorial, or replacement for repository-level development and deployment documentation.
- Changes to the product brief, architecture, or existing README files.

## Acceptance Criteria

- `apps/api/README.md` exists and gives a concise, accurate overview of the API's purpose and main capabilities.
- It explains the five-minute scheduled invocation, 48-hour D1 submission and guest-photo cleanup, bounded outbox batch processing, retry backoff, and the R2 guest-photo lifecycle safeguard.
- It distinguishes owner-authorized routes from guest routes and describes the API's main Cloudflare bindings and secret configuration without exposing credentials.
- Local commands and setup references match existing project scripts and documentation; their working directory is unambiguous.
- It remains a reminder for the API maintainer and does not duplicate extensive product or deployment documentation.
