# Complete climate references and redesign city sharing

The user requested that missing city information be proactively researched/generated and that city sharing adopt a richer city-name-card structure. The preference was saved separately; this implementation must reach the actual website.

## Deliverables

- Complete the 192 missing historical-climate city records from documented public reanalysis sources, resolving the eight missing locations with supported identities. Preserve the existing 158 ERA5 cities and original recommendation labels.
- Keep the 2023–2025 period, units, sample coverage, source URL and actual model. Where another reanalysis provider is used, identify it accurately instead of calling it ERA5. Respect provider quotas and cache duplicate grid cells.
- Generate one public city profile for each of 350 catalog cities: geography and useful sourced identity, plus optional scoped/datable statistics, landmarks, food and culture. Unavailable optional population/GDP must not become invented exact facts.
- Redesign city sharing around the genuine photo, Chinese/foreign name, short editorial line, geography/core facts, tags, landmarks and culture. Fetch one profile lazily when sharing. Keep captions, photo credits, QR, private-data controls and travel advisories.

## Ownership and integration

Climate collection produces a source/cache report and an incremental SQL proposal without production writes. City-profile collection owns the public JSON pack and repeatable generator. Sharing owns the pure model, renderer and dialog. The parent owns climate provenance through server/client views, public-seed integrity, production backup/application and final release verification.

## Verification and release

1. Verify collected climate counts, completeness, units, source models and preserved records. Apply only insertions into a backed-up reviewed public snapshot, update the publication manifest and export the reproducible public seed.
2. Validate all 350 profiles, identity scopes, source URLs and optional fields. Test the new renderer across long and partial profiles and supported image formats, retaining advisories and caption provenance.
3. Run the complete existing suite and production build. Inspect actual La Paz and Pokhara share exports at their real pixel dimensions and mobile/desktop dialogs.
4. Review and merge the bounded changes, then apply the audited incremental climate SQL to the backed-up production database. Rebuild the public fallback, deploy through the existing Worker and preserve feature flags/secrets.
5. Read back production climate coverage and the selected city values, export actual production city-name cards, verify saving/copying/QR and capture the final release receipt. A standalone preview is not completion.

Other legacy budget and experience scores remain their original records in this change; the missing-data preference does not authorize mislabelling generated numbers as observations. This release fills the historical-climate gaps shown by the user and makes city-profile sharing capable of richer, source-backed content.
