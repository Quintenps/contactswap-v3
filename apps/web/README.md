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

The frontend deploys separately to Cloudflare Pages. See the [repository README](../../README.md) for Pages configuration and deployment steps.
