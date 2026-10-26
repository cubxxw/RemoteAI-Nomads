# Public MCP and Nomad Planner Implementation Plan

> Execute inline using superpowers:executing-plans. Preserve the published site's data and behavior.

**Goal:** A login-free read-only MCP and portable Skill that obtain useful, sourced context in few calls.

**Spec:** `docs/superpowers/specs/2026-10-26-public-mcp-skills-design.md`, refined by the user's request for lightweight logic and minimal questioning.

**Architecture:** One reviewed JSON snapshot, one shared query function, twelve small tools, a stateless HTTP handler and one self-contained Skill. Reuse current ranking, budget and time calculations. No runtime database, model, session, OAuth, or R2. Version requests pin the current snapshot and fail explicitly when unavailable; archival storage is deferred.

## Constraints

- Read only the validated public seed at build time; project fields explicitly.
- Keep source dates, units, geographic scope, legacy evidence and missing values visible.
- Provide useful country/city context and selected candidate evidence in one call.
- Ask at most one material clarification before initial suggestions; accept explicit assumptions.
- Preserve the current website, its deployment settings and private work.
- No paid model calls, external crawling, or personal-context storage.

## Review Focus

Currency and household units; missing climate vs zero; non-CN passport applicability; date/DST validity; stale FX; schema/size limits; raw-data privacy; snapshot pinning; anonymous/shared-proxy rate limits; actual MCP compatibility.

## Tasks

### 1. Public snapshot and shared queries

- [x] Add tests against the reviewed seed for safe projection, stable versions, source metadata and single-call country context.
- [x] Observe failures, implement the snapshot builder and shared pure query engine.
- [x] Cover precise country matching, climate filters, scoped costs, sources, missing coverage, budget changes and date conversion.
- [x] Run the query tests and existing Web baseline.

### 2. Thin public transport

- [x] Register bounded schemas for twelve tools in the official stateless MCP SDK.
- [x] Add tests for real client calls and the ordinary JSON fallback, body limits, bounded results, invalid tools, version mismatch and rate-limit responses.
- [x] Serve a local MCP, use two protocol client generations to verify real handshake/tool compatibility, and dry-run the Worker build.
- [x] Keep build inputs/publication fingerprints reproducible and add a focused CI job.

### 3. Portable Skill and delivery

- [x] Establish a behavioral baseline on realistic mixed-intent requests before writing the Skill.
- [x] Write one concise Skill, one task-specific reference and a dependency-free fallback helper only if useful.
- [x] Validate the skill and demonstrate country/season/budget/context-change flows against the real local data.
- [x] Add installation and source-boundary documentation; run full checks and independent review.
- [x] Commit/push a separate branch and create a draft PR; distinguish tested implementation from deployment.

## Execution record

Workspace: managed `nomads-public-mcp` checkout based on merged SEO main `52868d57`.
Ruling: one validated JSON snapshot is sufficient for the current 350-city catalog; split storage and archived versions can follow measured need. Unavailable versions return an explicit error, never mixed data.
Ruling: get_context performs name resolution, filtering and compact evidence assembly in one call. Separate detail tools remain available.

Task 1: reviewed-seed query tests passed, including names, geographic cost scopes, stale same-date FX, monthly climate, group/person budgets and DST. Existing Web baseline passed 401/401.
Task 2: official SDK v2.4.0 handler directly serves both official client generations without auth or sessions, including real workerd HTTP tests. No Agents wrapper, database, model or persistent state added.
Task 3: portable Skill validated; five synthetic requests needed16 calls before the combined endpoint/Skill iteration and9 after, with no questions in either round. This is an iteration observation, not a controlled Skill-only benchmark. Archive contains only four whitelisted files.
Ruling: root data tests include a reviewed Anji area relationship with no observations; fixtures must distinguish that from Dali's actual regional samples. A zero-rain case uses a labelled test fixture because the selected real monthly sample has no exact zero.
Final review: independent read-only review found two important constraint-handling issues. Both were reproduced and fixed with RED→GREEN regressions: city context honors its filters, and country cost references honor scope/category.
Final: Ruling: timezone-data absence is treated as an important correction rather than deferred polish, because mislabelling it as invalid user input causes futile retries. TIMEZONE_MISSING regression RED→GREEN.
Implementation delivered in PR #39, merged at b47443be with all remote checks passing. Production was subsequently authorized and deployed to https://mcp.roamorrow.com/mcp; actual app-specific UI compatibility is not claimed.

Final verification: 25 MCP tests passed without failures/skips; real HTTP workerd smoke passed with both official client generations. Skill structure and four-file archive validated. Original Web401 and Python100 passed; source/link/workflow checks passed with the three pre-existing weather review notices retained.

Production verification: both official client generations passed against the real HTTPS endpoint. Four JSON regression probes passed; health reports350 cities; downloaded Skill SHA/CRC matched and its default-endpoint query passed. Deployment evidence: mcp/docs/deployment-2026-10-26.md. Runtime version3a6369a8-e00b-486e-8cc6-19d1642d623e.
