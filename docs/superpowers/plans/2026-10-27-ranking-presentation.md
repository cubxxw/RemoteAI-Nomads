# Stable ranking presentation and list view

**Goal:** Restore the intended ranking without a large hero collapsing or default cities flashing, and offer a remembered card/list switch.

**Design:** Keep the introduction for a new visitor. Returning visitors and filtered entry links start with the compact heading. Fix that choice for the lifetime of the page; changing filters must not move the whole finder. Use a small same-origin classic script before the ranking markup to read presentation hints, without changing the security policy. When local filters need restoring, cover the unready controls and results with a static loading state. Keep the server-rendered city links available on initialization failure or when scripting is disabled.

The list reuses the same city nodes, ranking, filters, missing-value handling, comparison and sharing actions. Desktop metrics align in columns; narrow screens use compact rows with visible labels. Card view remains the default; the display choice is local to this browser and does not change shared filter URLs.

**Scope:** Preserve unrelated edits in the existing checkout. Publish only the ranking changes from a clean branch based on the current main branch, retaining the existing production configuration and approved public data snapshot. No dependency, database, model, quota or schedule changes.

- [x] Add failing startup/readiness regressions covering saved preferences, explicit URLs, unavailable storage, first visits and presentation persistence.
- [x] Add early presentation bootstrap, fixed hero choice, restoration placeholder and failure release.
- [x] Add the card/list switch and responsive list styles in a separate stylesheet.
- [x] Run focused and complete web checks, build, and browser validation of delayed initialization, reload, filters, sharing/comparison and narrow screens. Record actual evidence and limits.

## Verification — 2026-10-27

Reproduced the existing production behavior with saved overseas/month filters and delayed rank-ui loading. The hero changed from expanded to compact, the first three cities changed, and the ranking-list top moved from 618.59375px to 403.0625px (215.53125px).

Seven new startup regressions initially failed before implementation. The complete web check now passes 438/438 tests, including the actual successful and failed rank boot paths revealing the result panel. `npm run build` passes as a dry run; nothing was deployed.

Local Chromium verification passes 28/28 checks. With the rank-ui request held until after a screenshot, the hero height remained 39.375px and the toolbar top remained 104.375px before and after restoration. The initial default cities were visually hidden, including their month labels, until the actual saved results were ready. Layout toggles reuse the city nodes; list selection and its pressed state survive reload. Filtering, city sharing, comparison, explicit URL priority and failed module loading were exercised.

At widths 1024, 768, 390 and 320px, document width equals viewport width. At 390 and 320px, a list row is approximately 197px tall. Separate browser contexts verified visible public city links without scripting, working filters/list selection when local storage is blocked, and operation with reduced motion. Physical touch, Safari and screen-reader output were not tested; metric labels remain available to assistive technology when their visible desktop labels are replaced by the aligned column headings.

Evidence is in the ignored `output/playwright/` directory: `ranking-presentation-results.json`, `ranking-first-visit.png`, `ranking-restoring.png`, `ranking-restored.png`, `ranking-list-desktop.png`, `ranking-list-mobile.png`, and the reproducible browser check `check-ranking-presentation.js`.

## Release refinement

The display switch has no outer frame. Its selection fill is 30px tall within a 44px touch target, and its controls use the current brand-brown token. Ranking data keeps the existing green accent.

Independent review found and resolved an entry-module failure that could leave public rows hidden. The early startup script now releases the restoration mask on entry-script errors or after an 8-second stall, with an accurate default-ranking message. Unbound controls remain inert; a late successful initialization releases them normally. Three regression cases failed before this recovery was added and pass with the fix. The independent re-review is clean.
