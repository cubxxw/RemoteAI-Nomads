-- Source observations are append-only; imported prices never replace editorial budgets/scores.
CREATE TABLE cost_sync_runs (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('ok','partial','failed')),
 summary TEXT NOT NULL CHECK(json_valid(summary))
);
CREATE INDEX cost_sync_provider ON cost_sync_runs(provider,finished_at DESC);
CREATE TABLE cost_observations (
 id TEXT PRIMARY KEY, provider TEXT NOT NULL,
 city_id TEXT REFERENCES cities(id), country_id TEXT NOT NULL REFERENCES countries(id),
 scope TEXT NOT NULL CHECK(scope IN ('city','national')),
 category TEXT NOT NULL, field TEXT NOT NULL, label TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>=0), currency TEXT NOT NULL CHECK(length(currency)=3),
 period TEXT NOT NULL, unit TEXT NOT NULL,
 household_size INTEGER CHECK(household_size IS NULL OR household_size>0),
 sample_start TEXT NOT NULL, sample_end TEXT NOT NULL, sample_size INTEGER,
 min_amount REAL, max_amount REAL,
 quality TEXT NOT NULL CHECK(quality IN ('sample','official_reference','review')),
 quality_flags TEXT NOT NULL CHECK(json_valid(quality_flags)),
 detail TEXT NOT NULL CHECK(json_valid(detail)),
 source_id TEXT NOT NULL REFERENCES sources(id), checked_at TEXT NOT NULL,
 payload_hash TEXT NOT NULL UNIQUE,
 CHECK((scope='city' AND city_id IS NOT NULL) OR (scope='national' AND city_id IS NULL)),
 CHECK(sample_end>=sample_start)
);
CREATE INDEX cost_city_latest ON cost_observations(city_id,provider,field,sample_end DESC,checked_at DESC);
CREATE INDEX cost_country_latest ON cost_observations(country_id,scope,provider,field,sample_end DESC,checked_at DESC);
CREATE TABLE fx_rates (
 id TEXT PRIMARY KEY, base TEXT NOT NULL, quote TEXT NOT NULL, rate REAL NOT NULL CHECK(rate>0),
 rate_date TEXT NOT NULL, source_id TEXT NOT NULL REFERENCES sources(id), checked_at TEXT NOT NULL,
 UNIQUE(base,quote,rate_date,rate)
);
CREATE INDEX fx_latest ON fx_rates(base,quote,rate_date DESC,checked_at DESC);
