# Search discovery corrections

The 2026-10-26 Search Console review found 191 impressions and 3 clicks for October 18–24. The domain has 317 indexed URLs and 521 excluded URLs in a delayed indexing report. The Nomads sitemap is successful and exposes 421 pages. Most exclusions sampled are intentional country or filter pages. These counts do not establish a ranking defect or a title experiment winner.

The live city renderer allows month query variants to be indexed, although guide, ranking, comparison and outage responses suppress those variants. The default ranking exposes 40 cities, with month-bearing links. A permanent directory will provide direct links to all published cities without requiring filters or JavaScript.

## Approach

Correct the inconsistent query policy at the common database page response boundary. Keep the existing clean canonical and selected month behavior. Apply the same response header and cache policy during database outages. Preserve existing guide publication gates.

Add `/destinations/` as a lightweight, server-rendered directory grouped by region and country. Link it from the common footer and ranking notes. Use clean city paths, identify advisory destinations as historical information, and keep country detail pages unindexable. Include the directory in both sitemap and outage generation. Use the existing typography and content-page layout.

A broad title rewrite has too little evidence at present. Opening all country/filter pages to indexing would expose existing thin and duplicate content. Both are deferred.

The full generated-page audit also found 320 cities sharing one description, with only 28 distinct descriptions across 350 cities. Replace the common city description with the actual city/country and the presence or absence of city-scoped consumption observations and usable historical climate. Mention meeting-time conversion only where a timezone exists. Advisory cities retain the advisory in the description. This changes search metadata only, with no new facts or edited source dates.

## Constraints

- No new dependencies or changes to article prose, evidence dates, ranking rules or publication status.
- Preserve mounted `/nomads` paths, legacy redirects, preview noindex, GET/HEAD behavior and unknown-route errors.
- Sitemap URLs must resolve to clean, indexable, self-canonical pages; do not invent modification dates.
- The directory is a catalog, not a recommendation of every listed destination.
- Implementation and local checks do not establish deployment, Google recrawling or search growth.
