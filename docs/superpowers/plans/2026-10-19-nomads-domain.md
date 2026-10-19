# Nomads Domain Migration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. The user requested planning followed by execution in this chat.

**Goal:** Serve the independent Nomads project at `https://roamorrow.com/nomads` and redirect legacy public links after verification.

**Architecture:** Vercel forwards only the `/nomads` namespace to the existing Cloudflare Worker. A mount adapter preserves the existing internal routing and prefixes public output; the applications and D1 remain independent.

**Tech Stack:** Next.js 15, Cloudflare Workers/Wrangler 4, Node 24, native node:test, existing Vitest web checks.

**Spec:** `docs/superpowers/specs/2026-10-19-nomads-domain-design.md`

## Global Constraints

- Public entry: `https://roamorrow.com/nomads`; canonical home has no trailing slash.
- Preserve current D1 binding, Durable Object migration history, secrets and public model quotas.
- No database initialization, schema migration, DNS replacement or paid-plan change.
- Keep the two original checkouts and their protected files unchanged.
- Preserve query strings and use one-to-one permanent redirects only after new-route verification.
- Import/export local user data only on an explicit browser action; keep existing destination records.

## Review Focus

- Trailing-slash redirects, external rewrites and canonical paths must not create loops.
- Asset requests, dynamic links and map tiles must not escape into Roamorrow's root namespace.
- Agent POST Origin checks, Cookie paths, SSE and cancellation must retain their contracts.
- Authenticated original-network attribution must preserve per-network quotas across the Vercel-to-Cloudflare hop; unsigned forwarding headers remain untrusted.
- Published fallback HTML and sitemap must use the new public base during D1 outages.
- Legacy redirects must preserve filters and leave the local-record export page accessible.

### Task 1: Worker and browser mount support

**Files:** `web/src/site-path.js`, `web/src/worker.js`, `web/src/render.js`, `web/src/agent-gateway.js`, `web/src/published-fallback.js`, `web/public/modules/site-path.js`, affected browser modules, CSS assets, `web/scripts/build-public-pages.mjs`, `web/tests/site-path.test.js`.

**Interfaces:** Public mount functions normalize the configured site URL, strip the external prefix for internal routing, and create idempotent public paths. Browser code uses one shared helper for URLs and unmounted page-context matching.

- [x] Add tests for mounted home/deep links, API/static responses, canonical redirects, query preservation and hostile cross-origin POSTs; run and observe failures.
- [x] Implement mount handling before existing worker routes, preserving request bodies/signals and streaming responses.
- [x] Prefix server HTML and client-generated links, API paths, photos and map URLs; make CSS URLs relative.
- [x] Generate public snapshots against the new site base while retaining the reviewed source-publication identity.
- [x] Run focused tests, the full existing check suite and Wrangler dry build.

### Task 2: Local-record migration and operational links

**Files:** `web/public/local-data.html`, `web/public/local-data.js`, `web/public/modules/local-migration.js`, `web/tests/local-migration.test.js`, worker local-data route, navigation link.

**Interfaces:** A versioned JSON backup contains an allowlisted set of Nomads browser preferences/plans and normalized conversation records. Import skips existing destination keys/records and excludes active-run locks and credentials.

- [x] Test export allowlist, import size/schema rejection, conflict preservation and visible conversation normalization.
- [x] Add export/import page operating entirely inside the browser; preserve an old-origin route after redirects activate.
- [x] Test the old-origin exception, noindex/no-store headers and mounted script loading.

### Task 3: Roamorrow route and discoverability

**Files in `getyak/roamorrow`:** `apps/web/next.config.ts`, `apps/web/src/app/robots.ts`, `apps/web/src/app/sitemap.ts`, shared navigation, route-specific tests.

Additional reviewed files: `apps/web/src/middleware.ts`, `apps/web/src/lib/nomads-proxy.ts` and tests; Worker `web/src/proxy-network.js` and `web/tests/proxy-network.test.js`. Middleware authenticates only the network attribution on `/nomads/api/agent/:path*`, leaving request bodies and streams untouched.

- [x] Test that only `/nomads` paths are forwarded to the fixed upstream, query strings remain supported, and existing routes are untouched.
- [x] Add the external rewrite and trailing-slash compatibility setting using documented Next.js 15 APIs.
- [x] Expose Nomads in navigation and the main sitemap; add the Nomads sitemap to robots without indexing private endpoints.
- [x] Run focused web checks/build and inspect deployment preview before production promotion.

### Task 4: Staged cutover and acceptance

**Files:** private production config, public README/deployment docs, release manifest, local cutover evidence.

- [x] Record the pre-cutover Worker version and Vercel deployment; retain configuration copies locally with restrictive permissions.
- [x] Configure the same narrow `NOMADS_PROXY_SECRET` as server-only Secrets on the two existing services, through stdin without logging its value; prove verified attribution and rejection of tampering/expiry before cutover.
- [x] Publish compatible Worker with legacy redirects disabled and verify the old service.
- [x] Deploy/publish the main-site route and verify new public pages, API status, assets and normal Roamorrow pages in a real browser.
- [x] Review the whole change; fix material issues before enabling redirects.
- [x] Enable one-to-one permanent legacy redirects and update public links and deployment docs.
- [x] Verify production release identifiers, redirects, canonical/sitemap, local-record page and protected-file hashes. Record remaining provider or model gates explicitly.

Rollback: turn off the legacy redirect flag first; restore the previous Vercel deployment if necessary. Revert the Worker only if its compatibility change causes a regression. Do not restore or reinitialize D1.


## Production acceptance — 2026-10-19

- Canonical entry is live at https://roamorrow.com/nomads. Legacy root, filtered home, city, comparison, guide and sitemap paths return 308 with preserved queries; final destinations return 200 and do not loop.
- Final Worker release: `nomads-f4378db5f5829cab`; version `9d6d4713-844e-4ea5-9e4c-9b368bd237c9`. The existing D1 health query confirms 350 cities. No schema or data migration was performed.
- Roamorrow main: `d7c5e4cb2f29cf43ade75e1405e2758b72cdee6a`; automatic production deployment `dpl_J4Ei2NE7XZ4qBsQ7EsWkMCvAvzsA` supersedes the equivalent validated/promoted candidate. Existing home, Chinese home, app and Lisbon pages remain 200.
- Real browser acceptance covers search, month preservation, city detail, actual map data, changed comparison selection, complete sourced model answers and local conversation recovery. An old pre-cutover tab still loads its assistant lazily.
- The proxy authenticates network attribution and retains the scoped HttpOnly agent cookie. Active cancel and cross-session isolation passed with real model requests. A follow-up browser lease addresses proxy disconnect buffering: the production trace confirms actual cancellation and upstream release at 45,000 ms; a connected multi-city answer completes and saves successfully.
- Latest checks: 341 Nomads tests, 68 Roamorrow web tests, syntax/type checks and both production builds passed. Independent source review found no remaining blockers. The final cutover HTTP matrix passed 22 checks; full matrices, screenshots and release output are retained in the maintainer's private deployment evidence, outside public assets.
- Original Roamorrow dirty files retain all 32 recorded hashes. The primary Nomads checkout advanced concurrently with #19 and further local evidence edits; these were not reverted or overwritten. Migration changes and the active private production configuration remain in the isolated migration checkout. Before future deployment from another checkout, sync current main and use the documented mounted production configuration.
- Rollback remains the sequence above: disable `LEGACY_REDIRECT`, publish the Worker, then restore the recorded earlier Vercel deployment if needed. Keep the upstream domain and the existing D1/DO resources.
