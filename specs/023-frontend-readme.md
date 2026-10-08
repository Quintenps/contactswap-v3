# 023: Frontend README

## Status

Proposed

## Goal

Add a short, practical `apps/web/README.md` that explains what the ContactSwap frontend does and how to run, check, and build it locally.

## Scope

- Summarize the frontend's role, main pages, and current client-side routes.
- Document the local development and frontend-specific check commands.
- Explain that local `/api` requests are proxied to the API Worker and point to the repository README for setup and deployment details.
- Keep the README concise and consistent with the product brief, architecture documentation, package scripts, and current implementation.

## README Content

The README should be straightforward personal-use documentation, not a replacement for the product brief, feature specifications, or repository-level setup guide. It should cover:

- **Purpose and stack:** Identify the frontend as the TypeScript, React, and Vite web app hosted by Cloudflare Pages. Briefly describe its owner profile, link-management, submission-review, and guest flows.
- **Routes:** List `/` as the welcome page, `/quinten` as the owner profile, `/quinten/links` as owner link management, `/quinten/submissions` as owner submission review, and `/token/{token}` as the guest flow. Clarify that client-side UI is not an authorization boundary; owner access is enforced by the API.
- **Local development:** Give the repository-root command to run the web workspace (`npm run dev --workspace @contactswap/web`) and its local URL (`http://127.0.0.1:5173`). Explain that Vite proxies `/api` requests to the local Worker at `http://127.0.0.1:8787`; point to the root README for the combined setup, local secrets, and API instructions.
- **Checks and build:** Include the current frontend workspace commands for tests, type checking, and production build. Make clear they are run from the repository root.
- **Deployment:** State that the frontend builds to `apps/web/dist` and deploys separately to Cloudflare Pages. Refer to the repository README for Pages deployment and configuration steps rather than duplicating them.
- **Privacy:** Do not include credentials or personal data in the README. Note that the owner token is used for authorized API requests and must never be embedded in frontend assets or treated as a substitute for server-side authorization.

## Out of Scope

- Changes to frontend behavior, routes, API contracts, authentication, or deployment configuration.
- A complete product guide, API reference, or replacement for repository-level setup and deployment documentation.
- Changes to the product brief, architecture, or existing README files.

## Acceptance Criteria

- `apps/web/README.md` exists and concisely describes the frontend's role and current routes.
- Local development instructions match the Vite proxy, frontend workspace scripts, and current local URL.
- Test, type-check, and build commands are valid and their working directory is unambiguous.
- It distinguishes client-side navigation from server-enforced owner authorization and does not expose secrets.
- It points to the repository README for combined setup and Cloudflare Pages deployment details.
- It remains a short maintainer reminder and does not duplicate extensive product or deployment documentation.
