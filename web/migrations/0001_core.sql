PRAGMA foreign_keys=ON;
CREATE TABLE countries (
 id TEXT PRIMARY KEY, iso2 TEXT UNIQUE, name_zh TEXT NOT NULL, name_en TEXT NOT NULL,
 region TEXT NOT NULL, subregion TEXT, catalog_scope TEXT NOT NULL,
 currencies TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(currencies)),
 timezones TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(timezones)),
 catalog_source TEXT NOT NULL, checked_at TEXT NOT NULL
);
CREATE TABLE sources (
 id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, publisher TEXT NOT NULL,
 title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('official','operator','secondary','legacy','dataset')),
 license TEXT, accessed_at TEXT NOT NULL
);
CREATE TABLE cities (
 id TEXT PRIMARY KEY, country_id TEXT NOT NULL REFERENCES countries(id), slug TEXT NOT NULL UNIQUE,
 name_zh TEXT NOT NULL, name_en TEXT NOT NULL, region TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
 caveat TEXT NOT NULL DEFAULT '', budget_amount REAL CHECK(budget_amount IS NULL OR budget_amount>0),
 budget_currency TEXT NOT NULL DEFAULT 'USD', budget_basis TEXT NOT NULL,
 budget_source_id TEXT REFERENCES sources(id), budget_checked_at TEXT,
 publication_status TEXT NOT NULL DEFAULT 'draft' CHECK(publication_status IN ('draft','review','published','archived')),
 checked_at TEXT, photo_url TEXT, photo_credit TEXT, photo_source TEXT, featured_order INTEGER NOT NULL DEFAULT 1000
);
CREATE INDEX cities_filter ON cities(region,budget_amount,id);
CREATE INDEX cities_country ON cities(country_id,slug);
CREATE INDEX cities_publication ON cities(publication_status,featured_order);
CREATE TABLE city_months (
 city_id TEXT NOT NULL REFERENCES cities(id), month INTEGER NOT NULL CHECK(month BETWEEN 1 AND 12),
 suitability TEXT NOT NULL CHECK(suitability IN ('recommended','caution','unknown')),
 evidence_note TEXT NOT NULL, source_id TEXT REFERENCES sources(id), checked_at TEXT,
 PRIMARY KEY(city_id,month)
);
CREATE INDEX city_month_filter ON city_months(month,suitability,city_id);
CREATE TABLE metric_definitions (id TEXT PRIMARY KEY,label TEXT NOT NULL,unit TEXT NOT NULL,scope TEXT NOT NULL);
CREATE TABLE metric_observations (
 id TEXT PRIMARY KEY,country_id TEXT NOT NULL REFERENCES countries(id),metric_id TEXT NOT NULL REFERENCES metric_definitions(id),
 value REAL,year INTEGER,missing_reason TEXT,source_id TEXT NOT NULL REFERENCES sources(id),checked_at TEXT NOT NULL,
 UNIQUE(country_id,metric_id,year)
);
CREATE INDEX metric_lookup ON metric_observations(country_id,metric_id,year DESC);
CREATE TABLE ai_availability (
 id TEXT PRIMARY KEY,country_id TEXT NOT NULL REFERENCES countries(id),product TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('listed','not_listed','conditional','unknown')),detail TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES sources(id),checked_at TEXT NOT NULL, tested INTEGER NOT NULL DEFAULT 0 CHECK(tested IN (0,1)),
 UNIQUE(country_id,product)
);
CREATE TABLE visa_programs (
 id TEXT PRIMARY KEY,country_id TEXT NOT NULL REFERENCES countries(id),name TEXT NOT NULL,kind TEXT NOT NULL,
 stay_text TEXT NOT NULL,amount REAL,currency TEXT,financial_basis TEXT NOT NULL,financial_rule TEXT NOT NULL,
 work_scope TEXT NOT NULL,passport_scope TEXT NOT NULL,restriction TEXT NOT NULL,verification TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES sources(id),source_published_at TEXT,effective_at TEXT,checked_at TEXT NOT NULL
);
CREATE INDEX visa_country ON visa_programs(country_id);
CREATE TABLE visa_observations (
 id TEXT PRIMARY KEY,country_id TEXT NOT NULL REFERENCES countries(id),provider TEXT NOT NULL,scheme TEXT NOT NULL,
 provider_status TEXT,payload TEXT NOT NULL CHECK(json_valid(payload)),source_id TEXT NOT NULL REFERENCES sources(id),checked_at TEXT NOT NULL
);
CREATE INDEX visa_observation_country ON visa_observations(country_id,provider);
CREATE TABLE workspace_quotes (
 id TEXT PRIMARY KEY,country_id TEXT NOT NULL REFERENCES countries(id),city_id TEXT REFERENCES cities(id),place_label TEXT NOT NULL,
 operator TEXT NOT NULL,plan TEXT NOT NULL,amount REAL NOT NULL CHECK(amount>=0),currency TEXT NOT NULL,period TEXT NOT NULL,
 access_hours TEXT NOT NULL,network_claim TEXT NOT NULL,restriction TEXT NOT NULL,validity TEXT NOT NULL,
 source_id TEXT NOT NULL REFERENCES sources(id),checked_at TEXT NOT NULL
);
CREATE INDEX quotes_city ON workspace_quotes(city_id);
CREATE TABLE editorial_pages (
 id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,kind TEXT NOT NULL CHECK(kind IN ('comparison','guide')),
 title TEXT NOT NULL,summary TEXT NOT NULL,body_json TEXT NOT NULL CHECK(json_valid(body_json)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','archived')),
 reviewed_at TEXT,updated_at TEXT NOT NULL
);
CREATE TABLE editorial_cities (
 page_id TEXT NOT NULL REFERENCES editorial_pages(id),city_id TEXT NOT NULL REFERENCES cities(id),position INTEGER NOT NULL,
 PRIMARY KEY(page_id,city_id)
);
CREATE TABLE notion_links (
 page_id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,last_edited_at TEXT,payload_hash TEXT NOT NULL
);
CREATE TABLE import_runs (id TEXT PRIMARY KEY,started_at TEXT NOT NULL,input_hashes TEXT NOT NULL CHECK(json_valid(input_hashes)),summary TEXT NOT NULL CHECK(json_valid(summary)));
CREATE TABLE content_documents (
 id TEXT PRIMARY KEY,source_page_id TEXT NOT NULL,revision_hash TEXT NOT NULL,
 title TEXT NOT NULL,body_markdown TEXT NOT NULL,imported_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','archived')),
 UNIQUE(source_page_id,revision_hash)
);
