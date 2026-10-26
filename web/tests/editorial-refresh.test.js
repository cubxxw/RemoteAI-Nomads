import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, access} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mountMarkup, mountSrcset} from '../public/modules/site-path.js';
import {photoFallbackLabel, photoFallbackNode, installPhotoFallback} from '../public/modules/photo-fallback.js';
import {relocatePublishedHTML} from '../src/site-path.js';
import {rankingPageFromData} from '../src/rank-pages.js';
import {renderRow, renderRankingList, parseState} from '../public/modules/ranking.js';
import {sceneImage, sceneFigure} from '../src/editorial-scenes.js';
import {articleCover, articleCoverHTML} from '../src/guide-covers.js';
import {augmentGuideRuntime} from '../src/city-guide-pages.js';
import {publishedArticles} from '../src/article-catalog.js';
import {shell, photo} from '../src/render.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = 'https://roamorrow.com/nomads';
const env = {SITE_ORIGIN: site, PREVIEW: 'false'};
const month = Array.from({length: 12}, (_, i) => ({month: i + 1, status: 'recommended', meanC: 24, highC: 29, rainMm: 100}));
const city = (slug = 'chiang-mai', name = '清迈') => ({
  slug, name, nameEn: 'Chiang Mai', country: '泰国', countryCode: 'TH', countryId: 'TH', region: '亚洲',
  budget: 850, budgetBasis: '历史月参考', photo: `/images/city-${slug}.webp`, why: '预算、月份与工作条件齐全。',
  baseScore: 8, scores: {safety: 9, cost: 8, climate: 8, life: 9, internet: 10, community: 8},
  visa: {code: 'visa_free', label: '免签', detail: '原资料待复核'}, months: month,
});
const homepage = (url = 'https://nomads.test/') => rankingPageFromData([city()], new URL(url));
const fullPage = page => shell({title: page.title, description: page.description, body: page.body, path: page.path, indexable: true, env});

test('mount-aware markup rewrites every srcset candidate under the mount and never to root /images', () => {
  const html = mountMarkup('<img src="/images/a.webp" srcset="/images/a-small.webp 720w, /images/a.webp 1440w" sizes="50vw"><a href="/cities/x/">x</a><img srcset="/images/b.webp 1x, https://cdn.example/c.webp 2x">', '/nomads');
  assert.match(html, /src="\/nomads\/images\/a\.webp"/);
  assert.match(html, /srcset="\/nomads\/images\/a-small\.webp 720w, \/nomads\/images\/a\.webp 1440w"/);
  assert.match(html, /srcset="\/nomads\/images\/b\.webp 1x, https:\/\/cdn\.example\/c\.webp 2x"/);
  assert.doesNotMatch(html, /(?:"| )(?:src|srcset)="\/images/);
  assert.doesNotMatch(html, /\/nomads\/nomads/);
  assert.equal(mountMarkup(html, '/nomads'), html, 'mounting twice must not double-prefix');
  assert.equal(mountSrcset('/images/x.webp 2x', ''), '/images/x.webp 2x');
  assert.equal(mountSrcset('//cdn.example/x.webp 1x', '/nomads'), '//cdn.example/x.webp 1x');
});

test('the rendered homepage keeps hero and scene sources mounted under /nomads', () => {
  const html = fullPage(homepage());
  assert.match(html, /data-nomads-base="\/nomads"/);
  assert.match(html, /srcset="\/nomads\/images\/editorial\/work-by-the-lake-small\.webp 720w, \/nomads\/images\/editorial\/work-by-the-lake\.webp 1440w"/);
  assert.match(html, /href="\/nomads\/editorial\.css"/);
  assert.doesNotMatch(html, /(?:href|src|srcset|action|poster)="\/(?!nomads(?:\/|"))/);
});

test('hero is a compact single statement once any condition is carried, and the CTA scrolls to the existing finder', () => {
  const first = homepage();
  assert.match(first.body, /<h1 id="rank-hero-title"><span>换个地方，<\/span><span>好好工作与生活。<\/span><\/h1>/);
  assert.match(first.body, /class="rank-hero-cta" href="#ranking-search-form"/);
  assert.match(first.body, /data-compact="false"/);
  assert.match(first.body, /id="ranking-search-form"/);
  const filtered = rankingPageFromData([city()], new URL('https://nomads.test/?q=' + encodeURIComponent('清迈')));
  assert.match(filtered.body, /data-hero data-compact="true"/);
  assert.equal((filtered.body.match(/<h1[\s>]/g) || []).length, 1, 'one h1 stays on the homepage');
});

test('hero is the only eager high-priority image; rows and scenes load lazily below the fold', () => {
  const body = homepage().body;
  assert.equal((body.match(/fetchpriority="high"/g) || []).length, 1);
  const eager = body.match(/loading="eager"/g) || [];
  assert.equal(eager.length, 1, 'only the hero loads eagerly');
  assert.match(body, /src="\/images\/city-chiang-mai\.webp" alt="" width="960" height="641" loading="lazy"/);
  assert.doesNotMatch(body, /city-chiang-mai\.thumb\.webp/, 'cards must show the real photo, not an enlarged thumbnail');
});

test('editorial scenes have descriptive illustration alt text without creation badges', () => {
  for (const id of ['work-by-the-lake', 'coastal-workday', 'neighborhood-cafe']) {
    const figure = sceneFigure(id, {sizes: '50vw'});
    assert.doesNotMatch(figure, /\bAI\b|ai-scene|<figcaption/i);
    assert.match(figure, /data-editorial-scene="1"/);
    assert.match(figure, /alt="[^"]+（场景示意）"/);
    assert.match(figure, /loading="lazy"/);
  }
  assert.match(sceneImage('work-by-the-lake', {priority: true}), /loading="eager" fetchpriority="high"/);
  assert.throws(() => sceneImage('not-a-scene'), /Unknown editorial scene/);
});

test('ranking rows keep every incremental update hook in one shared SSR and dynamic template', () => {
  const state = parseState(new URL('https://nomads.test/?month=7'));
  const row = renderRow({...city(), rank: 1, score: 8.6}, state);
  const list = renderRankingList([{...city(), rank: 1, score: 8.6}], state);
  assert.ok(list.includes(row), 'dynamic rows must reuse the server template');
  assert.match(row, /^<article class="ranking-row" data-city="chiang-mai"/);
  for (const hook of ['class="rank-number"', 'class="rank-digit"', 'class="rank-score"', '<strong>8.6</strong>', 'class="rank-metric climate-cell"', 'class="metric-mobile-label">7月舒适度', 'class="month-band"', 'class="month-mark', 'class="rank-visa"', 'class="rank-compare" data-compare="chiang-mai" data-name="清迈" aria-label="对比清迈" aria-pressed="false"']) assert.ok(row.includes(hook), 'missing hook: ' + hook);
  assert.match(row, /title="免签资料待复核[^"]*"|title="原资料待复核"|class="legacy-indicator" aria-label="原资料待复核"/);
});

test('the homepage keeps the ranking column update targets and result controls the client patches', () => {
  const body = homepage().body;
  assert.match(body, /<div class="ranking-columns" aria-hidden="true">/);
  assert.match(body, /<span>推荐月份<\/span>/);
  assert.match(body, /<span>大陆护照<\/span>/);
  assert.match(body, /id="ranking-result-count"/);
  assert.match(body, /id="show-more-cities"/);
  assert.match(body, /id="ranking-empty"/);
  assert.match(body, /id="undo-ranking"/);
  assert.match(body, /id="active-ranking-filters"/);
});

test('an SSR city without a photo gets an explicit labelled placeholder, not an empty box', () => {
  assert.match(photo({name_zh: '帕福斯', name_en: 'Paphos', photo_url: null}), /class="photo-placeholder /);
  assert.match(photo({name_zh: '帕福斯', name_en: 'Paphos', photo_url: null}), /<span>Paphos<\/span><small>城市资料<\/small>/);
  assert.match(photo({name_zh: '清迈', name_en: 'Chiang Mai', photo_url: '/images/city-chiang-mai.webp'}), /data-photo-label="清迈"/);
});

test('runtime photo fallback keeps the label, is honest about the gap and can never loop', () => {
  const made = [];
  class FakeNode {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.attrs = new Map(); this.children = []; this.dataset = {}; }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); }
    append(...nodes) { this.children.push(...nodes); }
    get textContent() { return this.children.map(c => typeof c === 'string' ? c : c.textContent).join(''); }
    set textContent(value) { this.children = [String(value)]; }
  }
  const doc = {
    listeners: [],
    addEventListener(type, fn, capture) { this.listeners.push({type, fn, capture}); },
    createElement(tag) { const node = new FakeNode(tag); made.push(node); return node; },
  };
  const early = new FakeNode('img');
  early.setAttribute('src', '/missing.webp');
  early.complete = true; early.naturalWidth = 0;
  let earlyReplacements = 0; early.replaceWith = () => earlyReplacements++;
  const pending = new FakeNode('img');
  pending.setAttribute('src', '/pending.webp'); pending.complete = false; pending.naturalWidth = 0;
  pending.replaceWith = () => assert.fail('pending lazy image must not be replaced');
  doc.images = [early, pending];
  installPhotoFallback(doc);
  assert.equal(earlyReplacements, 1, 'a failure before module installation is recovered');
  assert.equal(doc.listeners.length, 1);
  assert.equal(doc.listeners[0].capture, true, 'image errors must be caught in the capture phase');
  const fire = img => doc.listeners[0].fn({target: img});
  const broken = new FakeNode('img');
  broken.setAttribute('alt', '清迈城市风景');
  broken.setAttribute('data-photo-label', '清迈');
  broken.attrs.set('src', '/images/city-chiang-mai.webp');
  broken.attrs.set('srcset', '/images/city-chiang-mai.webp 2x');
  let replacements = 0;
  broken.replaceWith = node => { replacements++; broken.replacement = node; };
  fire(broken);
  assert.equal(replacements, 1);
  assert.equal(broken.attrs.has('src'), false, 'the failed url must not be retried');
  assert.equal(broken.attrs.has('srcset'), false);
  assert.equal(broken.replacement.getAttribute('class'), 'photo-placeholder');
  assert.match(broken.replacement.textContent, /清迈城市图像待补/);
  fire(broken);
  assert.equal(replacements, 1, 'one fallback per image, no loop');
  const scene = new FakeNode('img');
  scene.setAttribute('data-photo-label', '湖畔工作场景');
  scene.setAttribute('data-editorial-scene', '1');
  scene.replaceWith = node => { scene.replacement = node; };
  fire(scene);
  assert.equal(scene.replacement.textContent, '湖畔工作场景场景图片待补');
  assert.equal(scene.replacement.getAttribute('aria-label'), '湖畔工作场景（场景图片待补）');
  assert.doesNotMatch(scene.replacement.textContent, /\bAI\b/i);
  assert.equal(photoFallbackLabel({alt: '槟城城市照片', getAttribute: () => null}), '槟城');
  assert.match(photoFallbackNode({getAttribute: () => null, alt: ''}, doc).textContent, /图片暂不可用/);
});

test('editorial scene provenance records tool, kind, roles, scenes and responsive dimensions', async () => {
  const manifest = JSON.parse(await readFile(join(root, 'data/editorial-images.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generatedAt, '2026-10-23');
  assert.match(manifest.tool, /imagegen/i);
  assert.match(manifest.kind, /fictional/i);
  assert.equal(manifest.label, undefined, 'creation badges are not part of public rendering');
  assert.equal(manifest.assets.length, 3);
  for (const asset of manifest.assets) {
    assert.ok(asset.role && asset.scene && asset.alt && asset.label, asset.id);
    assert.match(asset.alt, /场景示意/);
    assert.doesNotMatch(asset.alt + asset.label, /\bAI\b|生成|创作/i);
    assert.ok(/hero|topic/.test(asset.role), asset.id);
    for (const variant of Object.values(asset.sources)) {
      assert.ok(variant.path.startsWith('/images/editorial/'), 'relative public path: ' + variant.path);
      assert.ok(!/(:|\/\/|\.\.)/.test(variant.path.slice(1)), 'no private or absolute path: ' + variant.path);
      assert.ok(variant.width > 0 && variant.height > 0);
      await access(join(root, 'public', variant.path));
    }
    assert.equal(asset.sources.large.width, 1440);
    assert.equal(asset.sources.small.width, 720);
  }
});

test('guide covers use the article city photo with attribution, or an illustration without a creation badge', () => {
  for (const article of publishedArticles()) {
    const cover = articleCover(article), html = articleCoverHTML(article);
    if (cover.kind === 'city') {
      assert.ok(article.citySlugs.includes(cover.photo_url.match(/city-([a-z0-9-]+)\.webp/)[1]), 'cover must belong to the article city: ' + article.slug);
      assert.match(html, /alt="[^"]+城市实景"/);
      assert.match(html, /article-cover-credit/);
      assert.ok(cover.photo_credit && /^https:\/\//.test(cover.photo_source), 'real photos keep their source: ' + article.slug);
      assert.doesNotMatch(html, /data-editorial-scene/);
    } else {
      assert.equal(cover.kind, 'scene');
      assert.doesNotMatch(html, /\bAI\b|ai-scene|<figcaption/i);
      assert.match(html, /data-editorial-scene="1"/);
      assert.match(html, /场景示意/);
      assert.doesNotMatch(html, /alt="[^"]*城市实景/);
    }
    assert.match(html, /loading="lazy"/);
  }
  const index = publishedArticles().filter(a => a.assetPath);
  assert.ok(index.length > 60);
});

test('new city articles select their own existing photo rather than the generic scene fallback', async () => {
  const photos=JSON.parse(await readFile(join(root,'scripts/photos.json'),'utf8'));
  for (const [slug,city] of [['kunming-monthly-budget','kunming'],['bangkok-monthly-budget','bangkok'],['abu-dhabi-monthly-budget','abu-dhabi'],['new-zealand-visitor-remote-work','auckland']]) {
    const article=publishedArticles().find(a=>a.slug===slug), cover=articleCover(article);
    assert.equal(cover.kind,'city',slug);
    assert.equal(cover.photo_url,`/images/city-${city}.webp`);
    assert.equal(cover.photo_source,photos[city].source);
    assert.equal(cover.photo_credit,photos[city].credit);
    assert.ok(cover.photo_credit && cover.photo_source.startsWith('https://commons.wikimedia.org/'));
  }
});

test('budget guides get a runtime city hero with credit while approved topic HTML stays as published', () => {
  const budget = publishedArticles().find(a => a.slug === 'chiang-mai-monthly-budget');
  const topic = publishedArticles().find(a => a.slug === 'november-nomad-destinations');
  const budgetHTML = '<!doctype html><html lang="zh-CN"><head><meta name="robots" content="index,follow"></head><body><main id="main" class="page"><section class="answer-hero"><h1>清迈住一个月，房租怎么选</h1></section></main></body></html>';
  const augmented = augmentGuideRuntime(budgetHTML, budget, env);
  assert.match(augmented, /<figure class="guide-runtime-cover"><img src="\/nomads\/images\/city-chiang-mai\.webp" alt="清迈城市实景" width="960" height="641" loading="eager" fetchpriority="high"/);
  assert.ok(augmented.indexOf('guide-runtime-cover') < augmented.indexOf('answer-hero'), 'hero precedes the article main');
  assert.match(augmented, /<figcaption><span>清迈城市实景<\/span><a href="https:\/\/commons\.wikimedia\.org[^"]+" target="_blank" rel="noopener noreferrer">/);
  assert.match(augmented, /<script type="module" src="\/nomads\/guide-visuals\.js"><\/script>/);
  assert.match(augmented, /<link rel="stylesheet" href="\/nomads\/guide-runtime\.css">/);
  assert.equal((augmented.match(/<h1[\s>]/g) || []).length, 1);
  const topicOut = augmentGuideRuntime('<!doctype html><html><head></head><body><main id="main"><h1>专题</h1></main></body></html>', topic, env);
  assert.doesNotMatch(topicOut, /guide-runtime-cover/);
  assert.match(topicOut, /guide-runtime\.css/);
  assert.equal((topicOut.match(/<h1[\s>]/g) || []).length, 1);
});

 test('outage snapshots relocate responsive candidates from both root and an old mount', () => {
  const html = '<html><img src="/old/images/a.webp" srcset="/old/images/a-small.webp 720w, /images/a.webp 1440w"><link imagesrcset="/old/images/a.webp 2x, https://cdn.example/b.webp 3x"></html>';
  const result = relocatePublishedHTML(html, 'https://old.example/old', env);
  assert.match(result, /srcset="\/nomads\/images\/a-small.webp 720w, \/nomads\/images\/a.webp 1440w"/);
  assert.match(result, /imagesrcset="\/nomads\/images\/a.webp 2x, https:\/\/cdn.example\/b.webp 3x"/);
  assert.equal(relocatePublishedHTML(result, site, env), result);
});
