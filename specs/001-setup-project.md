# 001: Initialize the Project

## Status

Draft

## Goal

Create a runnable, testable project foundation for ContactSwap that follows the product and architecture documents. A developer should be able to install dependencies, run the app locally, see a minimal ContactSwap greeting in the frontend, receive a `200` "Hello, world!" response from the API, and verify the project with automated checks before feature work begins.

## Scope

- Establish a root npm workspace with separate `apps/web` and `apps/api` applications.
- Set up a TypeScript React frontend built with Vite and deployed to Cloudflare Pages, plus a separately deployable Cloudflare Worker API implemented with Hono.
- Add a minimal initial frontend page that displays "Hello to ContactSwap" and a Worker `GET /api/health` endpoint that responds with HTTP `200` and `Hello, world!`.
- Configure local development with Wrangler and a local D1 binding.
- Add the project commands for local development, type checking, tests, and production build.
- Add a minimal automated test proving the server-side runtime is wired and responds to a health check.
- Add CI that installs dependencies and runs type checking, tests, and the production build.
- Document prerequisites, local setup, available commands, and Cloudflare bindings needed for deployment.
- Ensure local build output, Wrangler state, local secrets, and dependencies are excluded from version control.

## Project Structure

Initialize the repository as a small npm monorepo. The frontend and API are separate applications with independent build and Cloudflare configuration; shared packages are not introduced until there is code that genuinely needs to be shared.

### Technology Stack

- Use TypeScript throughout, with npm workspaces for the monorepo.
- Build the browser application with React and React DOM, using Vite for development and production builds. Use TSX for React components.
- Implement the Worker HTTP API with Hono. Hono owns API route matching and request handling; the application remains a Cloudflare Worker and uses its standard Fetch interface and platform bindings.
- Use Cloudflare Pages for the static frontend, Cloudflare Workers for the API, and D1 for the local database binding. Use Wrangler for local Worker development, D1 migrations, and deployment.
- Use Vitest with the Cloudflare Workers test environment for API tests.
- Do not add another frontend framework, component library, state-management library, or API framework as part of this foundation.

```text
.
|-- apps/
|   |-- api/
|   |   |-- migrations/
|   |   |-- src/
|   |   |   `-- index.ts
|   |   |-- test/
|   |   |-- package.json
|   |   `-- wrangler.jsonc
|   `-- web/
|       |-- src/
|       |   |-- App.tsx
|       |   `-- main.tsx
|       |-- index.html
|       |-- package.json
|       |-- tsconfig.json
|       `-- vite.config.ts
|-- docs/
|-- specs/
|-- .github/workflows/ci.yml
|-- .gitignore
|-- package-lock.json
|-- package.json
`-- tsconfig.json
```

- `apps/web` owns the React browser application and its Vite build. Its production output is deployed to Cloudflare Pages; it must not contain server secrets or implement privileged operations.
- `apps/api` owns the Hono HTTP application, server-side authorization, and the D1 binding. Its Wrangler configuration declares the local D1 database and migration directory. The health-check endpoint and its automated test live here.
- The web app calls the API over HTTP. Local development runs both applications and configures the Vite development server to proxy `/api` requests to the local Worker, so browser code can use same-origin API paths without production credentials. Production API origin is non-secret deployment configuration, not a credential embedded in source.
- Root npm scripts coordinate workspace install, local development, type checking, tests, and production builds. The API and frontend retain their own package scripts for application-specific commands.
- D1 schema migrations live in `apps/api/migrations/`; only the minimal migration or binding setup needed to demonstrate the local migration workflow is part of this project foundation.
- Deploy the frontend and API as separate Cloudflare applications. Document the Pages build output and the Worker deployment command, and identify required D1 and environment bindings without supplying real IDs or secret values.

## Out of Scope

- Owner or guest workflows, forms, authentication, and contact-data persistence.
- Production D1 schema beyond what is needed to verify the local binding and migration workflow.
- Webhook delivery, vCard generation, image storage, and retention cleanup behavior.
- A visual design system, component library, or application-specific state-management library.
- Production deployment or creation of Cloudflare resources.

## Requirements

1. The project uses the root npm workspace structure in Project Structure, TypeScript, React with React DOM and Vite for the frontend, Hono for the Worker API, and Cloudflare platform tooling in keeping with `agents.md` and `docs/architecture.md`.
2. The Cloudflare Pages frontend (`apps/web`) and Worker API (`apps/api`) have clear boundaries and can be run locally together without production credentials.
3. D1 is available as a local API binding. Migrations live in `apps/api/migrations/`, and the local migration command is documented.
4. Local configuration uses placeholders for resource identifiers and secrets. Real credentials and local secret files are not committed.
5. No contact data, analytics, or unnecessary third-party services are introduced by the project scaffold.
6. `GET /api/health` returns HTTP `200` with the non-sensitive body `Hello, world!` and is covered by an automated test.
7. A clean checkout can install dependencies and run the documented checks without relying on a developer's machine-specific state.

## Acceptance Criteria

- `npm ci` succeeds from a clean checkout.
- The documented local development command starts the frontend and server-side runtime with local bindings and no production secrets.
- The frontend and API are independently buildable/deployable applications under `apps/web` and `apps/api`, and local `/api` requests reach the local Worker.
- The frontend is a React application built with Vite, and the Worker API routes are implemented with Hono.
- The frontend's initial route loads and displays "Hello to ContactSwap" in local development.
- A local `GET /api/health` request returns HTTP `200` with the body `Hello, world!` through the frontend's `/api` proxy.
- An automated test verifies the health-check status and response body without live Cloudflare services or real contact data.
- The documented D1 migration command works against the local database.
- Type checking, tests, and a production build pass using documented npm scripts.
- CI runs dependency installation, type checking, tests, and the production build for proposed changes.
- The README explains prerequisites, setup, local development, checks, and how deployment bindings are configured without including secret values.
- Generated dependencies, build artifacts, Wrangler state, local databases, and local secret files are ignored by Git.

## Implementation Notes

- Follow the deployment boundaries in `docs/architecture.md`; avoid adding infrastructure not required by this foundation.
- Use npm workspaces, React, React DOM, and Vite for the frontend; use Hono for Worker API routing.
- Keep API routes and Cloudflare bindings in the Worker application. Do not place D1 access or owner authorization in the browser application.
- Keep the initial UI and health response minimal; product workflows belong in later feature specs.
- Do not add production secrets, personal data, or real Cloudflare resource identifiers to the repository.
- Add feature-specific schema and migrations with the feature that first needs them rather than pre-designing the full database here.

## Verification

Run the documented install, type-check, test, and build commands from a clean checkout. Start the local development environment and verify the frontend greeting and `GET /api/health` response use local configuration only.