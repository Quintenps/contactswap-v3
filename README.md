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

The API validates `apps/api/.env` before Wrangler starts, checking required local settings and the signing key's minimum length without printing secret values. Wrangler runs against its local D1 simulation by default; no production database or secret is used. To call owner-only API routes locally, create `apps/api/.env` from the example file and set local-only values for `ADMIN_TOKEN` and `LINK_SIGNING_KEY`. Keep `PUBLIC_APP_ORIGIN` set to the local frontend origin:

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

The local request examples are in [requests/health.http](apps/api/requests/health.http) and [requests/owner-profile.http](apps/api/requests/owner-profile.http). Install the [REST Client extension](https://marketplace.visualstudio.com/items?itemName=humao.rest-client), open either file, and select **Send Request** above a request. They target the local Worker at `http://127.0.0.1:8787`; start it with `npm run dev` first. Owner requests read `ADMIN_TOKEN` from `apps/api/.env`. The link-creation request requires a saved owner profile. Keep the request files pointed at local development and do not use production credentials in them.

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
2. From `apps/api`, authenticate Wrangler and set the production admin token on the API Worker:

	```sh
	npx wrangler secret put ADMIN_TOKEN
	```

	Enter the token at Wrangler's interactive prompt. Do not put it in a command argument, Wrangler `vars`, or source code. This updates and deploys a Worker version immediately. You can also set it in the Cloudflare dashboard under **Workers & Pages > contactswap-api > Settings > Variables and Secrets**, choosing **Secret**. To rotate the token, repeat the same `secret put` command with the new value.
3. Set the link-signing key on the API Worker as a Worker Secret:

	```sh
	npx wrangler secret put LINK_SIGNING_KEY
	```

	Use a randomly generated value of at least 32 bytes. Do not put it in Wrangler `vars`, source code, or command arguments.
4. Set `PUBLIC_APP_ORIGIN` in `apps/api/wrangler.jsonc` to the deployed Pages origin before deploying the API. It is non-secret configuration; the default matches the `contactswap` Pages project's `https://contactswap.pages.dev` origin.
5. After configuring both Worker Secrets and the public origin, deploy the API with `npm run deploy --workspace @contactswap/api` from the repository root.
6. Create a Pages project named `contactswap` once with `npm exec --workspace @contactswap/api -- wrangler pages project create contactswap`.
7. Build the frontend with `npm run build --workspace @contactswap/web`, then deploy `apps/web/dist` using `npm exec --workspace @contactswap/api -- wrangler pages deploy ../web/dist --project-name contactswap` from the repository root.

Configure the Pages build output as `apps/web/dist` when using an external build pipeline. Add only non-secret public API origin configuration to the Pages build environment when the frontend needs to call the separately deployed API. The admin token belongs in the API Worker's Cloudflare Worker Secrets, never in Pages variables, frontend code, or committed files. Local secret files such as `.env` and `.dev.vars` are ignored by Git.

## Project Docs

- [Product brief](docs/product.md)
- [Architecture](docs/architecture.md)
- [Feature specifications](specs/)
