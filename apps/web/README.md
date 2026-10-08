# ContactSwap frontend

The ContactSwap frontend is a TypeScript, React, and Vite app hosted on Cloudflare Pages. It provides Quinten's owner profile editor, guest-link management, submission review, and the guest submission flow.

## Routes

| Path | Page |
| --- | --- |
| `/` | Welcome page |
| `/quinten` | Owner profile |
| `/quinten/links` | Guest-link management |
| `/quinten/submissions` | Guest submission review |
| `/token/{token}` | Guest flow |

Client-side routes are not an authorization boundary. The API enforces owner access; the owner token is used only to authorize API requests and must never be embedded in frontend assets.

## Local development

Run from the repository root:

```sh
npm run dev --workspace @contactswap/web
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` requests to the local API Worker at <http://127.0.0.1:8787>, which must also be running. For combined setup, local secrets, and API instructions, see the [repository README](../../README.md).

## Checks and build

Run from the repository root:

```sh
npm run test --workspace @contactswap/web
npm run typecheck --workspace @contactswap/web
npm run build --workspace @contactswap/web
```

The production build is written to `apps/web/dist`.

## Deployment

The frontend deploys separately to Cloudflare Pages. The Pages project name and output directory are configured in [`wrangler.jsonc`](wrangler.jsonc).

Create the Pages project once, if it does not already exist. From `apps/web`, run `npm exec -- wrangler pages project create contactswap` and select the intended production branch when prompted. For each deployment, run from `apps/web`:

```sh
npm run deploy
```

This command builds the static site and deploys `dist/` to the configured Pages project. It does not deploy the API Worker. Attach `contactswap.quinten.dev` to the `contactswap` Pages project as a custom domain. Set `VITE_API_BASE_URL` to the API Worker's custom domain in the environment running the command:

```sh
VITE_API_BASE_URL="https://contactswap-api.quinten.dev" npm run deploy
```

This value is public build-time configuration, not a secret. Pages dashboard build variables do not affect this local-build-and-Direct-Upload workflow. If unset, the frontend keeps relative `/api` requests for local Vite proxy use. The API allows `PUBLIC_APP_ORIGIN` (`https://contactswap.quinten.dev`) and HTTPS origins matching `CORS_ALLOWED_ORIGIN_PATTERN` in the API Worker's configuration. See the [repository README](../../README.md) for Cloudflare resource and API deployment steps.
