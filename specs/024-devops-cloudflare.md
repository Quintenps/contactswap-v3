# 024: Cloudflare Infrastructure Configuration

## Status

Implemented

## Goal

Keep ContactSwap's static frontend deployment and production connection to the API Worker, plus the D1/R2 settings required by the product, in version control with documented, repeatable commands that use the project's pinned Wrangler version.

## Scope

- Treat `apps/api/wrangler.jsonc` as the source of truth for the API Worker's D1 and R2 bindings.
- Add a Pages-specific Wrangler configuration in `apps/web/wrangler.jsonc` for the static project's name and build output directory.
- Deploy the Vite-built frontend as static assets to the existing Cloudflare Pages project, independently from the API Worker.
- Provide a frontend workspace `npm run deploy` command that builds and deploys the static site from `apps/web`.
- Configure frontend API requests to reach the separately deployed API Worker in production while preserving the local Vite proxy.
- Keep D1 schema changes in the existing versioned SQL migrations and apply them with Wrangler.
- Add a versioned JSON R2 lifecycle configuration and apply it with Wrangler.
- Document safe setup, verification, and production-apply steps for the Pages project and storage resources.
- Replace the hand-maintained R2 lifecycle instructions in the API README with the source-controlled configuration and its apply/verification workflow.

## Approach

Use Wrangler-native configuration and commands because the project already uses Wrangler and the required settings fit its Worker configuration, Pages deployment, D1 migration, and R2 lifecycle features. Do not add Terraform, Pulumi, or another infrastructure tool for this scope.

This is infrastructure configuration as code, but it is not a general Cloudflare account reconciler: Wrangler does not provide one universal plan/apply operation for Pages, D1, and R2 settings. Keep resource creation, static asset deployment, Worker binding configuration, D1 schema migrations, and R2 lifecycle configuration as explicit Wrangler operations. Do not claim that a successful deployment proves that every bucket setting matches the repository.

## Static Frontend

- Add `apps/web/wrangler.jsonc` with the Pages project name `contactswap`, `pages_build_output_dir` set to `./dist`, and an explicit compatibility date. This Pages-specific file is separate from the API Worker's `apps/api/wrangler.jsonc`.
- Before using the Pages Wrangler file for a project that already exists, compare its settings with the Cloudflare dashboard and reconcile them. Once adopted, treat the file as the source of truth for the Pages settings it manages.
- From `apps/web`, `npm run deploy` runs the Vite production build and then `wrangler pages deploy`. Wrangler reads the Pages configuration and deploys its configured `dist/` directory to `contactswap`; do not duplicate the project name or output path in the script.
- Declare the pinned Wrangler CLI as a frontend workspace development dependency, using the same version as the API workspace, so the deploy script does not rely on a global or undeclared sibling dependency.
- Create the Pages project once, if it does not already exist, using the workspace-local Wrangler command `npm exec -- wrangler pages project create contactswap` from `apps/web`. Do not run project creation on each deployment.
- Keep the Pages frontend deployment independent from the API Worker deployment. The API remains a separately deployed Worker configured by `apps/api/wrangler.jsonc`.
- Do not add Pages Functions, move API routes into Pages, or migrate the frontend to Workers Static Assets.
- Keep the frontend's production API origin non-secret and configure it at Vite build time. Never put the admin token, webhook URL, link-signing key, or other Worker Secrets in Pages settings or generated frontend assets.
- Treat Pages project creation as a one-time operation. Confirm the Cloudflare account and project name before creating it; subsequent deploys update the static assets only.

## Frontend-to-API Connection

- Use a non-secret `VITE_API_BASE_URL` containing the API Worker's origin for production builds. The frontend must use it for every API request, including owner operations, guest operations, and link-scoped vCard/photo downloads.
- Use a non-secret `VITE_PUBLIC_APP_ORIGIN` containing the frontend's public origin for guest links. The deployment command must default it to `https://contactswap.quinten.dev` and allow an explicit override; do not derive this origin from `window.location`.
- When `VITE_API_BASE_URL` is unset in local development, keep using relative `/api/...` paths so the existing Vite proxy continues to forward requests to the local Worker.
- When `VITE_PUBLIC_APP_ORIGIN` is unset in local development, preserve the absolute guest-link origin returned by the local API.
- Because the Pages workflow performs a local Vite build followed by Direct Upload, `npm run deploy` must build with the production API and frontend origins by default, while allowing both to be overridden; Pages dashboard build variables do not configure this local build.
- Attach `contactswap.quinten.dev` as a custom domain to the `contactswap` Pages project, and set the API Worker's `PUBLIC_APP_ORIGIN` to `https://contactswap.quinten.dev`.
- Configure the API Worker to allow cross-origin requests from the exact production Pages origin and configured HTTPS subdomains matching `CORS_ALLOWED_ORIGIN_PATTERN`. Allow the headers and methods the frontend uses, including the owner `Authorization` header, and expose `Content-Disposition` so the frontend can read vCard filenames. Do not use a global wildcard origin or credentialed cookies.
- Resolve API-returned relative vCard and profile-photo paths against the configured API origin, while preserving validation that these URLs target the expected API routes.
- Keep `PUBLIC_APP_ORIGIN` in the API Worker's configuration set to `https://contactswap.quinten.dev`; it controls the origin in API-generated guest URLs and is distinct from `VITE_API_BASE_URL` (`https://contactswap-api.quinten.dev`) and `VITE_PUBLIC_APP_ORIGIN` (`https://contactswap.quinten.dev`).
- Do not add Pages Functions or embed API secrets in the static frontend. The API continues to enforce owner authorization independently of CORS.

## Configuration Sources

### Worker bindings

- Keep the API Worker's `DB` D1 binding, database name/identifier, and `migrations_dir` in `apps/api/wrangler.jsonc`.
- Keep its `PHOTOS` R2 binding and bucket name in the same configuration.
- Keep the existing `IMAGES` binding and other Worker settings unchanged.
- Retain `PUBLIC_APP_ORIGIN` in the API Worker's `vars`: the API uses it to generate absolute guest URLs for the Pages site. Set it to `https://contactswap.quinten.dev`; do not move it into the frontend's Wrangler configuration.
- Keep `CORS_ALLOWED_ORIGIN_PATTERN` as a separate API Worker variable so the optional wildcard CORS allowlist does not affect generated guest URLs. The configured `https://*.quinten.dev` pattern matches HTTPS subdomains only, not the apex domain; the exact production origin remains allowed through `PUBLIC_APP_ORIGIN`.
- Resource identifiers and names required to select the intended Cloudflare resources are configuration, not secrets. Do not commit API tokens, Worker Secret values, or local secret files.
- Do not use implicit or automatic resource provisioning during deploy. The configured bindings must identify the intended resources explicitly, so a typo or missing identifier cannot silently create a replacement database or bucket.

### D1

- Keep schema changes in `apps/api/migrations/` and use Wrangler's D1 migration workflow as the only schema deployment mechanism.
- Keep local development on Wrangler's local D1 database. Commands that access a remote database must explicitly identify their remote target and must never be part of the ordinary local development or test workflow.
- Keep the production database's real identifier in the deployment configuration after confirming the target account and database. Document that the local placeholder identifier must be replaced before production deployment or remote migrations; rely on operator verification rather than custom validation scripts.
- Do not add contact records, snapshots, exports, or database credentials to the infrastructure files.

### R2

- Add `apps/api/infrastructure/r2-lifecycle.json` as the complete desired lifecycle configuration for the configured photos bucket.
- Include an enabled expiration rule for objects under the `guest-submissions/` prefix after 30 days.
- Do not apply expiration to the whole bucket or to owner-photo keys. Owner photos must remain outside the guest prefix and must not be expired by this rule.
- Keep the bucket private. Do not enable public access, a custom domain, browser-direct uploads, or public/presigned photo URLs.
- Do not add a CORS policy: browser access to photos continues through the authorized Worker routes and R2 binding.
- Do not change bucket jurisdiction, location, or default storage class in this specification. Preserve existing choices; any change requires an explicit product/privacy decision.

Wrangler's R2 lifecycle `set` operation replaces the bucket's lifecycle configuration as a whole. Before applying it to an existing bucket, inspect its current rules and incorporate any required rules into the checked-in desired configuration; do not silently remove unrelated rules.

## Apply and Verification

- Use the Wrangler version already pinned in `apps/api/package.json`, invoked through the API workspace or its existing package scripts. Do not rely on a globally installed Wrangler version.
- Document the one-time resource setup separately from repeatable configuration, Pages deployment, and migration application. Create a Pages project, D1 database, or R2 bucket only after confirming the Cloudflare account and intended target; record non-secret identifiers and names in the appropriate configuration or deployment command.
- From `apps/web`, `npm run deploy` builds the frontend and deploys only the configured `dist/` directory to the Pages project named `contactswap`. Verify the selected account and reconcile the Pages configuration with any existing dashboard settings before its first deployment; deploy the static frontend independently of the API Worker.
- Verify that the local `npm run deploy` build receives the production `VITE_API_BASE_URL`, and that deployed frontend API requests reach the API Worker. Test CORS preflight for owner `Authorization` requests and verify the frontend can read vCard `Content-Disposition`.
- Document and provide repeatable commands to apply the versioned R2 lifecycle file and list the bucket's active lifecycle rules for verification.
- Document local D1 migration application separately from remote migration application. Production migrations must require an explicit remote target and be run only after reviewing the migration and confirming the target database.
- Verify that the configured Worker bindings point to the intended D1 database and private R2 bucket, and that the active R2 rule matches only the guest-photo prefix and 30-day retention.
- Do not automate database/bucket deletion, replacement, or data migration. These are destructive operations and are outside the normal apply workflow.
- Any command requiring Cloudflare authentication must use Wrangler's authenticated session or a narrowly scoped environment credential. Never place credentials in command arguments, tracked configuration, logs, or documentation.

## Out of Scope

- Changing ContactSwap's single-owner model, API behavior, retention period, object-key prefixes, or photo access rules.
- Choosing or changing D1/R2 jurisdiction, location, storage class, backup policy, or other account-level settings not already specified by the product.
- Provisioning or managing unrelated Cloudflare products, domains, Pages projects, Worker Secrets, or deployments.
- Automated infrastructure plans, drift reconciliation, destroy workflows, Terraform/Pulumi adoption, or CI credentials with remote account access.
- Custom scripts that gate deployment or remote migration based on configuration validation.
- Moving or importing production data.

## Acceptance Criteria

- The API's D1 and R2 binding declarations remain in `apps/api/wrangler.jsonc`; deployment instructions clearly require replacing the local D1 placeholder with the confirmed production name and identifier before remote operations.
- The API's non-secret `PUBLIC_APP_ORIGIN` remains in its configuration and points to `https://contactswap.quinten.dev`, the Pages production origin used for generated guest URLs.
- `apps/web/wrangler.jsonc` declares the Pages project name `contactswap`, `pages_build_output_dir` as `./dist`, and an explicit compatibility date.
- Running `npm run deploy` from `apps/web` builds and publishes only the configured static output using the workspace-pinned Wrangler CLI; project creation is a separate one-time command.
- Pages deployment instructions confirm the Cloudflare account, project, and output directory and do not expose Worker Secrets to the frontend.
- Production Vite builds use a non-secret API Worker origin, local development continues to use the Vite `/api` proxy, and the API Worker restricts CORS to the production Pages origin and configured HTTPS subdomains.
- Frontend API, vCard, and photo requests reach the API Worker in production; CORS permits required headers and exposes `Content-Disposition` without weakening API authorization.
- `apps/api/infrastructure/r2-lifecycle.json` exists, is valid for Wrangler's R2 lifecycle `set` command, and specifies only the enabled 30-day `guest-submissions/` expiration rule.
- No lifecycle rule expires the bucket generally or matches owner-photo objects.
- The documented workflow uses the repository-pinned Wrangler version to apply and inspect the R2 lifecycle configuration and to apply D1 migrations.
- Local development and tests continue to use local bindings by default; no routine command accesses or modifies production resources.
- Remote migration and lifecycle-configuration steps explicitly identify the target and include a pre-apply verification step.
- The apply workflow does not delete or replace a D1 database or R2 bucket, expose the bucket publicly, or discard existing lifecycle rules without review.
- No API tokens, Worker Secrets, personal contact data, or local secret files are added to tracked configuration.
- `apps/api/README.md` describes the checked-in configuration and safe apply/verification workflow without claiming Wrangler provides full plan or drift-reconciliation behavior.
