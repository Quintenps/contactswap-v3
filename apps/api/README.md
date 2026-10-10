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
- **Images (`IMAGES`)** processes uploaded photos. This is a Worker binding in `wrangler.jsonc`, not a separate D1/R2 resource to create; review [Images pricing](https://developers.cloudflare.com/images/pricing/) because transformations are billed.
- **Worker Secrets:** `ADMIN_TOKEN`, `LINK_SIGNING_KEY`, and `WEBHOOK_URL`.
- **Non-secret variables:** `PUBLIC_APP_ORIGIN`, used to create absolute guest links and allow the production Pages origin through CORS, and `CORS_ALLOWED_ORIGIN_PATTERN`, which additionally allows matching browser origins.

For local development, create `apps/api/.env` from [`.env.example`](.env.example) and use local-only values. Do not use production secrets locally or commit `.env`. The repository [README](../../README.md) covers the combined local setup and Pages deployment.

The API's D1 and R2 bindings are declared in [`wrangler.jsonc`](wrangler.jsonc). D1 schema changes are versioned under [`migrations/`](migrations/). The complete desired R2 lifecycle rules are in [`infrastructure/r2-lifecycle.json`](infrastructure/r2-lifecycle.json); changing those rules with Wrangler replaces the bucket's full lifecycle configuration.

## Scheduled work

Wrangler runs the Worker's scheduled handler every five minutes (`*/5 * * * *`), as configured in [`wrangler.jsonc`](wrangler.jsonc). The handler in [`src/scheduled.ts`](src/scheduled.ts):

1. Deletes D1 guest submissions and associated guest photos after their 48-hour retention deadline.
2. Processes up to ten due webhook notification jobs. Successful deliveries are removed from the outbox; failures are retried with exponential backoff, capped at 24 hours between attempts. Notifications contain a summary, not guest contact details.

Expired guest photo files are removed by the scheduled cleanup. The R2 lifecycle rule for the `guest-submissions/` prefix is an additional 48-hour expiration safeguard; keep it scoped to guest photos so owner photos are retained.

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

## First-time production setup

These commands create resources in the Cloudflare account selected by Wrangler. Run them from the repository root and use the Wrangler version pinned in this workspace. They are one-time operations; do not repeat a create command if that resource already exists.

### 1. Authenticate and confirm the account

If Wrangler is not already authenticated, start its browser login using [Wrangler's login command](https://developers.cloudflare.com/workers/wrangler/commands/general/#login):

```sh
npm exec --workspace @contactswap/api -- wrangler login
```

Confirm the active account before creating anything:

```sh
npm exec --workspace @contactswap/api -- wrangler whoami
npm exec --workspace @contactswap/api -- wrangler d1 list
npm exec --workspace @contactswap/api -- wrangler r2 bucket list
```

If `whoami` shows the wrong account, stop and authenticate to the intended account before continuing. The D1 and R2 list commands help avoid accidentally creating duplicate resources.

### 2. Create the production D1 database

The current configuration uses `contactswap-local` and an all-zero database ID as placeholders. Create the production database with Wrangler's [D1 create command](https://developers.cloudflare.com/d1/wrangler-commands/#create):

```sh
npm exec --workspace @contactswap/api -- wrangler d1 create contactswap-production
```

Wrangler prints the database name and UUID. In [`wrangler.jsonc`](wrangler.jsonc), replace `contactswap-local` with `contactswap-production` and replace the all-zero `database_id` with the UUID Wrangler returned. Keep the binding name `DB` and `migrations_dir` set to `migrations`. Do not use `--update-config`; review and edit the checked-in configuration explicitly.

The current infrastructure spec does not select a D1 location or jurisdiction, so the command intentionally omits those optional flags. If you have data-residency requirements, decide them before creating the database and add the appropriate `--location` or `--jurisdiction` option; these settings should not be guessed.

### 3. Create the private R2 bucket

Create the bucket named in the existing `PHOTOS` binding with Wrangler's [R2 bucket create command](https://developers.cloudflare.com/workers/wrangler/commands/r2/#r2-bucket-create):

```sh
npm exec --workspace @contactswap/api -- wrangler r2 bucket create contactswap-photos
```

R2 buckets are private by default. Do not enable public access, a custom domain, or a browser CORS policy. The current infrastructure spec does not choose a bucket location, jurisdiction, or storage class, so this command leaves those options unset. Decide any residency or location requirement before creation rather than guessing.

### 4. Apply the D1 schema and R2 retention rule

Review the SQL files in [`migrations/`](migrations/), then apply them to the remote database explicitly:

```sh
npm run migrate:remote --workspace @contactswap/api
```

Wrangler prompts for confirmation. Check that the prompt identifies the intended production database before confirming.

The newly created R2 bucket has no existing lifecycle rules. Apply the checked-in 48-hour guest-photo expiration rule and verify it:

```sh
npm run infra:r2:lifecycle:apply --workspace @contactswap/api
npm run infra:r2:lifecycle:list --workspace @contactswap/api
```

The apply command replaces the bucket's complete lifecycle configuration. If you are applying this to a bucket that already has rules, list them first and preserve any required rules in [`infrastructure/r2-lifecycle.json`](infrastructure/r2-lifecycle.json) before applying. Confirm the enabled rule matches only `guest-submissions/`; owner photos must not expire. R2 processes lifecycle expiration asynchronously, typically within 24 hours; the five-minute scheduled cleanup removes expired guest photos at the application retention deadline.

Migration `0010_split_name_and_address_fields.sql` is intentionally destructive: it drops and recreates the owner profile, guest submissions, and notification outbox using the split fields. Existing rows and queued notifications are discarded; guest links are retained. Recreate the owner profile after applying it. The D1 migration cannot delete R2 objects, so remove existing objects under the `owner-profile/` and `guest-submissions/` prefixes from the configured photos bucket separately when applying the reset. Confirm the target account and bucket before deleting those private contact photos.

`migrate:remote` explicitly uses `--remote`. `migrate:local` uses the `DB` binding with `--local`, so it continues to use Wrangler's local D1 simulator after the production database name and ID are set in `wrangler.jsonc`; it does not write to Cloudflare.

### 5. Create and deploy the API Worker with its required secrets

Before deploying, attach `contactswap.quinten.dev` as a custom domain to the `contactswap` Pages project. `PUBLIC_APP_ORIGIN` in [`wrangler.jsonc`](wrangler.jsonc) is set to `https://contactswap.quinten.dev` and must match the Pages production origin for generated guest links. `CORS_ALLOWED_ORIGIN_PATTERN` is set to `https://*.quinten.dev`, allowing HTTPS subdomains of `quinten.dev` as browser origins without changing the guest-link host.

The first Worker deployment creates the `contactswap-api` Worker. Its configuration declares `ADMIN_TOKEN`, `LINK_SIGNING_KEY`, and `WEBHOOK_URL` as required [Worker Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), so provide all three on that initial deployment.

Create a local secrets file and restrict its permissions:

```sh
touch apps/api/.env.production
chmod 600 apps/api/.env.production
```

Put only these entries in `apps/api/.env.production`, replacing the placeholders with real values:

```dotenv
ADMIN_TOKEN="replace with a long random owner token"
LINK_SIGNING_KEY="replace with a random value of at least 32 bytes"
WEBHOOK_URL="replace with the HTTPS webhook URL"
```

For example, `openssl rand -hex 32` generates a 32-byte random value suitable for `LINK_SIGNING_KEY`. Keep this file local; `.env.production` is ignored by Git. Do not add `PUBLIC_APP_ORIGIN` here: it is non-secret configuration in `wrangler.jsonc`, and should match the Pages production origin.

Deploy the Worker and upload the required values as Worker Secrets:

```sh
npm run deploy --workspace @contactswap/api -- --secrets-file .env.production
```

Wrangler creates the Worker and deploys this version with the secrets. After confirming deployment, remove the local production secrets file:

```sh
rm apps/api/.env.production
```

The deployed Worker URL is printed by Wrangler. Check the public health endpoint using that URL:

```sh
curl "https://contactswap-api.quinten.dev/api/health"
```

It should return HTTP `200` and `Hello, world!`. Keep the Worker origin for the frontend's `VITE_API_BASE_URL` setting. To change one secret later, use `npm exec --workspace @contactswap/api -- wrangler secret put SECRET_NAME` and enter the value at Wrangler's prompt. `secret put` deploys a new Worker version immediately.

### 6. Deploy the Pages frontend

The Pages project is created separately from `apps/web` with its own Wrangler configuration. Follow the repository [README](../../README.md) for the one-time Pages project creation and frontend deployment command. Set `VITE_API_BASE_URL` to `https://contactswap-api.quinten.dev` at build time; the API allows browser access from the `PUBLIC_APP_ORIGIN` and origins matching `CORS_ALLOWED_ORIGIN_PATTERN` configured in `wrangler.jsonc`.

## Ongoing operations

- Deploy API code updates with `npm run deploy --workspace @contactswap/api`.
- Run reviewed production schema changes with `npm run migrate:remote --workspace @contactswap/api`; verify the configured database and Wrangler's confirmation prompt first.
- Inspect active R2 lifecycle rules with `npm run infra:r2:lifecycle:list --workspace @contactswap/api`; apply changes with `npm run infra:r2:lifecycle:apply --workspace @contactswap/api` only after reviewing the complete desired policy.
- Use `npm run migrate:local --workspace @contactswap/api` for local D1 only.

Wrangler configuration and resource identifiers do not provide a universal infrastructure plan or drift reconciliation. Do not delete or replace the D1 database or R2 bucket as part of routine setup or deployment.
