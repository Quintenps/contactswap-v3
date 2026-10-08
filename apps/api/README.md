# ContactSwap API

This Cloudflare Worker is the server-side API for ContactSwap, Quinten's single-owner contact-sharing app. It stores the owner's editable profile, manages one-time guest links, accepts guest contact submissions, and generates vCard 3.0 downloads.

## Routes

- `GET /api/health` — public health check.
- `/api/owner/...` — owner profile, links, and submissions. Every owner route requires the `ADMIN_TOKEN`.
- `/api/guest/...` — guest link resolution and submission, plus link-scoped owner photo and vCard delivery. Signed vCard URLs work only while their guest link is active.

The route handlers are grouped under [`src/routes/`](src/routes/); the Worker and scheduled entry point are in [`src/index.ts`](src/index.ts).

## Cloudflare resources

- **D1 (`DB`)** stores the owner profile, guest links and submissions, and pending webhook notifications.
- **Private R2 (`PHOTOS`)** stores optimized owner and guest photos. Do not enable public access.
- **Images (`IMAGES`)** processes uploaded photos.
- **Worker Secrets:** `ADMIN_TOKEN`, `LINK_SIGNING_KEY`, and `WEBHOOK_URL`.
- **Non-secret variable:** `PUBLIC_APP_ORIGIN`, used to create absolute guest links.

For local development, create `apps/api/.env` from [`.env.example`](.env.example) and use local-only values. Do not use production secrets locally or commit `.env`. The repository [README](../../README.md) has the complete local setup and Cloudflare configuration steps.

## Scheduled work

Wrangler runs the Worker's scheduled handler every five minutes (`*/5 * * * *`), as configured in [`wrangler.jsonc`](wrangler.jsonc). The handler in [`src/scheduled.ts`](src/scheduled.ts):

1. Deletes D1 guest submissions past their 30-day retention deadline.
2. Processes up to ten due webhook notification jobs. Successful deliveries are removed from the outbox; failures are retried with exponential backoff, capped at 24 hours between attempts. Notifications contain a summary, not guest contact details.

Guest photo files are **not** removed by the D1 cleanup. R2 expires them separately through the lifecycle rule for the `guest-submissions/` prefix. Keep that rule scoped to guest photos; owner photos must be retained.

## Local development and checks

From the repository root:

```sh
npm run dev --workspace @contactswap/api
CI=1 npm run migrate:local
npm run typecheck --workspace @contactswap/api
npm test --workspace @contactswap/api
npm run build --workspace @contactswap/api
```

The Worker listens on `http://127.0.0.1:8787`. The migration command explicitly applies migrations to local D1. Local HTTP request examples are in [`requests/`](requests/).

## Deployment

The API Worker deploys independently of the Cloudflare Pages frontend. Deployment requires the configured Cloudflare D1 database, private R2 bucket and Worker Secrets. From the repository root, deploy with:

```sh
npm run deploy --workspace @contactswap/api
```

Follow the repository [README](../../README.md) for resource setup, secret configuration, guest-photo lifecycle setup, and frontend deployment.
