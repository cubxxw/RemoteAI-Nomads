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
- Published fallback HTML and sitemap must use the new public base during D1 outages.
- Legacy redirects must preserve filters and leave the local-record export page accessible.

### Task 1: Worker and browser mount support

**Files:** `web/src/site-path.js`, `web/src/worker.js`, `web/src/render.js`, `web/src/agent-gateway.js`, `web/src/published-fallback.js`, `web/public/modules/site-path.js`, affected browser modules, CSS assets, `web/scripts/build-public-pages.mjs`, `web/tests/site-path.test.js`.

**Interfaces:** Public mount functions normalize the configured site URL, strip the external prefix for internal routing, and create idempotent public paths. Browser code uses one shared helper for URLs and unmounted page-context matching.

- [ ] Add tests for mounted home/deep links, API/static responses, canonical redirects, query preservation and hostile cross-origin POSTs; run and observe failures.
- [ ] Implement mount handling before existing worker routes, preserving request bodies/signals and streaming responses.
- [ ] Prefix server HTML and client-generated links, API paths, photos and map URLs; make CSS URLs relative.
- [ ] Generate public snapshots against the new site base while retaining the reviewed source-publication identity.
- [ ] Run focused tests, the full existing check suite and Wrangler dry build.

### Task 2: Local-record migration and operational links

**Files:** `web/public/local-data.html`, `web/public/local-data.js`, `web/public/modules/local-migration.js`, `web/tests/local-migration.test.js`, worker local-data route, navigation link.

**Interfaces:** A versioned JSON backup contains an allowlisted set of Nomads browser preferences/plans and normalized conversation records. Import skips existing destination keys/records and excludes active-run locks and credentials.

- [ ] Test export allowlist, import size/schema rejection, conflict preservation and visible conversation normalization.
- [ ] Add export/import page operating entirely inside the browser; preserve an old-origin route after redirects activate.
- [ ] Test the old-origin exception, noindex/no-store headers and mounted script loading.

### Task 3: Roamorrow route and discoverability

**Files in `getyak/roamorrow`:** `apps/web/next.config.ts`, `apps/web/src/app/robots.ts`, `apps/web/src/app/sitemap.ts`, shared navigation, route-specific tests.

- [ ] Test that only `/nomads` paths are forwarded to the fixed upstream, query strings remain supported, and existing routes are untouched.
- [ ] Add the external rewrite and trailing-slash compatibility setting using documented Next.js 15 APIs.
- [ ] Expose Nomads in navigation and the main sitemap; add the Nomads sitemap to robots without indexing private endpoints.
- [ ] Run focused web checks/build and inspect deployment preview before production promotion.

### Task 4: Staged cutover and acceptance

**Files:** private production config, public README/deployment docs, release manifest, local cutover evidence.

- [ ] Record the pre-cutover Worker version and Vercel deployment; retain configuration copies locally with restrictive permissions.
- [ ] Publish compatible Worker with legacy redirects disabled and verify the old service.
- [ ] Deploy/publish the main-site route and verify new public pages, API status, assets and normal Roamorrow pages in a real browser.
- [ ] Review the whole change; fix material issues before enabling redirects.
- [ ] Enable one-to-one permanent legacy redirects and update public links and deployment docs.
- [ ] Verify production release identifiers, redirects, canonical/sitemap, local-record page and protected-file hashes. Record remaining provider or model gates explicitly.

Rollback: turn off the legacy redirect flag first; restore the previous Vercel deployment if necessary. Revert the Worker only if its compatibility change causes a regression. Do not restore or reinitialize D1.
