# ContactSwap

A small, privacy-focused contact-sharing app for a single owner.

Quinten keeps his own contact profile, creates guest links, and receives guest submissions that can be downloaded as vCard 4.0 files. The app is designed around a simple Cloudflare stack with owner-only management and single-use guest links.

## Stack

- Cloudflare Pages
- Cloudflare Workers
- Cloudflare D1
- TypeScript
- React and React DOM with Vite
- Hono for Worker API routing
- vCard 4.0

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

Open <http://127.0.0.1:5173>. The frontend displays the initial ContactSwap greeting. The Vite server proxies `/api` requests to the local Worker at <http://127.0.0.1:8787>; verify the API with:

```sh
curl http://127.0.0.1:5173/api/health
```

The health endpoint returns HTTP `200` and `Hello, world!`. Wrangler runs against its local D1 simulation by default; no production database or secret is used. Local database state is stored under `apps/api/.wrangler/`.

Apply local D1 migrations with:

```sh
CI=1 npm run migrate:local
```

`CI=1` makes Wrangler skip its interactive migration confirmation. This command explicitly targets the local database.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

`npm run verify` runs all three checks. The Worker test runs in Cloudflare's Workers runtime locally and does not contact live Cloudflare services.

## Cloudflare Deployment

The frontend and Worker API deploy independently. No Cloudflare resources are created by setup or CI.

1. Create a D1 database in your Cloudflare account and replace the placeholder `database_id` in `apps/api/wrangler.jsonc` with its ID before deploying the API. Apply production migrations only when intentionally targeting that remote database.
2. Authenticate Wrangler with Cloudflare, then deploy the API with `npm run deploy --workspace @contactswap/api`.
3. Create a Pages project named `contactswap` once with `npm exec --workspace @contactswap/api -- wrangler pages project create contactswap`.
4. Build the frontend with `npm run build --workspace @contactswap/web`, then deploy `apps/web/dist` using `npm exec --workspace @contactswap/api -- wrangler pages deploy ../web/dist --project-name contactswap` from the repository root.

Configure the Pages build output as `apps/web/dist` when using an external build pipeline. Add only non-secret public API origin configuration to the Pages build environment when the frontend needs to call the separately deployed API. Bindings and secrets for future API features belong on the Worker and must never be added to frontend code or committed files. Local secret files such as `.dev.vars` are ignored by Git.

## Project Docs

- [Product brief](docs/product.md)
- [Architecture](docs/architecture.md)
- [Feature specifications](specs/)
