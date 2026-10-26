# Search Discovery Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks in this session.

**Goal:** Give crawlers clean paths to the published city catalog and consistent treatment of query variants.

**Architecture:** Keep existing renderers and the published outage model. Enforce query indexing at the shared database response boundary and add one directory renderer fed by the existing public ranking catalog.

**Tech Stack:** Cloudflare Workers, JavaScript, node:test, SQLite public seed.

**Spec:** `docs/superpowers/specs/2026-10-26-search-discovery-design.md`

## Global Constraints

- No new dependencies or changes to article prose, evidence dates, ranking rules or publication status.
- Preserve mounted `/nomads` paths, legacy redirects, preview noindex, GET/HEAD behavior and unknown-route errors.
- The directory is a catalog, not a recommendation of every listed destination.

## Review Focus

- Live and outage responses must agree about query indexing and caching.
- Directory links must survive a mounted origin and remain available without JavaScript.
- Draft data must not appear in the production directory.
- Advisory destinations must retain their historical-information label.
- Generated sitemap and fallback route sets must remain synchronized.

### Task 1: Query indexing consistency

**Files:** `web/src/worker.js`, `web/src/published-fallback.js`, `web/tests/seo-routing.test.js`.

**Interfaces:** Existing worker and fallback responses; no public interface changes.

- [x] Add integration tests backed by the real public SQLite seed for city query noindex, canonical retention, selected month, preview and HEAD; add outage header/cache assertions.
- [x] Run `node --test tests/seo-routing.test.js`; expect the query policy assertions to fail before the fix.
- [x] Gate all database HTML query variants at the shared response boundary; match the existing guide policy and keep clean canonical pages indexable.
- [x] Run the focused tests; expect all to pass.

### Task 2: Permanent city directory

**Files:** Create `web/src/destination-directory.js`; update worker, common footer, ranking notes, public-page builder and relevant route/count tests.

**Interfaces:** `destinationDirectoryPage(cities, env)` returns shell page metadata and grouped HTML. The existing `loadRankings(env)` supplies production-filtered records; fallback uses the published ranking JSON.

- [x] Add directory integration tests for every published city, unique clean links, preview, query, HEAD, mounted schema, escaped labels, empty catalog and outage behavior.
- [x] Run the focused tests; expect the missing directory route to fail.
- [x] Implement the directory using existing content styles, region/country grouping and historical-information labels for advisory cities.
- [x] Add navigation, sitemap and fallback-build paths; update expected route counts.
- [x] Rebuild public snapshots for the production origin and inspect every sitemap URL for indexability, a matching canonical and one primary heading.
- [x] Run `npm run check`, `npm run build`, repository validators and `git diff --check`; expect success.
- [x] Record the Search Console baseline, findings, limitations and follow-up priorities in `research/2026-10-26-search-console-review.md`.

### Task 3: City-specific search descriptions

**Files:** `web/src/city-page.js`, `web/tests/seo-routing.test.js`, generated public city snapshots.

**Interfaces:** Existing city page metadata, using city-scoped consumption observations, usable historical climate, location timezone and existing advisories.

- [x] Reproduce the common description with the real public seed; expect the city-identity assertion to fail.
- [x] Generate city/country-specific descriptions that distinguish available observations from missing coverage, retaining travel advisories and evidence dates.
- [x] Verify coverage and missing-data descriptions, rebuild snapshots, rerun the suite and confirm all 350 city descriptions are distinct.

## Execution results

Task 1: RED → GREEN, query metadata, selected month, canonical, HEAD, preview and outage headers verified.
Task 2: RED → GREEN, 350 direct mounted links, draft exclusion, escaped labels, directory schema and outage behavior verified. First full suite: 400/400 passed; dry-run build passed. Generated sitemap audit: 422 unique URLs, all indexable and self-canonical, each with one H1.
Task 3: RED → GREEN, including invalid-timezone regression. Final suite: 401/401 passed with no skips; dry-run build passed. Final generated audit: 422 unique canonical/indexable sitemap URLs, 350 clean directory links, 350 distinct city descriptions.

Final review: independent read-only review approved, with no findings. Broad title rewrites, opening country/filter indexing, and changes to article prose or source data remain outside this correction; they require evidence and editorial work rather than automatic broadening of indexable content.

Final verification: remote CI caught whitespace in the newly generated directory, which the earlier unstaged diff check had not included. Reproduced with the complete base-to-head whitespace gate, removed the empty template line at its source and regenerated the page. Re-ran the full Web suite (401/401) and repository Python regression suite (100/100); the complete branch whitespace gate now passes.
