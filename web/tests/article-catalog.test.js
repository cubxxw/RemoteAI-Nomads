import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {access, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createArticleCatalog, publishedArticles, articlesForCity, articleBySlug, articlePaths, relatedArticlesHTML, guideCardsHTML} from '../src/article-catalog.js';
import {buildCityGuides, publishGuideHTML} from '../scripts/build-city-guides.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'content/city-guides');
const guide = publishedArticles().find(article => article.assetPath);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const registry = entries => createArticleCatalog({schemaVersion: 1, entries});
const slugList = articles => articles.map(article => article.slug);
const inlineData = html => html.match(/<script type="application\/json" id="guide-config">([\s\S]*?)<\/script>/)?.[1];
const visibleBody = html => html.slice(html.indexOf('<body')).replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, '');

async function filesUnder(directory, prefix = '') {
  const entries = await readdir(directory, {withFileTypes: true});
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? filesUnder(join(directory, entry.name), prefix + entry.name + '/') : [prefix + entry.name]))).flat().sort();
}

async function sandbox(t, {copySources = false} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'nomads-city-guides-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const sourceDirectory = copySources ? join(root, 'source') : SOURCES;
  if (copySources) await cp(SOURCES, sourceDirectory, {recursive: true});
  return {root, sourceDirectory, outputDirectory: join(root, 'public/city-guides'), assetDirectory: join(root, 'public/guide-assets'), reportPath: null};
}

test('published articles associate with exact cities and both sides of multi-city comparisons', () => {
  assert.deepEqual(slugList(articlesForCity('chiang-mai')), ['chiang-mai-monthly-budget', 'chiang-mai-vs-penang', 'chiang-mai-vs-da-nang']);
  assert.deepEqual(slugList(articlesForCity('penang')), ['penang-monthly-budget', 'chiang-mai-vs-penang']);
  assert.deepEqual(slugList(articlesForCity('da-nang')), ['chiang-mai-vs-da-nang']);
  assert.deepEqual(articlesForCity('chiang'), []);
  assert.deepEqual(articlesForCity('chiang-mai-extra'), []);
  assert.deepEqual(articleBySlug('first-month').citySlugs, []);
  assert.equal(articleBySlug('missing'), null);
  assert.equal(relatedArticlesHTML('lisbon'), '');
  assert.match(relatedArticlesHTML('chiang-mai'), /id="articles"/);
  assert.match(relatedArticlesHTML('penang'), /\/compare\/chiang-mai-vs-penang\//);
  assert.match(relatedArticlesHTML('da-nang'), /\/compare\/chiang-mai-vs-da-nang\//);
  assert.deepEqual(articlePaths(), publishedArticles().map(article => article.path));
  assert.match(guideCardsHTML(), /chiang-mai-monthly-budget/);
  assert.match(guideCardsHTML(), /penang-monthly-budget/);
  assert.doesNotMatch(guideCardsHTML(), /first-month|chiang-mai-vs-/);
});

test('draft entries stay out of lookup, navigation, city links and guide cards', () => {
  const draft = {...guide, slug: 'unreviewed-guide', path: '/guides/unreviewed-guide/', assetPath: '/city-guides/unreviewed-guide.html', status: 'draft', title: 'Unreviewed draft'};
  const catalog = registry([guide, draft]);
  assert.deepEqual(catalog.publishedArticles(), [guide]);
  assert.deepEqual(catalog.articlesForCity('chiang-mai'), [guide]);
  assert.equal(catalog.articleBySlug(draft.slug), null);
  assert.deepEqual(catalog.articlePaths(), [guide.path]);
  assert.doesNotMatch(catalog.relatedArticlesHTML('chiang-mai') + catalog.guideCardsHTML(), /unreviewed|Unreviewed/);
  assert.throws(() => catalog.publishedArticles().push(draft), TypeError);
  assert.throws(() => catalog.publishedArticles()[0].citySlugs.push('other'), TypeError);
});

test('catalog rejects duplicate slugs and canonical paths, including duplicates hidden in drafts', () => {
  assert.throws(() => registry([guide, {...guide, status: 'draft'}]), /Duplicate article slug/);
  assert.throws(() => registry([guide, {...guide, slug: 'other-guide', status: 'draft'}]), /Duplicate article path/);
  assert.throws(() => registry([{...guide, path: '/compare/' + guide.slug + '/'}]), /does not match/);
  assert.throws(() => registry([{...guide, status: 'reviewed'}]), /Invalid article status/);
  assert.throws(() => registry([{...guide, citySlugs: ['chiang-mai', 'chiang-mai']}]), /Invalid article citySlugs/);
  assert.throws(() => registry([{...guide, assetPath: '/evidence/private.html'}]), /Invalid article assetPath/);
});

test('article markup safely escapes titles and summaries in both public entry points', () => {
  const catalog = registry([{...guide, title: '<img src=x onerror="alert(1)"> & title', summary: '<script>alert(1)</script> "quotes"'}]);
  for (const html of [catalog.relatedArticlesHTML('chiang-mai'), catalog.guideCardsHTML()]) {
    assert.doesNotMatch(html, /<script>|<img src=x/);
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; title/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /href="\/guides\/chiang-mai-monthly-budget\/"/);
  }
});

test('guide package includes exactly public images and runtime, preserves copy and dates, and builds identically twice', async t => {
  const options = await sandbox(t);
  const first = await buildCityGuides(options);
  assert.equal(first.pages.length, 2);
  assert.equal(first.assets.length, 14);
  assert.equal(first.rawEvidenceFilesCopied, 0);
  assert.deepEqual(await filesUnder(options.outputDirectory), ['chiang-mai-monthly-budget.html', 'penang-monthly-budget.html']);
  const outputFiles = await filesUnder(options.assetDirectory);
  assert.deepEqual(outputFiles, first.assets.map(asset => asset.path.slice('/guide-assets/'.length)).sort());
  assert.equal(outputFiles.filter(file => file.startsWith('images/')).length, 10);
  assert.equal(outputFiles.filter(file => /images\/og-/.test(file)).length, 2);
  assert.doesNotMatch(outputFiles.join('\n'), /evidence|tik.?hub|budget-data|source-facts|sources\.json|brief|\.json$/i);
  for (const article of publishedArticles().filter(article => article.assetPath)) {
    const html = await readFile(join(options.outputDirectory, article.slug + '.html'), 'utf8');
    const source = await readFile(join(SOURCES, article.slug + '.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="index,follow">/);
    assert.doesNotMatch(html, /noindex|localhost|127\.0\.0\.1|\/Users\//);
    assert.equal(inlineData(html), inlineData(source), 'Curated inline data must remain byte-for-byte unchanged');
    assert.equal(visibleBody(html), visibleBody(source), 'Approved visible article copy must remain unchanged');
    assert.equal(publishGuideHTML(html, article), html, 'Publication conversion must be idempotent');
    const structuredData = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const node = structuredData['@graph'].find(node => node['@type'] === 'Article');
    const og = html.match(/<meta property="og:image" content="([^"]+)"/)[1];
    assert.equal(node.image, og);
    assert.equal(node.dateModified, article.updatedAt);
    assert.match(og, /^https:\/\/roamorrow\.com\/nomads\/guide-assets\/images\/og-/);
    assert.ok(html.includes('href="/nomads/guides/"'));
    for (const [, , resource] of html.matchAll(/\b(?:src|href)=(['"])(\/nomads\/(?:guide-assets|vendor\/leaflet)\/[^"']+)\1/g)) {
      const path = resource.startsWith('/nomads/guide-assets/') ? join(options.assetDirectory, resource.slice('/nomads/guide-assets/'.length)) : join(ROOT, 'public', resource.slice('/nomads/'.length));
      await access(path);
    }
  }
  const tools = await readFile(join(options.assetDirectory, 'guide-tools.mjs'), 'utf8');
  assert.match(tools, /from '\.\/budget-model\.mjs'/);
  await access(join(options.assetDirectory, 'budget-model.mjs'));
  assert.deepEqual(first.pages.map(page => [page.checkedOn, page.fxDate]), [['2026-10-19', '2026-10-16'], ['2026-10-19', '2026-10-16']]);
  assert.deepEqual(await buildCityGuides(options), first);
});

test('guide publication rejects missing provenance, approval and changed source bytes before writing outputs', async t => {
  const options = await sandbox(t, {copySources: true});
  const path = join(options.sourceDirectory, 'publication.json');
  const original = JSON.parse(await readFile(path, 'utf8'));
  const changed = structuredClone(original); changed.publication.approved = false;
  await writeFile(path, JSON.stringify(changed));
  await assert.rejects(buildCityGuides(options), /Explicit guide publication approval/);
  await assert.rejects(access(options.outputDirectory), /ENOENT/);
  delete changed.publication; await writeFile(path, JSON.stringify(changed));
  await assert.rejects(buildCityGuides(options), /Explicit guide publication approval/);
  await writeFile(path, JSON.stringify(original));
  const sourcePath = join(options.sourceDirectory, original.articles[0].sourceFile);
  await writeFile(sourcePath, (await readFile(sourcePath, 'utf8')) + '\nchanged');
  await assert.rejects(buildCityGuides(options), /Approved guide source hash changed/);
  await assert.rejects(access(options.outputDirectory), /ENOENT/);
  await rm(path);
  await assert.rejects(buildCityGuides(options), /ENOENT/);
});

test('guide publication refuses undeclared raw evidence and missing image materials', async t => {
  const options = await sandbox(t, {copySources: true});
  const path = join(options.sourceDirectory, 'publication.json');
  const original = JSON.parse(await readFile(path, 'utf8'));
  const injected = structuredClone(original);
  injected.assets.push({source: 'evidence/raw.json', destination: 'evidence/raw.json', sha256: sha256('{}')});
  await writeFile(path, JSON.stringify(injected));
  await assert.rejects(buildCityGuides(options), /not in the guide publication allowlist/);
  const missing = structuredClone(original); missing.assets = missing.assets.filter(asset => !asset.source.includes('og-chiang-mai'));
  await writeFile(path, JSON.stringify(missing));
  await assert.rejects(buildCityGuides(options), /required public guide asset is missing/);
  await writeFile(path, JSON.stringify(original));
  await rm(join(options.sourceDirectory, original.assets[0].source));
  await assert.rejects(buildCityGuides(options), /ENOENT/);
  await assert.rejects(access(options.outputDirectory), /ENOENT/);
});

test('withdrawn guides and unrelated stale assets disappear from owned build directories', async t => {
  const options = await sandbox(t);
  await buildCityGuides(options);
  await mkdir(join(options.assetDirectory, 'evidence'), {recursive: true});
  await writeFile(join(options.assetDirectory, 'evidence/raw.json'), '{}');
  const articles = publishedArticles().map(article => article.slug === guide.slug ? {...article, status: 'draft'} : article);
  const result = await buildCityGuides({...options, articles});
  assert.equal(result.pages.length, 1);
  assert.deepEqual(await filesUnder(options.outputDirectory), ['penang-monthly-budget.html']);
  assert.doesNotMatch((await filesUnder(options.assetDirectory)).join('\n'), /chiang-mai|evidence|raw/);
  const empty = await buildCityGuides({...options, articles: []});
  assert.equal(empty.pages.length, 0);
  assert.deepEqual(await filesUnder(options.outputDirectory), []);
  assert.deepEqual(await filesUnder(options.assetDirectory), []);
});
