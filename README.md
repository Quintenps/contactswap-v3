# ContactSwap

A small, privacy-focused contact-sharing app for a single owner.

Quinten keeps his own contact profile, creates guest links, and receives guest submissions that can be downloaded as vCard 3.0 files. The app is designed around a simple Cloudflare stack with owner-only management and single-use guest links.

## Stack

- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- TypeScript
- React and React DOM with Vite
- Hono for Worker API routing
- vCard 3.0

## Prerequisites

- Node.js 22.12 or later and npm 10 or later.
- Cloudflare credentials are not required for local development or checks.

## Setup

```sh
npm ci
```

## Local Development

Run the Pages frontend and Worker API together:

```sh
npm run dev
```

Open <http://127.0.0.1:5173> to manage the owner profile. Enter the local `ADMIN_TOKEN` configured in `apps/api/.env`; the page uses the same-origin `/api` routes proxied by Vite to the local Worker at <http://127.0.0.1:8787>. The token is remembered in browser storage only after the API confirms access. Verify the API with:

```sh
curl http://127.0.0.1:5173/api/health
```

The health endpoint returns HTTP `200` and `Hello, world!`. Before Wrangler starts, the API validates `apps/api/.env`, including required local settings and the signing key's minimum length, without printing secret values. Wrangler runs against its local D1 simulation by default; no production database or secret is used. To call owner-only API routes locally, create `apps/api/.env` from the example file and set local-only values for `ADMIN_TOKEN` and `LINK_SIGNING_KEY`. Keep `PUBLIC_APP_ORIGIN` set to the local frontend origin:

```sh
cp apps/api/.env.example apps/api/.env
```

Set both secret values to private values used only on your machine. `LINK_SIGNING_KEY` must contain at least 32 bytes; `openssl rand -hex 32` generates a suitable local value. `.env` is ignored by Git and is read by both Wrangler and the VS Code REST Client extension. Do not create a `.dev.vars` alongside it, since Wrangler loads one local secret file at a time. Never use production secrets locally or commit the file. Local database state is stored under `apps/api/.wrangler/`.

Apply local D1 migrations with:

```sh
CI=1 npm run migrate:local
```

`CI=1` makes Wrangler skip its interactive migration confirmation. This command explicitly targets the local database.

## API Requests

The local request examples are grouped into [owner requests](apps/api/requests/owner/), [guest requests](apps/api/requests/guests/), and a [health check](apps/api/requests/health.http); image fixtures are in `apps/api/requests/fixtures/`. Install the [REST Client extension](https://marketplace.visualstudio.com/items?itemName=humao.rest-client), open a `.http` file, and select **Send Request** above a request. They target the local Worker at `http://127.0.0.1:8787`; start it with `npm run dev` first. Owner requests read `ADMIN_TOKEN` from `apps/api/.env`; guest examples use a local guest token configured in that file. The link-creation request requires a saved owner profile. Keep the request files pointed at local development and do not use production credentials in them.

## Checks

```sh
npm run typecheck
npm run test --workspace @contactswap/web
npm test
npm run build
```

`npm run verify` runs type checking, API tests, and production builds. The focused web tests run with `npm run test --workspace @contactswap/web`. Worker tests run in Cloudflare's Workers runtime locally and do not contact live Cloudflare services.

## Cloudflare Deployment

The frontend and Worker API deploy independently. No Cloudflare resources are created by setup or CI.

### API Worker, D1, and R2

For first-time production setup, follow the complete sequence in the API [README](apps/api/README.md#first-time-production-setup). It includes the account check and exact commands to create D1 and R2, apply migrations and lifecycle rules, and make the first Worker deployment with its required secrets. Create each resource only once, in the intended Cloudflare account.

Attach `contactswap.quinten.dev` as a custom domain to the `contactswap` Pages project. `PUBLIC_APP_ORIGIN` in `apps/api/wrangler.jsonc` is set to `https://contactswap.quinten.dev`; it must match the Pages production origin for CORS and generated guest links. The separate `CORS_ALLOWED_ORIGIN_PATTERN` allows HTTPS subdomains matching `https://*.quinten.dev` without changing generated guest links.

### Pages frontend

Create the Pages project once if it does not already exist. From `apps/web`, run `npm exec -- wrangler pages project create contactswap` and select the intended production branch when prompted. The project name and build output are in `apps/web/wrangler.jsonc`.

Deploy the static frontend from `apps/web`, using the API Worker's custom domain:

```sh
VITE_API_BASE_URL="https://contactswap-api.quinten.dev" npm run deploy
```

`VITE_API_BASE_URL` is non-secret build-time configuration. Because this command performs a local Vite build and Direct Upload, setting it in Pages dashboard build settings is not sufficient.

The Pages deployment publishes static assets only; it does not deploy the API Worker. The frontend keeps relative `/api` requests and Vite's proxy locally, while production requests use `VITE_API_BASE_URL`. The API allows cross-origin requests from `PUBLIC_APP_ORIGIN` and HTTPS subdomains matching `CORS_ALLOWED_ORIGIN_PATTERN`. The admin token belongs in the API Worker's Cloudflare Worker Secrets, never in Pages variables, frontend code, or committed files. Local secret files such as `.env` and `.dev.vars` are ignored by Git.

## Project Docs

- [Product brief](docs/product.md)
- [Architecture](docs/architecture.md)
- [Feature specifications](specs/)
