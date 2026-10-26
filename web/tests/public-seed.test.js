import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { bootstrapPublic, EMPTY_TABLES, PUBLIC_TABLES, publicSeedSql, publicSha256, validatePublicDatabase, validatePublicSeed } from '../scripts/bootstrap-public.mjs';
import { buildPublicPages } from '../scripts/build-public-pages.mjs';
import {publishedArticles} from '../src/article-catalog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedPath = join(root, 'data/public-catalog.json.gz');
const compressed = await readFile(seedPath);
const seed = JSON.parse(gunzipSync(compressed));
const withFreshRoot = async callback => {
  const temporary = await mkdtemp(join(tmpdir(), 'nomads-public-seed-test-'));
  try { return await callback(temporary); } finally { await rm(temporary, { recursive: true, force: true }); }
};

test('the distributed seed is bounded, checksummed, and contains only reviewed public rows', () => {
  assert.ok(compressed.length < 1024 * 1024);
  assert.equal(seed.version, 1);
  assert.equal(seed.snapshot_date, '2026-10-18');
  assert.equal(seed.publication.private_notes_exported, 0);
  assert.equal(seed.publication.notion_page_identifiers_exported, 0);
  assert.deepEqual(seed.tables.map(table => table.name), PUBLIC_TABLES);
  assert.ok(EMPTY_TABLES.every(name => !seed.tables.some(table => table.name === name)));
  assert.match(seed.license_notice, /第三方数据许可/);
  assert.equal(validatePublicSeed(seed), publicSeedSql(seed.tables));
  const corrupt = structuredClone(seed);
  corrupt.tables[0].rows[0][0] = 'tampered';
  assert.throws(() => validatePublicSeed(corrupt), /checksum mismatch/);
});

test('a fresh offline bootstrap rebuilds the public database and every fallback page without private inputs', async () => withFreshRoot(async temporary => {
  const result = await bootstrapPublic({ root: temporary, seedPath });
  assert.equal(result.created, true);
  const publicationPath = join(temporary, '.data/release/publication.json');
  const databasePath = join(temporary, '.data/release/published.sqlite');
  const publication = JSON.parse(await readFile(publicationPath));
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    validatePublicDatabase(database, publication);
    assert.equal(database.prepare('SELECT count(*) n FROM cities').get().n, seed.publication.rows.cities);
    assert.equal(database.prepare('SELECT count(*) n FROM countries').get().n, 258);
    for (const table of EMPTY_TABLES) assert.equal(database.prepare('SELECT count(*) n FROM ' + table).get().n, 0);
  } finally { database.close(); }
  assert.deepEqual((await readdir(temporary)).sort(), ['.data']);
  const pages = await buildPublicPages({ databasePath, publicationPath, outputDirectory: join(temporary, 'public/published-pages'), origin: 'https://demo.example.org' });
  const standaloneGuides=publishedArticles().filter(article=>article.assetPath);
  const editorialTable=seed.tables.find(table=>table.name==='editorial_pages');
  const slugColumn=editorialTable.columns.indexOf('slug'),kindColumn=editorialTable.columns.indexOf('kind');
  const seedPaths=new Set(editorialTable.rows.map(row=>'/' +(row[kindColumn]==='comparison'?'compare':'guides')+'/'+row[slugColumn]+'/'));
  const additionalGuides=standaloneGuides.filter(article=>!seedPaths.has(article.path));
  assert.equal(pages.paths.filter(path=>path==='/guides/first-month/').length,1,'Expanded first-month replaces its seeded path without duplication');
  assert.equal(pages.file_count, 11 + seed.publication.rows.cities + seed.publication.rows.countries + seed.publication.rows.editorial_pages + additionalGuides.length);
  assert.equal(pages.paths.length, 10 + seed.publication.rows.cities + seed.publication.rows.countries + seed.publication.rows.editorial_pages + additionalGuides.length);
  assert.equal(pages.all_responses_status, 200);
  assert.equal(pages.private_notes_exported, 0);
  assert.equal(pages.origin, 'https://demo.example.org');
  assert.equal(pages.source_origin, seed.origin);
  const home = await readFile(join(temporary, 'public/published-pages/index.html'), 'utf8');
  assert.ok(home.includes('<link rel="canonical" href="https://demo.example.org/">'));
  const sitemap = await readFile(join(temporary, 'public/published-pages/sitemap.xml'), 'utf8');
  assert.ok(sitemap.includes('https://demo.example.org/cities/'));
  assert.ok(!sitemap.includes('https://nomads.cubxxw.com/'));
  for(const article of standaloneGuides){
    assert.ok(sitemap.includes('https://demo.example.org'+article.path));
    const body=await readFile(join(temporary,'public/published-pages',article.path,'index.html'),'utf8');
    assert.match(body,/<meta name="robots" content="index,follow">/);
  }
  const cm=await readFile(join(temporary,'public/published-pages/cities/chiang-mai/index.html'),'utf8');
  const pg=await readFile(join(temporary,'public/published-pages/cities/penang/index.html'),'utf8');
  assert.match(cm,/href="\/guides\/chiang-mai-monthly-budget\/"/);
  assert.doesNotMatch(cm,/href="\/guides\/penang-monthly-budget\/"/);
  assert.match(pg,/href="\/guides\/penang-monthly-budget\/"/);
  assert.match(pg,/href="\/compare\/chiang-mai-vs-penang\/"/);
}));

test('the public SQL seed applies directly after the checked-in D1 migrations', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON');
    for (const name of (await readdir(join(root, 'migrations'))).filter(name => name.endsWith('.sql')).sort()) database.exec(await readFile(join(root, 'migrations', name), 'utf8'));
    const sql = publicSeedSql(seed.tables);
    assert.ok(sql.startsWith('INSERT INTO '));
    database.exec(sql);
    validatePublicDatabase(database, seed.publication);
  } finally { database.close(); }
});

test('bootstrap is idempotent and refuses to overwrite existing or edited local data', async () => withFreshRoot(async temporary => {
  await bootstrapPublic({ root: temporary, seedPath });
  const databasePath = join(temporary, '.data/release/published.sqlite');
  const before = publicSha256(await readFile(databasePath));
  assert.equal((await bootstrapPublic({ root: temporary, seedPath })).created, false);
  assert.equal(publicSha256(await readFile(databasePath)), before);
  const localSql = join(temporary, '.data/seed.sql');
  await writeFile(localSql, 'user-owned-local-data');
  await assert.rejects(bootstrapPublic({ root: temporary, seedPath }), /modified/);
  assert.equal(await readFile(localSql, 'utf8'), 'user-owned-local-data');
  assert.equal(publicSha256(await readFile(databasePath)), before);
  await withFreshRoot(async another => {
    await mkdir(join(another, '.data/release'), { recursive: true });
    await writeFile(join(another, '.data/release/sentinel'), 'preserve');
    await assert.rejects(bootstrapPublic({ root: another, seedPath }), /preserved/);
    assert.equal(await readFile(join(another, '.data/release/sentinel'), 'utf8'), 'preserve');
  });
}));

test('privacy and publication-state gates reject even an internally rechecksummed unreviewed seed', async () => withFreshRoot(async temporary => {
  const privateSeed = structuredClone(seed);
  privateSeed.publication.private_notes_exported = 1;
  assert.throws(() => validatePublicSeed(privateSeed), /Private notes/);
  const draft = structuredClone(seed);
  const city = draft.tables.find(table => table.name === 'cities');
  city.rows[0][city.columns.indexOf('publication_status')] = 'draft';
  draft.payload_sha256 = publicSha256(JSON.stringify({ schema: draft.schema, tables: draft.tables }));
  draft.seed_sha256 = publicSha256(publicSeedSql(draft.tables));
  const invalidSeedPath = join(temporary, 'draft.json.gz');
  await writeFile(invalidSeedPath, gzipSync(JSON.stringify(draft)));
  await assert.rejects(bootstrapPublic({ root: temporary, seedPath: invalidSeedPath }), /Unpublished cities/);
  assert.deepEqual(await readdir(join(temporary, '.data')), []);
}));
