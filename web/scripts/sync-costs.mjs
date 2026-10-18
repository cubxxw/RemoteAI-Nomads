import { DatabaseSync } from 'node:sqlite';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { syncCosts, syncFx } from '../src/cost-sync.js';
import { readCityCosts, readFxRate } from '../src/cost-data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply'), fxOnly = process.argv.includes('--fx-only');
const folder = path.join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
const files = (await readdir(folder)).filter(n => n.endsWith('.sqlite') && n !== 'metadata.sqlite');
const requested = process.argv.find(s => s.startsWith('--database='))?.slice('--database='.length);
if (!requested && files.length !== 1) throw Error('Specify --database=/absolute/path.sqlite when local D1 is ambiguous');
const databasePath = requested || path.join(folder, files[0]);
const database = new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const migration = await readFile(path.join(root, 'migrations/0003_cost_sources.sql'), 'utf8');
const migrated = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cost_observations'").get();
if (!apply && !migrated) {
  // A plan uses a temporary in-memory copy; the real database is untouched.
  console.log('Dry run uses an in-memory copy; pass --apply to migrate and import local D1.');
}
let db = database;
if (!apply) {
  db = new DatabaseSync(':memory:');
  const tables = ['countries','sources','cities'];
  for (const name of tables) {
    const sql = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql;
    db.exec(sql);
    const rows = database.prepare(`SELECT * FROM ${name}`).all();
    if (!rows.length) continue;
    const keys = Object.keys(rows[0]);
    const stmt = db.prepare(`INSERT INTO ${name}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`);
    for (const row of rows) stmt.run(...keys.map(k => row[k]));
  }
  db.exec(migration);
} else if (!migrated) db.exec(migration);
const prepare = (sql, args = []) => ({
  bind(...values) { return prepare(sql, values); },
  async all() { return { results: db.prepare(sql).all(...args) }; },
  async first() { return db.prepare(sql).get(...args) || null; },
  async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; },
});
const env = { DB: { prepare, async batch(statements) {
  db.exec('BEGIN');
  try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
} } };
const output = path.join(root, '.data/costs'); await mkdir(output, { recursive: true });
const artifacts = [];
const options = { async onFetch(url, bytes) {
  const name = new URL(url).hostname.replace(/^www\./, '') + '-' + createHash('sha256').update(url).digest('hex').slice(0, 12) + (url.endsWith('.csv') ? '.csv' : url.endsWith('.xml') ? '.xml' : url.includes('file-download') ? '.xlsx' : url.endsWith('.json') ? '.json' : '.html');
  await writeFile(path.join(output, name), bytes);
  artifacts.push({ url, file: name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
} };
const before = database.prepare('SELECT id,budget_amount,budget_currency,budget_basis FROM cities ORDER BY id').all();
const scoresBefore = database.prepare('SELECT * FROM city_scores ORDER BY city_id').all();
const summary = { apply, started_at: new Date().toISOString() };
if (!fxOnly) summary.costs = await syncCosts(env, options);
try { summary.fx = { ok: true, ...await syncFx(env, options) }; }
catch (error) { summary.fx = { ok: false, error: error.message }; }
const after = database.prepare('SELECT id,budget_amount,budget_currency,budget_basis FROM cities ORDER BY id').all();
summary.original_budgets_unchanged = JSON.stringify(before) === JSON.stringify(after);
summary.original_scores_unchanged = JSON.stringify(scoresBefore) === JSON.stringify(database.prepare('SELECT * FROM city_scores ORDER BY city_id').all());
summary.coverage = db.prepare('SELECT provider,scope,COUNT(*) observations,COUNT(DISTINCT city_id) cities FROM cost_observations GROUP BY provider,scope').all();
summary.fx_example = await readFxRate(env, 'CNY', 'USD');
const sampleCity = db.prepare("SELECT c.id,c.slug FROM cities c WHERE EXISTS(SELECT 1 FROM cost_observations o WHERE o.city_id=c.id AND o.category='housing') ORDER BY CASE WHEN c.slug='chiang-mai' THEN 0 ELSE 1 END,c.slug LIMIT 1").get();
if (sampleCity) {
  const data = await readCityCosts(env, sampleCity.id);
  summary.sample_city = { slug: sampleCity.slug, coverage: data.coverage, housing: data.observations.filter(o => o.category === 'housing').slice(0, 2), reference_total: data.reference_total };
}
summary.artifacts = artifacts;
const report = path.join(output, apply ? 'last-sync.json' : 'last-plan.json');
await writeFile(report, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ apply, costs: Object.fromEntries(Object.entries(summary.costs || {}).map(([provider, r]) => [provider,
  { ok: r.ok, observations: r.observations, inserted: r.inserted, cities: r.cities_with_prices, year: r.year, error: r.error }])),
  fx: summary.fx, coverage: summary.coverage, original_budgets_unchanged: summary.original_budgets_unchanged,
  original_scores_unchanged: summary.original_scores_unchanged, report }, null, 2));
if (db !== database) db.close(); database.close();
if (Object.values(summary.costs || {}).some(s => !s.ok) || !summary.fx.ok) process.exitCode = 1;
