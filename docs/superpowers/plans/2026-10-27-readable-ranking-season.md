# Readable ranking seasons implementation plan

> Execute inline with superpowers:executing-plans. The user approved A and requested that it reach the actual website.

**Goal:** Publish the selected A card design: readable recommended month ranges and the selected month's historical mean temperature, without month-height bars or a card-footer visa row.

**Architecture:** Keep the shared server/client city renderer. A small season module formats existing records and opens a native dialog with an annual table. Entry conditions retain their existing filter and city-detail sources. Regenerate the reviewed public fallback, release through the existing Worker, and verify the real production page.

**Tech stack:** Existing ES modules, HTML dialog, CSS, Node 24 tests, Cloudflare Worker.

**Spec:** The approved A preview and `approved.json` at `/Users/xiongxinwei/.gstack/projects/remoteai-nomads/designs/card-information-20261026/`.

## Constraints and review focus

- Preserve the main workspace's 702 unrelated dirty files by working from current `origin/main` in a managed worktree.
- Do not change city facts, ranking math, travel advisories, data permissions, assistant availability, or production database contents.
- Keep historical recommendation labels distinct from 2023–2025 historical temperature; missing temperatures stay missing and 0°C stays valid.
- Retain sharing, comparison, card/list switching, mounted URLs, month changes, keyboard focus, and no-JavaScript navigation.
- All city-derived HTML must remain escaped. Seasonal details use already-loaded public data and make no additional database requests.

## Task 1: Readable seasons in the shared city renderer

- [ ] Write and run regression tests for disjoint/continuous month ranges, missing/zero temperatures, escaping, month changes, and removal of bars.
- [ ] Add the season formatter, summary, and annual table. Replace the card month band with the summary.
- [ ] Install the dialog from the existing ranking client; preserve ordinary city-page links without JavaScript.
- [ ] Move card-footer entry information into the existing entry filter/detail path. Keep list mode coherent.
- [ ] Apply scoped typography and spacing from A, adapting the existing site's current brand colors.
- [ ] Run the relevant tests and the complete existing suite.

## Task 2: Release and prove the actual website changed

- [ ] Verify desktop, 390px, and 320px layouts; month changes; annual table; entry filter; comparison; list switching; and missing-data cases locally.
- [ ] Update the design contract and commit only this change and regenerated public artifacts. Review the complete diff.
- [ ] Open and attach a PR, verify checks, and integrate through the current repository workflow.
- [ ] Use the existing production configuration and approved public snapshot; preserve server secrets and feature flags. Regenerate the release identifier and deploy without database migrations.
- [ ] Read back `/release.json` and `/healthz`, inspect fresh production cards on mobile and desktop, and save actual production screenshots and the release receipt.

## Execution notes

- 2026-10-27: The previous work only updated a standalone preview. Production still serves `nomads-ec39c8b8a667de67`; this task must end with production verification, not another preview.
