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

1. Create a D1 database in your Cloudflare account and replace the placeholder `database_id` in `apps/api/wrangler.jsonc` with its ID before deploying the API. Apply production migrations only when intentionally targeting that remote database.
2. Create a private R2 bucket named `contactswap-photos` (or update the bucket name in `apps/api/wrangler.jsonc`) and add the guest-photo expiration rule from `apps/api`:

	```sh
	npx wrangler r2 bucket lifecycle add contactswap-photos expire-guest-photos-after-30-days guest-submissions/ --expire-days 30
	npx wrangler r2 bucket lifecycle list contactswap-photos
	```

	Confirm the enabled rule matches only the `guest-submissions/` prefix and expires objects after 30 days. Do not use a bucket-wide expiration rule: owner photos are stored outside this prefix. Lifecycle processing is asynchronous; R2 typically removes expired objects within 24 hours. The lifecycle commands modify the selected Cloudflare account and require the R2 storage write permission.
3. From `apps/api`, authenticate Wrangler and set the production admin token on the API Worker:

	```sh
	npx wrangler secret put ADMIN_TOKEN
	```

	Enter the token at Wrangler's interactive prompt. Do not put it in a command argument, Wrangler `vars`, or source code. You can also set it in the Cloudflare dashboard under **Workers & Pages > contactswap-api > Settings > Variables and Secrets**, choosing **Secret**. To rotate the token, repeat the same `secret put` command with the new value.
4. Set the link-signing key on the API Worker as a Worker Secret:

	```sh
	npx wrangler secret put LINK_SIGNING_KEY
	```

	Use a randomly generated value of at least 32 bytes. Do not put it in Wrangler `vars`, source code, or command arguments.
5. Set `PUBLIC_APP_ORIGIN` in `apps/api/wrangler.jsonc` to the deployed Pages origin before deploying the API. It is non-secret configuration; the default matches the `contactswap` Pages project's `https://contactswap.pages.dev` origin.
6. After configuring both Worker Secrets and the public origin, return to the repository root and deploy the API with `npm run deploy --workspace @contactswap/api`.
7. Create a Pages project named `contactswap` once with `npm exec --workspace @contactswap/api -- wrangler pages project create contactswap`.
8. Build the frontend with `npm run build --workspace @contactswap/web`, then deploy `apps/web/dist` using `npm exec --workspace @contactswap/api -- wrangler pages deploy ../web/dist --project-name contactswap` from the repository root.
Configure the Pages build output as `apps/web/dist` when using an external build pipeline. Add only non-secret public API origin configuration to the Pages build environment when the frontend needs to call the separately deployed API. The admin token belongs in the API Worker's Cloudflare Worker Secrets, never in Pages variables, frontend code, or committed files. Local secret files such as `.env` and `.dev.vars` are ignored by Git.

## Project Docs

- [Product brief](docs/product.md)
- [Architecture](docs/architecture.md)
- [Feature specifications](specs/)
