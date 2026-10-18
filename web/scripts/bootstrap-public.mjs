// Offline bootstrap. Only the reviewed public catalog is imported; no credentials
// or upstream services are read. Existing local data is never replaced implicitly.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readFile, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_ORIGIN = 'https://nomads.cubxxw.com';
export const PUBLIC_TABLES = ['countries', 'sources', 'cities', 'city_months', 'metric_definitions', 'metric_observations', 'ai_availability', 'visa_programs', 'workspace_quotes', 'editorial_pages', 'editorial_cities', 'score_models', 'city_scores', 'city_entry_conditions', 'city_locations', 'city_climate_months', 'cost_observations', 'fx_rates', 'geo_areas', 'city_geo_areas', 'regional_reference_observations'];
export const EMPTY_TABLES = ['notion_links', 'content_documents', 'import_runs', 'visa_observations', 'cost_sync_runs', 'agent_admissions'];
const ALL_TABLES = new Set([...PUBLIC_TABLES, ...EMPTY_TABLES]);
export const publicSha256 = value => createHash('sha256').update(value).digest('hex');
const quoteIdentifier = value => '"' + value.replaceAll('"', '""') + '"';
const literal = value => {
  if (value === null) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  assert.equal(typeof value, 'string', 'Only JSON text, numbers, and null belong in the public seed');
  assert.ok(!value.includes('\0'), 'NUL bytes are not supported in the public SQL seed');
  return "'" + value.replaceAll("'", "''") + "'";
};

export function publicSeedSql(tables) {
  assert.deepEqual(tables.map(table => table.name), PUBLIC_TABLES, 'Public table order/allowlist does not match');
  return tables.flatMap(table => {
    assert.ok(Array.isArray(table.columns) && table.columns.length && table.columns.every(column => typeof column === 'string' && /^[a-z][a-z0-9_]*$/iu.test(column)), 'Invalid public column names');
    assert.ok(Array.isArray(table.rows), 'Public rows are required');
    const prefix = 'INSERT INTO ' + quoteIdentifier(table.name) + ' (' + table.columns.map(quoteIdentifier).join(',') + ') VALUES (';
    return table.rows.map(row => {
      assert.ok(Array.isArray(row) && row.length === table.columns.length, 'Public row shape does not match');
      return prefix + row.map(literal).join(',') + ');';
    });
  }).join('\n') + '\n';
}

export function validatePublicPublication(report) {
  assert.equal(report.origin, PUBLIC_ORIGIN, 'Unexpected public catalog origin');
  assert.equal(report.private_notes_exported, 0, 'Private notes may not enter a public seed');
  assert.equal(report.notion_page_identifiers_exported, 0, 'Notion identifiers may not enter a public seed');
  assert.ok(report.rows && PUBLIC_TABLES.every(table => Number.isSafeInteger(report.rows[table]) && report.rows[table] >= 0), 'Reviewed publication row counts are required');
}

export function validatePublicDatabase(database, report) {
  validatePublicPublication(report);
  const actualTables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => row.name);
  assert.deepEqual(new Set(actualTables), ALL_TABLES, 'Unexpected tables are outside the public release boundary');
  assert.deepEqual(database.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok']);
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0, 'Public catalog foreign keys are invalid');
  for (const table of PUBLIC_TABLES) assert.equal(database.prepare('SELECT count(*) n FROM ' + quoteIdentifier(table)).get().n, report.rows[table], 'Publication row count differs: ' + table);
  for (const table of EMPTY_TABLES) assert.equal(database.prepare('SELECT count(*) n FROM ' + quoteIdentifier(table)).get().n, 0, 'Private/runtime records must remain empty: ' + table);
  assert.equal(database.prepare("SELECT count(*) n FROM cities WHERE publication_status!='published' OR publication_status IS NULL").get().n, 0, 'Unpublished cities cannot be exported');
  assert.equal(database.prepare("SELECT count(*) n FROM editorial_pages WHERE status!='published' OR status IS NULL").get().n, 0, 'Unpublished editorial pages cannot be exported');
  assert.equal(database.prepare("SELECT count(*) n FROM sources WHERE lower(url) LIKE '%notion.so/%' OR lower(url) LIKE '%notion.com/%'").get().n, 0, 'Private source links cannot be exported');
}

export function validatePublicSeed(seed) {
  assert.equal(seed.version, 1, 'Unsupported public seed version');
  assert.equal(seed.origin, PUBLIC_ORIGIN);
  assert.match(seed.snapshot_date, /^\d{4}-\d{2}-\d{2}$/u);
  validatePublicPublication(seed.publication);
  assert.ok(Array.isArray(seed.schema) && seed.schema.length, 'Public schema is missing');
  assert.equal(new Set(seed.schema.map(item => item.type + ':' + item.name)).size, seed.schema.length, 'Duplicate public schema records are not allowed');
  assert.deepEqual(new Set(seed.schema.filter(item => item.type === 'table').map(item => item.name)), ALL_TABLES, 'Only the reviewed tables may be reconstructed');
  for (const item of seed.schema) {
    assert.ok(ALL_TABLES.has(item.table) && typeof item.sql === 'string');
    if (item.type === 'table') assert.match(item.sql, /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?[a-z_][a-z0-9_]*/iu);
    else { assert.equal(item.type, 'index'); assert.match(item.sql, /^CREATE\s+(?:UNIQUE\s+)?INDEX\b/iu); }
  }
  const seedSql = publicSeedSql(seed.tables);
  const payload = JSON.stringify({ schema: seed.schema, tables: seed.tables });
  assert.equal(publicSha256(payload), seed.payload_sha256, 'Public seed content checksum mismatch');
  assert.equal(publicSha256(seedSql), seed.seed_sha256, 'Public SQL checksum mismatch');
  assert.ok(!/https?:\/\/[^\s"'<>]*notion\.(?:so|com)\//iu.test(payload), 'Private Notion source remains');
  assert.ok(!/\bsk-[a-zA-Z0-9_-]{20,}/u.test(payload), 'Credential-shaped content remains');
  assert.ok(!/\/(?:Users\/|var\/folders\/)/u.test(payload), 'Private filesystem path remains');
  return seedSql;
}

export async function bootstrapPublic({ root = ROOT, seedPath = join(root, 'data/public-catalog.json.gz') } = {}) {
  const compressed = await readFile(seedPath);
  assert.ok(compressed.length <= 8 * 1024 * 1024, 'Public seed compressed size exceeds the safety limit');
  const seed = JSON.parse(gunzipSync(compressed, { maxOutputLength: 64 * 1024 * 1024 }));
  const seedSql = validatePublicSeed(seed), artifactHash = publicSha256(compressed);
  const target = join(root, '.data/release'), seedSqlPath = join(root, '.data/seed.sql');
  let existing;
  try { existing = JSON.parse(await readFile(join(target, 'publication.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing?.public_seed_sha256 === artifactHash) {
    const database = new DatabaseSync(join(target, 'published.sqlite'), { readOnly: true });
    try { validatePublicDatabase(database, seed.publication); } finally { database.close(); }
    assert.equal(publicSha256(await readFile(seedSqlPath)), seed.seed_sha256, 'The existing SQL seed was modified; use a fresh workspace rather than overwriting it');
    return { created: false, snapshot_date: seed.snapshot_date, public_seed_sha256: artifactHash, rows: seed.publication.rows };
  }
  for (const path of [target, seedSqlPath]) {
    try { await stat(path); throw new Error('Existing local release or SQL seed is preserved. Bootstrap the public catalog in a fresh checkout.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await mkdir(join(root, '.data'), { recursive: true });
  const staging = await mkdtemp(join(root, '.data/public-bootstrap-'));
  let database;
  try {
    const databasePath = join(staging, 'published.sqlite');
    database = new DatabaseSync(databasePath);
    database.exec('PRAGMA foreign_keys=ON');
    // prepare().run() executes exactly one reviewed schema statement each.
    for (const item of seed.schema) database.prepare(item.sql).run();
    database.exec('BEGIN');
    try { database.exec(seedSql); database.exec('COMMIT'); }
    catch (error) { database.exec('ROLLBACK'); throw error; }
    validatePublicDatabase(database, seed.publication);
    database.close(); database = null;
    const publication = { ...seed.publication, snapshot_date: seed.snapshot_date, snapshot_date_basis: seed.snapshot_date_basis,
      public_seed_sha256: artifactHash, source_db_sha256: seed.source_db_sha256, sql_sha256: seed.seed_sha256, bytes: Buffer.byteLength(seedSql), license_notice: seed.license_notice };
    await writeFile(join(staging, 'publication.json'), JSON.stringify(publication, null, 2) + '\n');
    await writeFile(join(staging, 'seed.sql'), seedSql);
    const sourceDate = new Date(seed.snapshot_date + 'T00:00:00Z');
    await utimes(databasePath, sourceDate, sourceDate);
    await rename(join(staging, 'seed.sql'), seedSqlPath);
    await rename(staging, target);
    return { created: true, snapshot_date: seed.snapshot_date, public_seed_sha256: artifactHash, rows: seed.publication.rows };
  } finally {
    database?.close();
    await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(await bootstrapPublic(), null, 2));
