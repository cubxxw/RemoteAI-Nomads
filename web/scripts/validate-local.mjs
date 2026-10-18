// Read-only integration checks against the actual Wrangler local database.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import worker from "../src/worker.js";
import { loadRankings } from "../src/rank-pages.js";
import { DEFAULT_WEIGHTS, customScore } from "../public/modules/ranking.js";
const folder = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const name = readdirSync(folder).find(
  (n) => n.endsWith(".sqlite") && n !== "metadata.sqlite",
);
assert.ok(name, "Run the local database migration and seed first");
const db = new DatabaseSync(folder + "/" + name, { readOnly: true });
function prepare(sql, args = []) {
  return {
    bind(...next) {
      return prepare(sql, next);
    },
    async all() {
      return { results: db.prepare(sql).all(...args) };
    },
    async first() {
      return db.prepare(sql).get(...args) || null;
    },
  };
}
const DB = { prepare };
globalThis.caches = {
  default: {
    async match() {
      return undefined;
    },
    async put() {},
  },
};
const env = { DB, PREVIEW: "true", SITE_ORIGIN: "http://127.0.0.1:8787" };
const request = (path, extra = {}) =>
  worker.fetch(
    new Request(env.SITE_ORIGIN + path),
    { ...env, ...extra },
    { waitUntil() {} },
  );
const counts = {};
for (const table of [
  "countries",
  "cities",
  "city_scores",
  "city_entry_conditions",
  "city_locations",
  "city_climate_months",
  "content_documents",
])
  counts[table] = db.prepare("SELECT count(*) n FROM " + table).get().n;
assert.deepEqual(
  db
    .prepare("PRAGMA integrity_check")
    .all()
    .map((x) => x.integrity_check),
  ["ok"],
);
assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
const data = await loadRankings(env),
  complete = data.filter((c) => customScore(c, DEFAULT_WEIGHTS) !== null);
assert.equal(data.length, 348);
assert.equal(complete.length, 224);
for (const c of complete)
  assert.equal(customScore(c, DEFAULT_WEIGHTS), c.baseScore, c.slug);
assert.ok(
  data.every((c) => !("id" in c) && !("notes" in c) && !("notion_links" in c)),
);
const routes = [
  "/",
  "/cities/",
  "/cities/?q=New+York",
  "/compare/chiang-mai-vs-penang/",
  "/compare/",
  "/about/",
  "/countries/",
  "/countries/jp/",
  "/guides/",
];
for (const path of routes) {
  const r = await request(path);
  assert.equal(r.status, 200, path);
  const html = await r.text();
  assert.match(html, /<h1>/, path);
  assert.match(html, /noindex,follow/, path);
}
// Every imported city page must still render after the schema and climate changes.
for (const c of data) {
  const r = await request("/cities/" + c.slug + "/");
  assert.equal(r.status, 200, c.slug);
}
const canonical = await request("/compare/penang-vs-chiang-mai/");
assert.equal(canonical.status, 308);
assert.ok(
  canonical.headers.get("location").endsWith("/compare/chiang-mai-vs-penang/"),
);
assert.equal((await request("/cities/not-a-real-city/")).status, 404);
assert.deepEqual(
  await (await request("/api/rankings", { PREVIEW: "false" })).json(),
  [],
);
for (const path of [
  "/cities/sapporo/",
  "/compare/chiang-mai-vs-penang/",
  "/guides/first-month/",
])
  assert.equal((await request(path, { PREVIEW: "false" })).status, 404, path);
assert.ok(!(await (await request("/sitemap.xml")).text()).includes("<loc>"));
assert.ok(
  (await (await request("/robots.txt")).text()).includes("Disallow: /"),
);
assert.ok(
  !(
    await (await request("/sitemap.xml", { PREVIEW: "false" })).text()
  ).includes("sapporo"),
);
const summary = {
  counts,
  complete_scores: complete.length,
  climate_cities: db
    .prepare("SELECT count(DISTINCT city_id) n FROM city_climate_months")
    .get().n,
  photos: data.filter((c) => c.photo).length,
  default_scores_equal: true,
  city_pages_checked: data.length,
  core_routes: routes.length,
  integrity: "ok",
  foreign_keys: 0,
  production_drafts_excluded: true,
  database_bytes: statSync(folder + "/" + name).size,
};
writeFileSync(
  ".data/ranking/integration-check.json",
  JSON.stringify(summary, null, 2),
);
console.log(JSON.stringify(summary));
db.close();
