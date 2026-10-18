import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicAssetPath, validatePublication, buildPublicPages } from '../scripts/build-public-pages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public/published-pages');
const hash = value => createHash('sha256').update(value).digest('hex');
const artifactAvailable = existsSync(join(output, 'manifest.json')) && existsSync(join(root, '.data/release/published.sqlite'));
const manifest = artifactAvailable ? JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) : null;
const artifactCheck = { skip: artifactAvailable ? false : 'Generate reviewed public-page fallback assets before running artifact checks' };
const files = async directory => (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();

test('public fallback asset names handle canonical roots and encoded country identifiers without traversal', () => {
  assert.equal(publicAssetPath('/'), 'index.html');
  assert.equal(publicAssetPath('/cities/tokyo/'), 'cities/tokyo/index.html');
  assert.equal(publicAssetPath('/countries/legacy%3Asomaliland/'), 'countries/legacy:somaliland/index.html');
  assert.equal(publicAssetPath('/api/rankings'), 'rankings.json');
  assert.equal(publicAssetPath('/sitemap.xml'), 'sitemap.xml');
  for (const path of ['/../', '/cities/%2E%2E/', '/cities/a%2Fb/', '/cities/a%5Cb/', '/cities/%00/', '/api/agent/status']) assert.throws(() => publicAssetPath(path));
});

test('publication privacy gates fail closed before writing public assets', () => {
  const valid = { origin: 'https://nomads.cubxxw.com', rows: { cities: 348, countries: 258 }, private_notes_exported: 0, notion_page_identifiers_exported: 0 };
  assert.doesNotThrow(() => validatePublication(valid));
  assert.throws(() => validatePublication({ ...valid, private_notes_exported: 1 }));
  assert.throws(() => validatePublication({ ...valid, notion_page_identifiers_exported: undefined }));
  assert.throws(() => validatePublication({ ...valid, origin: 'http://localhost' }));
});

test('generated manifest and route set match exactly the reviewed published database', artifactCheck, async () => {
  const database = new DatabaseSync(join(root, '.data/release/published.sqlite'), { readOnly: true });
  try {
    const cityPaths = database.prepare("SELECT slug FROM cities WHERE publication_status='published'").all().map(city => '/cities/' + encodeURIComponent(city.slug) + '/');
    const countryPaths = database.prepare('SELECT id FROM countries').all().map(country => '/countries/' + encodeURIComponent(country.id.toLowerCase()) + '/');
    const articlePaths = database.prepare("SELECT slug,kind FROM editorial_pages WHERE status='published'").all().map(article => '/' + (article.kind === 'comparison' ? 'compare' : 'guides') + '/' + encodeURIComponent(article.slug) + '/');
    const expected = ['/', '/cities/', '/countries/', '/guides/', '/compare/', '/about/', ...cityPaths, ...countryPaths, ...articlePaths, '/api/rankings', '/sitemap.xml'];
    assert.equal(manifest.version, 1);
    assert.deepEqual(new Set(manifest.paths), new Set(expected));
    assert.equal(manifest.paths.length, expected.length);
    assert.equal(manifest.paths.filter(path => path.startsWith('/compare/') && path !== '/compare/').length, 2);
    assert.ok(!manifest.paths.some(path => /agent|healthz|release\.json|internal|account|session/iu.test(path)));
    assert.equal(manifest.private_notes_exported, 0);
    assert.equal(manifest.notion_page_identifiers_exported, 0);
    assert.equal(manifest.published_only, true);
    assert.equal(manifest.all_responses_status, 200);
    assert.equal(manifest.db_sha256, hash(await readFile(join(root, '.data/release/published.sqlite'))));
    assert.match(manifest.snapshot_date_basis, /file mtime; source observation dates/);
    const assetFiles = await files(output);
    assert.equal(assetFiles.length, manifest.file_count);
    let total = 0;
    for (const path of manifest.paths) {
      const file = join(output, publicAssetPath(path));
      total += (await stat(file)).size;
      const body = await readFile(file, 'utf8');
      assert.ok(!/https?:\/\/[^\s"'<>]*notion\.(?:so|com)\//iu.test(body), path);
      assert.ok(!/\bsk-[a-zA-Z0-9_-]{20,}|\/(?:Users\/|var\/folders\/)/u.test(body), path);
    }
    assert.equal(total, manifest.bytes_excluding_manifest);
  } finally { database.close(); }
});

test('fallback ranking preserves the public catalog and licensed photo attribution only', artifactCheck, async () => {
  const ranking = JSON.parse(await readFile(join(output, 'rankings.json'), 'utf8'));
  const database = new DatabaseSync(join(root, '.data/release/published.sqlite'), { readOnly: true });
  try {
    const cities = database.prepare("SELECT slug,photo_credit,photo_source FROM cities WHERE publication_status='published'").all();
    assert.equal(ranking.length, cities.length);
    for (const city of ranking) {
      const published = cities.find(row => row.slug === city.slug);
      assert.ok(published, city.slug);
      assert.equal(city.photoCredit, published.photo_credit);
      assert.equal(city.photoSource, published.photo_source);
      for (const key of ['id', 'notes', 'notion_links', 'reasoning_content', 'grounding_check', 'api_key']) assert.equal(key in city, false);
    }
  } finally { database.close(); }
});

// Reject malformed publish targets before reading any local release artifact.
test('public page targets require a clean HTTPS origin', async () => {
  for (const origin of ['http://demo.example.org', 'https://user:pass@demo.example.org', 'https://demo.example.org/path', 'https://demo.example.org?token=x', 'https://demo.example.org#fragment']) {
    await assert.rejects(buildPublicPages({origin}));
  }
});
