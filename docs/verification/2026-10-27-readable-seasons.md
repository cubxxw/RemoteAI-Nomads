# Readable city-card seasons — 2026-10-27

The user selected A and asked that the actual site adopt it. The previous standalone preview was not a deployment. Before this change, production reported release `nomads-ec39c8b8a667de67` and still displayed month-height bars and a visa row on each card.

## Change

City cards now show original recommendation-month ranges and the selected month's historical mean in °C. The annual link opens a native dialog containing all 12 months and the original recommendation labels. Without dialog support or JavaScript, it remains an ordinary city-season link. Missing temperature stays “资料待补”; 0°C remains valid.

Entry conditions move to an explicit filter entry and existing city details. Compact list mode retains its entry reference. Old `preset=visa` links remain compatible without presenting entry conditions as a sorting priority.

## Local evidence

- Complete Node 24 check: **463 passed, 0 failed**.
- Production configuration dry run: passed.
- Browser widths 320, 390 and 1440px: no horizontal overflow.
- Fukuoka in October: `3—5月、10—11月`, `20.6°C`; January changes to `6.7°C`.
- No month-height bars or visible visa footer in card mode. List mode retains the entry reference.
- Annual table: 12 rows. Escape closes it and returns focus to its link.
- Entry shortcut focuses the existing passport-entry selector. Comparison remains operable.
- Tbilisi's missing climate remains missing.
- No browser page errors during the checked flow.

An independent code review found an unsupported-dialog caching issue. A regression test reproduced the second-click failure; capability validation now happens before caching the element. The regression passes and the reviewer confirmed the fix.

## Release boundary

No ranking mathematics, city facts, production database records, assistant permissions, secrets, or feature flags change. Public fallback pages are rebuilt from the approved public database with the production `/nomads` mount. Production release and screenshot receipts are recorded after deployment.
