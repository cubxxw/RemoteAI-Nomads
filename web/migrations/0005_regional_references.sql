-- Regional statistics retain their real geography; never masquerade as city quotes.
CREATE TABLE geo_areas (
 id TEXT PRIMARY KEY, country_id TEXT NOT NULL REFERENCES countries(id),
 parent_id TEXT REFERENCES geo_areas(id), name_zh TEXT NOT NULL,
 level TEXT NOT NULL CHECK(level IN ('province','prefecture','city','county','town','neighborhood')),
 source_id TEXT NOT NULL REFERENCES sources(id), checked_at TEXT NOT NULL
);
CREATE TABLE city_geo_areas (
 city_id TEXT NOT NULL REFERENCES cities(id), area_id TEXT NOT NULL REFERENCES geo_areas(id),
 relation TEXT NOT NULL CHECK(relation IN ('identity','regional_context')),
 PRIMARY KEY(city_id,area_id)
);
CREATE TABLE regional_reference_observations (
 id TEXT PRIMARY KEY, area_id TEXT NOT NULL REFERENCES geo_areas(id), provider TEXT NOT NULL,
 category TEXT NOT NULL, field TEXT NOT NULL, label TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>=0), currency TEXT NOT NULL CHECK(length(currency)=3),
 unit TEXT NOT NULL, period TEXT NOT NULL,
 population_scope TEXT NOT NULL, market_type TEXT NOT NULL,
 sample_start TEXT NOT NULL, sample_end TEXT NOT NULL, published_at TEXT,
 source_id TEXT NOT NULL REFERENCES sources(id), source_locator TEXT NOT NULL,
 checked_at TEXT NOT NULL, payload_hash TEXT NOT NULL,
 CHECK(sample_end>=sample_start),
 UNIQUE(area_id,provider,field,sample_start,sample_end,payload_hash)
);
CREATE INDEX regional_area_latest ON regional_reference_observations(area_id,provider,field,sample_end DESC,checked_at DESC);
CREATE INDEX city_geo_by_area ON city_geo_areas(area_id,city_id);
