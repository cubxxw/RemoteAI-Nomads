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
const slugList = articles => articles.filter(article => !article.seriesNumber || article.seriesNumber <= 4).map(article => article.slug);
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
  assert.deepEqual(slugList(articlesForCity('chiang-mai')), ['chiang-mai-monthly-budget', 'chiang-mai-vs-penang', 'chiang-mai-vs-da-nang', 'november-nomad-destinations', 'monthly-budget-5000', 'beijing-time-remote-work', 'chinese-passport-long-stay']);
  assert.deepEqual(slugList(articlesForCity('penang')), ['penang-monthly-budget', 'chiang-mai-vs-penang', 'november-nomad-destinations', 'beijing-time-remote-work', 'chinese-passport-long-stay']);
  assert.deepEqual(slugList(articlesForCity('da-nang')), ['chiang-mai-vs-da-nang', 'november-nomad-destinations', 'da-nang-monthly-budget', 'monthly-apartment-utilities']);
  assert.deepEqual(slugList(articlesForCity('kuala-lumpur')), ['kuala-lumpur-monthly-budget', 'beijing-time-remote-work', 'chinese-passport-long-stay', 'two-person-monthly-budget', 'de-rantau-sabah-scope', 'monthly-apartment-utilities']);
  assert.deepEqual(slugList(articlesForCity('dali')), ['dali-monthly-budget', 'november-nomad-destinations', 'monthly-budget-5000', 'beijing-time-remote-work']);
  assert.deepEqual(articlesForCity('chiang'), []);
  assert.deepEqual(articlesForCity('chiang-mai-extra'), []);
  assert.deepEqual(articleBySlug('first-month').citySlugs, []);
  assert.equal(articleBySlug('missing'), null);
  assert.match(relatedArticlesHTML('osaka'), /japan-digital-nomad-chinese-passport/);
  assert.match(relatedArticlesHTML('lisbon'), /lisbon-monthly-budget/);
  assert.match(relatedArticlesHTML('chiang-mai'), /id="articles"/);
  assert.match(relatedArticlesHTML('penang'), /\/compare\/chiang-mai-vs-penang\//);
  assert.match(relatedArticlesHTML('da-nang'), /\/compare\/chiang-mai-vs-da-nang\//);
  assert.deepEqual(articlePaths(), publishedArticles().map(article => article.path));
  assert.match(guideCardsHTML(), /chiang-mai-monthly-budget/);
  assert.match(guideCardsHTML(), /penang-monthly-budget/);
  assert.match(guideCardsHTML(), /kuala-lumpur-monthly-budget/);
  assert.match(guideCardsHTML(), /dali-monthly-budget/);
  assert.match(guideCardsHTML(), /first-month/);
  assert.match(guideCardsHTML(), /chiang-mai-vs-penang/);
  assert.match(guideCardsHTML(), /chiang-mai-vs-da-nang/);
});

test('topic articles render in their own labelled section instead of the monthly-budget list', () => {
  const html = guideCardsHTML();
  const topicSection = html.match(/<section class="guide-city-articles" aria-labelledby="guide-topic-title">([\s\S]*?)<\/section>/)?.[1];
  const budgetSection = html.match(/<section class="guide-city-articles" aria-labelledby="guide-city-articles-title">([\s\S]*?)<\/section>/)?.[1];
  assert.ok(topicSection && budgetSection, 'both guide sections must render');
  assert.match(topicSection, /旅居专题/);
  for (const slug of ['november-nomad-destinations', 'monthly-budget-5000', 'beijing-time-remote-work', 'chinese-passport-long-stay']) assert.match(topicSection, new RegExp(slug));
  assert.match(topicSection, /chinese-passport-long-stay\//);
  assert.doesNotMatch(topicSection, /chiang-mai-monthly-budget/);
  assert.doesNotMatch(budgetSection, /november-nomad-destinations|monthly-budget-5000|beijing-time-remote-work|chinese-passport-long-stay/);
  assert.match(budgetSection, /chiang-mai-monthly-budget/);
  assert.ok(html.indexOf('guide-topic-title') < html.indexOf('guide-city-articles-title'), 'topic section is a separate labelled entry on the guide index');
});

test('topic classification is a validated optional boolean on guide entries', () => {
  const topic = {...guide, slug: 'topic-guide', path: '/guides/topic-guide/', assetPath: '/city-guides/topic-guide.html', topic: true};
  assert.equal(registry([topic]).publishedArticles()[0].topic, true);
  assert.throws(() => registry([{...topic, topic: 'yes'}]), /Invalid article topic flag/);
  assert.throws(() => registry([{...topic, topic: 1}]), /Invalid article topic flag/);
  assert.throws(() => registry([{...topic, slug: 'topic-compare', path: '/compare/topic-compare/', assetPath: undefined, kind: 'comparison', topic: true}]), /Invalid article topic flag/);
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
  const approved = JSON.parse(await readFile(join(SOURCES, 'publication.json'), 'utf8'));
  const packaged = publishedArticles().filter(article => article.assetPath);
  assert.equal(first.pages.length, packaged.length);
  assert.equal(first.assets.length, approved.assets.length);
  assert.equal(first.rawEvidenceFilesCopied, 0);
  assert.deepEqual(await filesUnder(options.outputDirectory), packaged.map(article => article.slug + '.html').sort());
  const outputFiles = await filesUnder(options.assetDirectory);
  assert.deepEqual(outputFiles, first.assets.map(asset => asset.path.slice('/guide-assets/'.length)).sort());
  assert.equal(outputFiles.filter(file => file.startsWith('images/')).length, approved.assets.filter(asset => asset.destination.startsWith('images/')).length);
  assert.equal(outputFiles.filter(file => /images\/og-/.test(file)).length, approved.assets.filter(asset => /images\/og-/.test(asset.destination)).length, 'Approved sharing photos may be reused across articles');
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
  for (const page of first.pages) {
    const batch = {
      'hanoi-monthly-budget': ['2026-10-21', '2026-10-21'],
      'baku-monthly-budget': ['2026-10-21', '2026-10-21'],
      'hangzhou-monthly-budget': ['2026-10-26', '2026-10-20'],
      'da-nang-monthly-budget': ['2026-10-26', '2026-10-21'],
      'xiamen-monthly-budget': ['2026-10-26', '2026-10-20'],
      'japan-digital-nomad-chinese-passport': ['2026-10-26', null],
      'kunming-monthly-budget': ['2026-10-27', '2026-10-26'],
      'bangkok-monthly-budget': ['2026-10-27', '2026-10-26'],
      'abu-dhabi-monthly-budget': ['2026-10-27', '2026-10-26'],
      'two-person-monthly-budget': ['2026-10-27', null],
      'new-zealand-visitor-remote-work': ['2026-10-27', null],
      'auckland-monthly-budget': ['2026-10-27', '2026-10-26'],
      'wellington-monthly-budget': ['2026-10-27', '2026-10-26'],
      'tbilisi-monthly-budget': ['2026-10-27', '2026-10-24'],
      'new-zealand-weekly-rent-thirty-nights': ['2026-10-27', null],
      'auckland-hop-cap-airport-transport': ['2026-10-27', null],
      'canggu-monthly-budget': ['2026-10-27', '2026-10-26'],
      'ho-chi-minh-city-monthly-budget': ['2026-10-27', '2026-10-21'],
      'seoul-monthly-budget': ['2026-10-27', '2026-10-26'],
      'korea-workation-f1d-2026': ['2026-10-27', null],
      'seoul-climate-card-short-stay-2026': ['2026-10-27', null],
      'singapore-monthly-budget': ['2026-10-27', '2026-10-26'],
      'hua-hin-monthly-budget': ['2026-10-27', '2026-10-26'],
      'de-rantau-sabah-scope': ['2026-10-27', null],
      'auckland-wellington-beijing-workday': ['2026-10-27', null],
      'monthly-apartment-utilities': ['2026-10-27', null],
      'phuket-monthly-budget': ['2026-10-27', '2026-10-26'],
      'malacca-monthly-budget': ['2026-10-27', '2026-10-26'],
      'remote-visa-income-balance': ['2026-10-27', null],
      'hua-hin-cross-season-thirty-nights': ['2026-10-27', null],
      'singapore-foreign-card-transit-fee': ['2026-10-27', null],
      'cowork-call-hours': ['2026-10-27', null],
      'chengdu-monthly-budget': ['2026-10-21', '2026-10-20'],
      'fethiye-monthly-budget': ['2026-10-21', '2026-10-20'],
      'lisbon-monthly-budget': ['2026-10-21', '2026-10-20'],
      'plovdiv-monthly-budget': ['2026-10-21', '2026-10-20'],
      'malaga-monthly-budget': ['2026-10-21', '2026-10-20'],
      'ubud-monthly-budget': ['2026-10-21', '2026-10-20'],
      'madrid-monthly-budget': ['2026-10-21', '2026-10-20'],
      'november-nomad-destinations': ['2026-10-22', null],
      'monthly-budget-5000': ['2026-10-22', null],
      'beijing-time-remote-work': ['2026-10-22', null],
      'chinese-passport-long-stay': ['2026-10-22', null],
    };
    const expected = (articleBySlug(page.slug).seriesNumber > 4 ? ['2026-10-23', null] : batch[page.slug])
      ?? (page.slug === 'pokhara-monthly-budget' ? ['2026-10-20', '2026-10-20']
      : /^(?:dali|kuala-lumpur)-/.test(page.slug) ? ['2026-10-20', '2026-10-19'] : ['2026-10-19', '2026-10-16']);
    assert.deepEqual([page.checkedOn, page.fxDate], expected);
  }
  assert.deepEqual(await buildCityGuides(options), first);
});

test('source topic classification must match its catalog before any output is published', async t => {
  const options = await sandbox(t);
  const articles = publishedArticles().map(article => article.slug === 'november-nomad-destinations' ? {...article, topic: false} : article);
  await assert.rejects(buildCityGuides({...options, articles}), /Guide topic flag must match its source kind/);
  await assert.rejects(access(options.outputDirectory));
});

test('topic guides need sources and checkedOn without an FX date, while budget guides keep the FX requirement', async t => {
  const options = await sandbox(t, {copySources: true});
  const manifestPath = join(options.sourceDirectory, 'publication.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const edit = async (slug, transform) => {
    const path = join(options.sourceDirectory, slug + '.html');
    const before = await readFile(path, 'utf8');
    const after = transform(before);
    assert.notEqual(after, before, 'fixture edit must change the topic source');
    await writeFile(path, after);
    const entry = manifest.articles.find(article => article.slug === slug);
    entry.sha256 = sha256(await readFile(path));
    await writeFile(manifestPath, JSON.stringify(manifest));
  };
  await edit('november-nomad-destinations', html => html.replace('"checkedOn":"2026-10-22"', '"checkedOn":null'));
  await assert.rejects(buildCityGuides(options), /source dates and source attribution/);
  await edit('november-nomad-destinations', html => html.replace('"checkedOn":null', '"checkedOn":"2026-10-22"').replace('"sources":{', '"sourcesRenamed":{'));
  await assert.rejects(buildCityGuides(options), /source dates and source attribution/);
  await edit('november-nomad-destinations', html => html.replace('"sourcesRenamed":{', '"sources":{'));
  const report = await buildCityGuides(options);
  assert.equal(report.pages.filter(page => page.fxDate === null).length, 64);
  assert.deepEqual(report.pages.filter(page => page.fxDate === null).map(page => page.slug).sort(), publishedArticles().filter(article => article.topic && article.assetPath).map(article => article.slug).sort());
  await edit('chiang-mai-monthly-budget', html => html.replace('"fx":{"date":"2026-10-16"', '"fx":{"date":null'));
  await assert.rejects(buildCityGuides(options), /Budget guide FX date is required/);
  await edit('chiang-mai-monthly-budget', html => html.replace('"fx":{"date":null', '"fx":{"date":"2026-10-16"'));
  assert.equal((await buildCityGuides(options)).pages.find(page => page.slug === 'chiang-mai-monthly-budget').fxDate, '2026-10-16');
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
  assert.equal(result.pages.length, publishedArticles().filter(article => article.assetPath).length - 1);
  assert.deepEqual(await filesUnder(options.outputDirectory), publishedArticles().filter(article => article.assetPath && article.slug !== guide.slug).map(article => article.slug + '.html').sort());
  assert.doesNotMatch((await filesUnder(options.assetDirectory)).join('\n'), /chiang-mai-akha|chiang-mai-baannoi|chiang-mai-jida|chiang-mai-realspace|og-chiang-mai|evidence|raw/);
  assert.match((await filesUnder(options.assetDirectory)).join('\n'), /chiang-mai-nimman-street/, 'a photo shared with a published topic page stays while that topic page still uses it');
  const empty = await buildCityGuides({...options, articles: []});
  assert.equal(empty.pages.length, 0);
  assert.deepEqual(await filesUnder(options.outputDirectory), []);
  assert.deepEqual(await filesUnder(options.assetDirectory), []);
});
