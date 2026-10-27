import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {publicSeedSql} from '../scripts/bootstrap-public.mjs';
import worker from '../src/worker.js';
import {publishedFallback} from '../src/published-fallback.js';

const seed = JSON.parse(gunzipSync(await readFile(new URL('../data/public-catalog.json.gz', import.meta.url))));
const db = new DatabaseSync(':memory:');
for (const item of seed.schema) db.prepare(item.sql).run();
db.exec(publicSeedSql(seed.tables));
const adapter = (sql, args = []) => ({
  bind(...values) { return adapter(sql, values); },
  async all() { return {results: db.prepare(sql).all(...args)}; },
  async first() { return db.prepare(sql).get(...args) || null; },
});
const origin = 'https://roamorrow.com/nomads';
const env = {SITE_ORIGIN: origin, PREVIEW: 'false', RELEASE_ID: 'seo-routing', DB: {prepare: adapter}};
const context = {waitUntil() {}};
globalThis.caches = {default: {async match() {}, async put() {}}};
test.after(() => {db.close(); delete globalThis.caches;});

test('city query variants preserve the selected month and canonical but stay out of the index', async () => {
  for (const query of ['?month=12', '?utm_source=newsletter', '?month=12&currency=CNY']) {
    const response = await worker.fetch(new Request(origin + '/cities/sydney/' + query), env, context);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<meta name="robots" content="noindex,follow">/);
    assert.match(html, /rel="canonical" href="https:\/\/roamorrow\.com\/nomads\/cities\/sydney\/"/);
    if (query.includes('month=12')) assert.match(html, /option value="12" selected/);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});

test('the clean city page stays indexable while preview and HEAD honor the same indexing boundary', async () => {
  const clean = await worker.fetch(new Request(origin + '/cities/sydney/'), env, context);
  assert.match(await clean.text(), /<meta name="robots" content="index,follow">/);
  const preview = await worker.fetch(new Request(origin + '/cities/sydney/'), {...env, PREVIEW: 'true'}, context);
  assert.match(await preview.text(), /<meta name="robots" content="noindex,follow">/);
  const head = await worker.fetch(new Request(origin + '/cities/sydney/?month=12', {method: 'HEAD'}), env, context);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal(head.headers.get('X-Robots-Tag'), 'noindex, follow');
});

test('outage city query responses keep the live noindex and no-store headers', async () => {
  const fallbackEnv = {...env, ASSETS: {async fetch(request) {
    if (new URL(request.url).pathname.endsWith('/manifest.json')) return Response.json({version: 1, origin, paths: ['/cities/sydney/']});
    return new Response('<html><head><meta name="robots" content="index,follow"><link rel="canonical" href="' + origin + '/cities/sydney/"></head><main><h1>悉尼</h1></main></html>', {headers: {'Content-Type': 'text/html'}});
  }}};
  const response = await publishedFallback(new Request('https://roamorrow.com/cities/sydney/?month=12'), fallbackEnv);
  assert.match(await response.text(), /content="noindex,follow"/);
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('city search descriptions identify the place and distinguish observed data from missing coverage', async () => {
  const complete = await worker.fetch(new Request(origin + '/cities/sydney/'), env, context);
  const completeMeta = (await complete.text()).match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(completeMeta.includes('悉尼'), 'search description must identify its own city');
  assert.ok(completeMeta.includes('澳大利亚'));
  assert.ok(completeMeta.includes('城市消费样本可查'));
  assert.ok(completeMeta.includes('按月份查看历史气候'));
  const sparse = db.prepare(`SELECT c.slug,c.name_zh FROM cities c
    WHERE NOT EXISTS (SELECT 1 FROM cost_observations o WHERE o.city_id=c.id AND o.scope='city')
      AND c.country_id NOT IN ('AF','IR','SY','ML','SO','SD','LY') LIMIT 1`).get();
  const response = await worker.fetch(new Request(origin + '/cities/' + sparse.slug + '/'), env, context);
  const sparseMeta = (await response.text()).match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(sparseMeta.includes(sparse.name_zh));
  assert.ok(sparseMeta.includes('城市消费样本待补充'));
  assert.ok(sparseMeta.includes('按月份查看历史气候'),'climate completion must not imply missing cost samples also lack climate');
  const advisory = await worker.fetch(new Request(origin + '/cities/damascus/'), env, context);
  const advisoryMeta = (await advisory.text()).match(/<meta name="description" content="([^"]*)"/)[1];
  assert.ok(advisoryMeta.includes('大马士革'));
  assert.ok(advisoryMeta.includes('暂勿前往'));
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE city_locations SET timezone='unknown/zone' WHERE city_id=(SELECT id FROM cities WHERE slug='sydney')").run();
    const invalid = await worker.fetch(new Request(origin + '/cities/sydney/'), env, context);
    const invalidMeta = (await invalid.text()).match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(!invalidMeta.includes('支持与北京的会议时间换算'), 'unusable timezone must not advertise a converter');
  } finally { db.exec('ROLLBACK'); }
});

test('the directory exposes every published city once through clean mounted links and sitemap discovery', async () => {
  const response = await worker.fetch(new Request(origin + '/destinations/'), env, context);
  assert.equal(response.status, 200);
  const html = await response.text();
  const paths = [...html.matchAll(/class="directory-city" href="([^"]+)"/g)].map(match => match[1]);
  const expected = db.prepare("SELECT slug FROM cities WHERE publication_status='published'").all().map(c => '/nomads/cities/' + c.slug + '/');
  assert.equal(paths.length, expected.length);
  assert.deepEqual(new Set(paths), new Set(expected));
  assert.match(html, /content="index,follow"/);
  assert.match(html, /rel="canonical" href="https:\/\/roamorrow\.com\/nomads\/destinations\/"/);
  assert.match(html, /暂勿前往 · 历史资料/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(schema['@graph'].find(item => item['@type'] === 'CollectionPage').url, origin + '/destinations/');
  assert.equal(schema['@graph'].find(item => item['@type'] === 'BreadcrumbList').itemListElement.at(-1).item, origin + '/destinations/');
  const sitemap = await worker.fetch(new Request(origin + '/sitemap.xml'), env, context);
  assert.ok((await sitemap.text()).includes('<loc>' + origin + '/destinations/</loc>'));
  const home = await worker.fetch(new Request(origin), env, context);
  assert.match(await home.text(), /href="\/nomads\/destinations\/"/);
});

test('the directory preserves preview, query, HEAD and draft boundaries and escapes city labels', async () => {
  const head = await worker.fetch(new Request(origin + '/destinations/', {method: 'HEAD'}), env, context);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const [query, options] of [['?month=12', env], ['', {...env, PREVIEW: 'true'}]]) {
    const response = await worker.fetch(new Request(origin + '/destinations/' + query), options, context);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /content="noindex,follow"/);
  }
  db.exec('BEGIN');
  try {
    db.prepare("UPDATE cities SET publication_status='draft' WHERE slug='sydney'").run();
    db.prepare("UPDATE cities SET name_zh=? WHERE slug='tokyo'").run('<img onerror="bad">');
    const response = await worker.fetch(new Request(origin + '/destinations/'), {...env, RELEASE_ID: 'directory-draft'}, context);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(!html.includes('href="/nomads/cities/sydney/"'));
    assert.ok(!html.includes('<img onerror="bad">'));
    assert.match(html, /&lt;img onerror=&quot;bad&quot;&gt;/);
    db.exec("UPDATE cities SET publication_status='draft'");
    const empty = await worker.fetch(new Request(origin + '/destinations/'), {...env, RELEASE_ID: 'directory-empty'}, context);
    assert.equal(empty.status, 200);
    assert.match(await empty.text(), /content="noindex,follow"/);
  } finally { db.exec('ROLLBACK'); }
});

test('the directory and query headers remain available from the reviewed ranking snapshot during an outage', async () => {
  const catalog = JSON.parse(await readFile(new URL('../public/published-pages/rankings.json', import.meta.url)));
  const fallbackEnv = {...env, ASSETS: {async fetch(request) {
    return new URL(request.url).pathname.endsWith('/manifest.json')
      ? Response.json({version: 1, origin, paths: ['/', '/destinations/']}) : Response.json(catalog);
  }}};
  for (const query of ['', '?month=12']) {
    const response = await publishedFallback(new Request('https://roamorrow.com/destinations/' + query), fallbackEnv);
    assert.ok(response, 'directory route must use the published catalog');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.equal((html.match(/class="directory-city" href=/g) || []).length, catalog.length);
    assert.match(html, query ? /content="noindex,follow"/ : /content="index,follow"/);
    if (query) {
      assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  const ranking = await publishedFallback(new Request('https://roamorrow.com/?month=12'), fallbackEnv);
  assert.equal(ranking.headers.get('X-Robots-Tag'), 'noindex, follow');
  assert.equal(ranking.headers.get('Cache-Control'), 'no-store');
});
