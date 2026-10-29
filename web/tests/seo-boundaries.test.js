import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {shell} from '../src/render.js';

const origin = 'https://roamorrow.com/nomads';
const context = {waitUntil() {}};

test('public storage URLs return 404/noindex without exposing asset contents', async () => {
  const env = {SITE_ORIGIN: origin, PREVIEW: 'false', LEGACY_REDIRECT: 'true',
    ASSETS: {async fetch() {return new Response('internal snapshot');}},
    DB: {prepare() {throw new Error('Internal storage must not query D1');}},
  };
  for (const prefix of ['https://roamorrow.com/nomads', 'https://nomads.cubxxw.com']) {
    for (const path of ['/published-pages/manifest.json', '/published-pages/cities/tokyo/index.html', '/published-pages/cities/tokyo/', '/city-guides/chiang-mai-monthly-budget.html', '/city-guides/', '/published-pages', '/city-guides', '/%70ublished-pages/manifest.json', '/city-guides%2Fchiang-mai-monthly-budget.html']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await worker.fetch(new Request(prefix + path + '?utm_source=test', {method}), env, context);
        assert.equal(response.status, 404, prefix + path);
        assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
        assert.equal(response.headers.get('Location'), null);
        assert.equal(await response.text(), method === 'HEAD' ? '' : 'Not found');
      }
    }
  }
});

test('storage boundaries also apply without a mount and do not swallow similarly named assets', async () => {
  const env = {SITE_ORIGIN: 'https://nomads.example', PREVIEW: 'false', ASSETS: {async fetch() {return new Response('public asset');}}};
  const hidden = await worker.fetch(new Request('https://nomads.example/published-pages/index.html'), env, context);
  assert.equal(hidden.status, 404);
  const publicAsset = await worker.fetch(new Request('https://nomads.example/published-pages-help.json'), env, context);
  assert.equal(await publicAsset.text(), 'public asset');
});

test('asset redirects keep the public mount and query while external targets remain unchanged', async () => {
  for (const [location, expected] of [
    ['/local-data/?currency=CNY', origin + '/local-data/?currency=CNY'],
    ['https://roamorrow.com/local-data/#export', origin + '/local-data/#export'],
    ['https://roamorrow.com/nomads/local-data/', origin + '/local-data/'],
    ['https://external.example/resource', 'https://external.example/resource'],
  ]) {
    const response = await worker.fetch(new Request(origin + '/local-data.html'), {
      SITE_ORIGIN: origin, PREVIEW: 'false', ASSETS: {async fetch() {return new Response(null, {status: 308, headers: {Location: location}});}},
    }, context);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('Location'), expected);
  }
});

test('city structured data retains its Place and adds a mounted discovery trail', () => {
  const html = shell({title: '东京数字游民指南', description: '东京的旅居资料', path: '/cities/tokyo/', indexable: true,
    env: {SITE_ORIGIN: origin, PREVIEW: 'false'},
    jsonld: {'@context': 'https://schema.org', '@type': 'Place', name: '东京', alternateName: 'Tokyo', url: origin + '/cities/tokyo/'}, body: '',
  });
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  const nodes = data['@graph'];
  assert.ok(nodes, 'city schema needs a page and breadcrumb graph');
  assert.equal(nodes.find(node => node['@type'] === 'Place').alternateName, 'Tokyo');
  const page = nodes.find(node => node['@type'] === 'WebPage');
  assert.equal(page.url, origin + '/cities/tokyo/');
  assert.equal(page.inLanguage, 'zh-CN');
  const breadcrumb = nodes.find(node => node['@type'] === 'BreadcrumbList');
  assert.deepEqual(breadcrumb.itemListElement.map(item => [item.position, item.name, item.item]), [
    [1, '城市排行', origin], [2, '城市目录', origin + '/destinations/'], [3, '东京', origin + '/cities/tokyo/'],
  ]);
  assert.equal(page.breadcrumb['@id'], breadcrumb['@id']);
});

test('guide schema keeps its article and existing comparison breadcrumbs are not duplicated', () => {
  const article = {'@context': 'https://schema.org', '@type': 'Article', headline: '先住一周', dateModified: '2026-10-17'};
  const html = shell({title: '先住一周', description: '试住指南', path: '/guides/first-month/', indexable: true, body: '', env: {SITE_ORIGIN: origin, PREVIEW: 'false'}, jsonld: article});
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
  assert.equal(data['@graph']?.find(node => node['@type'] === 'Article')?.dateModified, '2026-10-17');
  assert.equal(data['@graph']?.find(node => node['@type'] === 'BreadcrumbList')?.itemListElement[1].item, origin + '/guides/');
  const reviewed = {'@context': 'https://schema.org', '@graph': [{'@type': 'WebPage', name: 'reviewed'}, {'@type': 'BreadcrumbList', itemListElement: [{position: 1, name: 'reviewed'}]}]};
  const existing = shell({title: '比较', path: '/compare/a-vs-b/', indexable: true, body: '', env: {SITE_ORIGIN: origin, PREVIEW: 'false'}, jsonld: reviewed});
  assert.deepEqual(JSON.parse(existing.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]), reviewed);
  assert.equal(article['@type'], 'Article', 'caller metadata must not be mutated');
});

test('preview and noindex pages do not advertise supplemental discovery schema', () => {
  for (const [preview, indexable] of [['true', true], ['false', false]]) {
    const html = shell({title: '草稿', path: '/guides/draft/', body: '', indexable, env: {SITE_ORIGIN: origin, PREVIEW: preview}});
    assert.match(html, /content="noindex,follow"/);
    assert.doesNotMatch(html, /application\/ld\+json/);
  }
});
