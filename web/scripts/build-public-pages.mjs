// Build an outage fallback exclusively from the reviewed public release database.
// This script never opens development configuration, credentials, or live D1.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import worker from '../src/worker.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://nomads.cubxxw.com';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const EXCLUDED_TABLES = ['notion_links', 'content_documents', 'import_runs', 'visa_observations', 'cost_sync_runs', 'agent_admissions'];

export function publicAssetPath(pathname) {
  if (pathname === '/api/rankings') return 'rankings.json';
  if (pathname === '/sitemap.xml') return 'sitemap.xml';
  assert.ok(pathname.startsWith('/') && pathname.endsWith('/'), 'Only canonical public paths can be generated');
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  assert.ok(segments.every(part => part !== '.' && part !== '..' && !/[\\/\0]/u.test(part)), 'Unsafe public path');
  return join(...segments, 'index.html');
}

export function validatePublication(report) {
  assert.equal(report.origin, ORIGIN, 'Publication origin must match the reviewed public site');
  assert.equal(report.private_notes_exported, 0, 'Private notes must not enter public fallback assets');
  assert.equal(report.notion_page_identifiers_exported, 0, 'Notion identifiers must not enter public fallback assets');
  assert.ok(report.rows && report.rows.cities > 0 && report.rows.countries > 0, 'Publication row counts are required');
}

function assertPublicBody(body, pathname) {
  assert.ok(!/https?:\/\/[^\s"'<>]*notion\.(?:so|com)\//iu.test(body), 'Private Notion URL in ' + pathname);
  assert.ok(!/\bsk-[a-zA-Z0-9_-]{20,}/u.test(body), 'Credential-shaped content in ' + pathname);
  assert.ok(!/\/(?:Users\/|var\/folders\/)/u.test(body), 'Private filesystem path in ' + pathname);
}

function readonlyAdapter(database) {
  const prepare = (sql, args = []) => {
    assert.match(sql.trim(), /^(?:SELECT|WITH)\b/iu, 'SSR fallback may only select public snapshot data');
    return {
      bind(...values) { return prepare(sql, values); },
      async all() { return { results: database.prepare(sql).all(...args) }; },
      async first() { return database.prepare(sql).get(...args) || null; },
    };
  };
  return { prepare };
}

export async function buildPublicPages({
  databasePath = join(ROOT, '.data/release/published.sqlite'),
  publicationPath = join(ROOT, '.data/release/publication.json'),
  outputDirectory = join(ROOT, 'public/published-pages'),
  origin = ORIGIN,
} = {}) {
  const targetOrigin = new URL(origin);
  assert.equal(targetOrigin.protocol, 'https:', 'A public release needs an HTTPS site origin');
  assert.equal(targetOrigin.origin, origin, 'Site origin must not contain a path, credentials, query, or fragment');
  assert.equal(targetOrigin.username + targetOrigin.password, '', 'Site origin must not contain credentials');
  const [databaseBytes, publicationBytes, databaseStat] = await Promise.all([
    readFile(databasePath), readFile(publicationPath), stat(databasePath),
  ]);
  const publication = JSON.parse(publicationBytes);
  validatePublication(publication);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  let stagingDirectory, backupDirectory;
  const previousCaches = globalThis.caches;
  try {
    assert.deepEqual(database.prepare('PRAGMA integrity_check').all().map(row => row.integrity_check), ['ok']);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length, 0, 'Public database foreign keys are invalid');
    const cities = database.prepare("SELECT slug,photo_credit,photo_source FROM cities WHERE publication_status='published' ORDER BY slug").all();
    const countries = database.prepare('SELECT id FROM countries ORDER BY id').all();
    const articles = database.prepare("SELECT slug,kind FROM editorial_pages WHERE status='published' ORDER BY kind,slug").all();
    assert.equal(cities.length, publication.rows.cities);
    assert.equal(countries.length, publication.rows.countries);
    assert.equal(articles.length, publication.rows.editorial_pages);
    assert.equal(database.prepare("SELECT count(*) n FROM cities WHERE publication_status!='published' OR publication_status IS NULL").get().n, 0, 'The input database must contain published cities only');
    assert.equal(database.prepare("SELECT count(*) n FROM editorial_pages WHERE status!='published' OR status IS NULL").get().n, 0, 'The input database must contain published editorial pages only');
    assert.equal(database.prepare("SELECT count(*) n FROM sources WHERE lower(url) LIKE '%notion.so/%' OR lower(url) LIKE '%notion.com/%'").get().n, 0, 'The input database contains private source links');
    for (const table of EXCLUDED_TABLES) assert.equal(database.prepare('SELECT count(*) n FROM "' + table + '"').get().n, 0, 'Excluded table is not empty: ' + table);
    assert.ok(articles.every(article => ['guide', 'comparison'].includes(article.kind)), 'Unknown editorial kind must not be published automatically');

    const paths = [
      '/', '/cities/', '/countries/', '/guides/', '/compare/', '/about/',
      ...cities.map(city => '/cities/' + encodeURIComponent(city.slug) + '/'),
      ...countries.map(country => '/countries/' + encodeURIComponent(country.id.toLowerCase()) + '/'),
      ...articles.map(article => '/' + (article.kind === 'comparison' ? 'compare' : 'guides') + '/' + encodeURIComponent(article.slug) + '/'),
      '/api/rankings', '/sitemap.xml',
    ];
    assert.equal(new Set(paths).size, paths.length, 'Public path collision');
    const dbSha = sha256(databaseBytes);
    const env = {
      DB: readonlyAdapter(database), PREVIEW: 'false', SITE_ORIGIN: origin,
      // Used only to isolate the in-process catalog cache. It is not published.
      RELEASE_ID: 'public-snapshot-build-' + dbSha,
    };
    globalThis.caches = { default: { async match() { return undefined; }, async put() {} } };
    await mkdir(dirname(outputDirectory), { recursive: true });
    stagingDirectory = await mkdtemp(outputDirectory + '.building-');
    let bytes = 0;
    for (const pathname of paths) {
      const response = await worker.fetch(new Request(origin + pathname), env, { waitUntil() {} });
      assert.equal(response.status, 200, 'SSR fallback did not return 200: ' + pathname);
      assert.equal(response.headers.get('Set-Cookie'), null, 'Personal session data must not enter public assets');
      let body = await response.text();
      if (pathname === '/api/rankings') {
        const ranking = JSON.parse(body), published = new Set(cities.map(city => city.slug));
        assert.equal(ranking.length, cities.length);
        assert.ok(ranking.every(city => published.has(city.slug) && !('notes' in city) && !('notion_links' in city) && !('id' in city)), 'Rankings must contain only the public catalog');
        const credits = new Map(cities.map(city => [city.slug, city]));
        body = JSON.stringify(ranking.map(city => ({ ...city, photoCredit: credits.get(city.slug).photo_credit, photoSource: credits.get(city.slug).photo_source })));
      } else if (pathname.endsWith('/')) {
        assert.match(response.headers.get('Content-Type'), /^text\/html/u);
        assert.match(body, /<h1[\s>]/u, 'A generated page has no primary heading: ' + pathname);
      }
      assertPublicBody(body, pathname);
      const target = join(stagingDirectory, publicAssetPath(pathname));
      assert.ok(target.startsWith(stagingDirectory + sep), 'Asset escaped the output directory');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, body);
      bytes += Buffer.byteLength(body);
    }
    const manifest = {
      version: 1,
      origin,
      source_origin: publication.origin,
      generated_at: new Date().toISOString(),
      snapshot_date: databaseStat.mtime.toISOString().slice(0, 10),
      snapshot_date_basis: 'published database file mtime; source observation dates are retained in page content',
      db_sha256: dbSha,
      publication_sha256: sha256(publicationBytes),
      private_notes_exported: 0,
      notion_page_identifiers_exported: 0,
      published_only: true,
      all_responses_status: 200,
      counts: { cities: cities.length, countries: countries.length, guides: articles.filter(article => article.kind === 'guide').length, comparisons: articles.filter(article => article.kind === 'comparison').length },
      file_count: paths.length + 1,
      bytes_excluding_manifest: bytes,
      paths,
    };
    const manifestText = JSON.stringify(manifest, null, 2) + '\n';
    assertPublicBody(manifestText, '/manifest.json');
    await writeFile(join(stagingDirectory, 'manifest.json'), manifestText);
    try {
      await stat(outputDirectory);
      backupDirectory = outputDirectory + '.previous-' + process.pid;
      await rename(outputDirectory, backupDirectory);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(stagingDirectory, outputDirectory); stagingDirectory = null; }
    catch (error) { if (backupDirectory) { await rename(backupDirectory, outputDirectory); backupDirectory = null; } throw error; }
    if (backupDirectory) { await rm(backupDirectory, { recursive: true }); backupDirectory = null; }
    return { ...manifest, total_bytes: bytes + Buffer.byteLength(manifestText) };
  } finally {
    database.close();
    if (previousCaches === undefined) delete globalThis.caches;
    else globalThis.caches = previousCaches;
    if (stagingDirectory) await rm(stagingDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const originAt = process.argv.indexOf('--origin');
  if (originAt >= 0 && !process.argv[originAt + 1]) throw new Error('--origin needs an HTTPS origin');
  const result = await buildPublicPages(originAt < 0 ? {} : { origin: process.argv[originAt + 1] });
  const { paths, ...summary } = result;
  console.log(JSON.stringify({ ...summary, generated_paths: paths.length }, null, 2));
}
