# City profiles, sharing and climate completion — 2026-10-27

## Data changes

The reviewed public snapshot now has complete 2023–2025 historical climate for 350 cities: 4200 monthly records, including 2304 new records for the 192 previously missing cities. The original 158 cities retain every original value and source. Eight missing representative locations were resolved with country/administrative identity checks.

The resulting mix is 184 ERA5 cities and 166 NASA POWER / MERRA-2 cities. The source model is carried into ranking transport and annual tables. Mountain/coastal grid limitations remain visible in the source description. A terrain review replaced the flagged coarse-grid cases with ERA5 rather than silently adjusting temperatures. Prices, experience scores and original recommended-month labels are unchanged.

The incremental SQL has SHA256 `ad3a126eb9b0bc734aef09d65cc8bab4b8490482c76604ee9c83be2a3cf2a1a4`. Independent in-memory validation checked existing records, unrelated tables, recommendation labels, foreign keys and idempotence. A private production backup precedes the write. The public seed remains below 1 MiB and preserves the publication/privacy gates.

## Sharing changes

Each of 350 cities has a separate public profile loaded only when its share dialog is opened. The image uses a genuine existing photo, Chinese/foreign name, a short editorial line, geography and available core data, tags, landmarks and culture. Optional unavailable statistics are omitted rather than displayed as filler or invented measurements.

Local-detail coverage is deliberately explicit: 137 local taglines, 140 profiles with named landmarks, 121 with culture and 13 with specific food. All 350 have sourced basic geography, language, currency, coordinates and timezone. The template adapts to available sections; this is not a claim that every city has researched landmarks or GDP. Pokhara population retains the 2021 metropolitan-area/33-ward scope; the municipal source was available through its indexed official summary, with independent census-derived corroboration, while direct page retrieval timed out.

Full references, dates, population scope and photo attribution remain in the caption. Country-level CLDR language data is labelled as national/regional in the image. Official travel advisories repeat on every exported page. Public profiles cannot silently attach to private plans or a different city slug.

## Validation

- Complete Node 24 check: **481 passed, 0 failed**.
- Python source/completeness/identity guards: **10 passed**.
- Real Chromium canvas exports: 350 November city images plus October Pokhara and La Paz; all one 1080×1440 image, with no block or measured-glyph overflow, missing photo/QR, or placeholder text. The per-profile and catalog hashes are recorded locally.
- Actual Worker/browser flow: La Paz `11.7°C`, Pokhara `17.2°C` for November; 12-row annual tables; correct model provenance; one lazy profile request; successful image download and photo/text switching; caption landmarks/food/sources retained; no mobile horizontal overflow or page errors.
- Independent review confirmed and closed the language-scope issue. Subsequent rendering retained genuinely city-scoped labels.

The source-research cache and raw article/API responses remain local and ignored. Public source excerpts are limited to short factual validation anchors, not copied articles. Production release IDs, remote counts and actual production export images are recorded after deployment.
