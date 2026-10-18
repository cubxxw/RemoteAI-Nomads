CREATE TABLE score_models (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, default_weights TEXT NOT NULL CHECK(json_valid(default_weights)),
 formula_note TEXT NOT NULL, max_score REAL NOT NULL, snapshot_date TEXT NOT NULL
);
CREATE TABLE city_scores (
 city_id TEXT PRIMARY KEY REFERENCES cities(id), model_id TEXT NOT NULL REFERENCES score_models(id),
 safety REAL CHECK(safety BETWEEN 0 AND 10), cost REAL CHECK(cost BETWEEN 0 AND 10),
 climate REAL CHECK(climate BETWEEN 0 AND 10), life REAL CHECK(life BETWEEN 0 AND 10),
 internet REAL CHECK(internet BETWEEN 0 AND 10), community REAL CHECK(community BETWEEN 0 AND 10),
 original_metric_score REAL CHECK(original_metric_score BETWEEN 0 AND 10.5),
 community_label TEXT, why_short TEXT NOT NULL, evidence_level TEXT NOT NULL DEFAULT 'legacy',
 checked_at TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id)
);
CREATE INDEX city_scores_default ON city_scores(original_metric_score DESC,city_id);
CREATE TABLE city_entry_conditions (
 city_id TEXT NOT NULL REFERENCES cities(id), passport TEXT NOT NULL DEFAULT 'CN',
 entry_type TEXT NOT NULL CHECK(entry_type IN ('visa_free','evisa','arrival','visa_required','permit','unavailable','domestic','unknown')),
 label TEXT NOT NULL, detail TEXT NOT NULL, evidence_level TEXT NOT NULL DEFAULT 'legacy',
 checked_at TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), PRIMARY KEY(city_id,passport)
);
CREATE INDEX entry_filter ON city_entry_conditions(passport,entry_type,city_id);
CREATE TABLE city_locations (
 city_id TEXT PRIMARY KEY REFERENCES cities(id), latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180), timezone TEXT,
 geonames_id INTEGER, match_method TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id),checked_at TEXT NOT NULL
);
CREATE TABLE city_climate_months (
 city_id TEXT NOT NULL REFERENCES cities(id), month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
 mean_c REAL, high_c REAL, rain_mm REAL, sample_days INTEGER NOT NULL,
 period_start TEXT NOT NULL, period_end TEXT NOT NULL, model TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES sources(id),checked_at TEXT NOT NULL, PRIMARY KEY(city_id,month)
);
CREATE INDEX climate_month_filter ON city_climate_months(month,mean_c,city_id);
