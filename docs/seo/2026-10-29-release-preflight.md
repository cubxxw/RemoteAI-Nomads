# SEO release preflight — 2026-10-29

Base: `origin/main` at `7d62e788ddc885fdd225658af92ec63db5d14185`.

This release applies the SEO patch to current main in a separate checkout. The original checkout remains on its existing branch with 720 changed/untracked files; preservation fingerprints are kept outside the repository. Production configuration is ignored by Git and retains the existing public-agent setting. No database writes or migrations are needed.

Validation on the integrated source:

- Full `npm run check`: 500 passed, zero failed; main's sequential test setting is retained.
- Worker dry-run packaging: passed.
- Rebuilt public snapshot: 862 HTML pages, 602 canonical sitemap targets, zero SEO errors. Two size warnings remain for the ranking page and its canonical alias.
- Independent review: 72 focused tests passed. All 244 published guide routes return 200 with their canonical/indexing metadata; all corresponding raw storage paths return 404. City profiles and D1 outage recovery remain available.
- Main's existing artifact test incorrectly treated `account` and `agents` inside published guide slugs as private routes. Its reproduced failure is corrected to match actual route namespaces; the full suite then passes.
- CI now runs `npm run seo:check` after generating the public pages.

The [earlier audit](2026-10-29-audit.md) and its [423-URL local fixture](2026-10-29-snapshot-audit.json) are historical evidence from the original checkout. The [602-URL check](2026-10-29-main-snapshot-audit.json) is the release candidate based on current main. Neither count is an assertion of Google indexing.

Merge, deploy and live acceptance are the remaining release steps. The live Worker version, route checks, browser observations and preservation comparison will be recorded in the release PR and the local acceptance artifact after deployment. The existing D1 contents, publication scope and observation dates are not changed by a migration or seed import.
