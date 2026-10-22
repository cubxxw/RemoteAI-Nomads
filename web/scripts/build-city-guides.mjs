// Publish only explicitly approved HTML and its declared public assets. The
// original research/export directory is never traversed by a release build.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {publishedArticles} from '../src/article-catalog.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://roamorrow.com/nomads';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const runtimeAssets = new Map([
  ['preview.css', 'guide.css'], ['reader.js', 'reader.js'],
  ['guide-tools.mjs', 'guide-tools.mjs'], ['budget-model.mjs', 'budget-model.mjs'],
]);
const imageName = /^[a-z0-9][a-z0-9-]*\.(?:jpe?g|webp|png|svg)$/;
const safeJSON = value => JSON.stringify(value).replace(/</g, '\\u003c');

function imageReferences(html) {
  const images = new Set();
  for (const [, , value] of html.matchAll(/\b(?:src|poster)=(['"])(.*?)\1/g)) {
    const name = /^(?:assets\/|\/nomads\/guide-assets\/images\/)([^?#]+)$/.exec(value)?.[1];
    if (name) { assert.match(name, imageName, 'Only simple public image paths are accepted'); images.add(name); }
  }
  const og = /<meta\s+property="og:image"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(og, 'Guide social sharing image is required');
  const ogImage = /\/(og-[a-z0-9-]+\.(?:jpe?g|webp|png))$/.exec(og)?.[1];
  assert.ok(ogImage, 'Guide social sharing image must be an approved local OG image');
  images.add(ogImage);
  return {images, ogImage};
}

export function publishGuideHTML(input, article) {
  const canonical = SITE + article.path;
  assert.ok(input.includes(`<link rel="canonical" href="${canonical}">`), 'Guide canonical does not match its catalog: ' + article.slug);
  assert.ok(/<meta name="robots" content="[^"]*">/.test(input), 'Guide robots metadata is required');
  const {ogImage} = imageReferences(input);
  const imageURL = SITE + '/guide-assets/images/' + ogImage;
  let html = input.replace(/<meta name="robots" content="[^"]*">/, '<meta name="robots" content="index,follow">');
  html = html.replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${imageURL}">`);
  html = html.replace(/\b(href|src|poster)=(['"])(.*?)\2/g, (match, key, quote, value) => {
    let target = value;
    if (value.startsWith('assets/')) target = '/nomads/guide-assets/images/' + value.slice(7);
    else if (runtimeAssets.has(value)) target = '/nomads/guide-assets/' + runtimeAssets.get(value);
    else if (value.startsWith('vendor/leaflet/')) target = '/nomads/' + value;
    else if (/^index\.html(?:[?#]|$)/.test(value)) target = '/nomads/guides/' + value.slice(10);
    else {
      const sibling = /^([a-z0-9-]+)\.html([?#].*)?$/.exec(value);
      if (sibling) {
        const linked = publishedArticles().find(entry => entry.slug === sibling[1]);
        assert.ok(linked, 'Relative article link has no published catalog entry: ' + value);
        target = '/nomads' + linked.path + (sibling[2] || '');
      }
    }
    return `${key}=${quote}${target}${quote}`;
  });
  let foundArticle = false;
  html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (match, text) => {
    const data = JSON.parse(text);
    const nodes = data['@graph'] || [data];
    for (const node of nodes) if (node['@type'] === 'Article') {
      assert.equal(node.mainEntityOfPage, canonical, 'Article structured data must use the canonical URL');
      assert.equal(node.dateModified, article.updatedAt, 'Preserve the reviewed article update date');
      node.image = imageURL;
      foundArticle = true;
    }
    return `<script type="application/ld+json">${safeJSON(data)}</script>`;
  });
  assert.ok(foundArticle, 'Article structured data is required');
  html = html.replace(/<html\b([^>]*)>/, (match, attrs) => /data-nomads-base=/.test(attrs) ? match : `<html${attrs} data-nomads-base="/nomads">`);
  assert.ok(!/noindex|localhost|127\.0\.0\.1|\/(?:Users\/|var\/folders\/)/i.test(html), 'Unpublishable metadata or private path in ' + article.slug);
  for (const [, , value] of html.matchAll(/\b(?:href|src|poster)=(['"])(.*?)\1/g)) assert.match(value, /^(?:\/|#|https?:\/\/|data:)/, 'Unresolved preview resource in ' + article.slug);
  return html;
}

async function existingFiles(directory, prefix = '') {
  try {
    const entries = await readdir(directory, {withFileTypes: true});
    const nested = await Promise.all(entries.map(entry => entry.isDirectory() ? existingFiles(join(directory, entry.name), prefix + entry.name + '/') : [prefix + entry.name]));
    return nested.flat();
  } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function buildCityGuides({
  sourceDirectory = join(ROOT, 'content/city-guides'),
  outputDirectory = join(ROOT, 'public/city-guides'),
  assetDirectory = join(ROOT, 'public/guide-assets'),
  reportPath = join(ROOT, '.data/deploy/guides-pack.json'),
  articles = publishedArticles(),
} = {}) {
  const manifest = JSON.parse(await readFile(join(sourceDirectory, 'publication.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1, 'Publication manifest schemaVersion 1 is required');
  assert.equal(manifest.publication?.approved, true, 'Explicit guide publication approval is required');
  assert.ok(manifest.publication.approvedOn && manifest.publication.authority, 'Publication approval provenance is required');
  assert.ok(manifest.sourceEdition && Array.isArray(manifest.articles) && Array.isArray(manifest.assets), 'Guide publication source materials are required');
  const selected = articles.filter(article => article.status === 'published' && article.kind === 'guide' && article.assetPath);
  const sourceSlugs = manifest.articles.map(article => article.slug);
  assert.equal(new Set(sourceSlugs).size, sourceSlugs.length, 'Duplicate source article in publication manifest');
  for (const article of selected) assert.ok(sourceSlugs.includes(article.slug), 'Published guide has no approved source: ' + article.slug);
  const pages = [], expectedAssets = new Map(selected.length ? runtimeAssets : []), declaredAssets = new Map(runtimeAssets), assetBuffers = new Map(), materials = new Map();
  for (const source of manifest.articles) {
    assert.match(source.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid publication source slug');
    assert.equal(source.approved, true, 'Article publication approval is required: ' + source.slug);
    assert.ok(source.source, 'Original publication source is required: ' + source.slug);
    assert.equal(source.sourceFile, source.slug + '.html', 'Guide source must be a simple canonical filename');
    const bytes = await readFile(join(sourceDirectory, source.sourceFile));
    assert.equal(sha256(bytes), source.sha256, 'Approved guide source hash changed: ' + source.slug);
    const input = bytes.toString('utf8');
    materials.set(source.slug, {source, input});
    for (const name of imageReferences(input).images) declaredAssets.set('assets/' + name, 'images/' + name);
  }
  for (const article of selected) {
    assert.equal(article.assetPath, '/city-guides/' + article.slug + '.html', 'Guide asset path must match its catalog slug');
    const {source, input} = materials.get(article.slug);
    // Curated inline data stays with the article. Its raw research, snapshots,
    // source JSON and social caches never become deployable files.
    const configText = /<script type="application\/json" id="guide-config">([\s\S]*?)<\/script>/.exec(input)?.[1];
    assert.ok(configText, 'Curated guide source data is required: ' + article.slug);
    const config = JSON.parse(configText);
    // Topic guides carry source dates but never invent an FX date; budget
    // guides keep the full checkedOn + fx + sources requirements.
    const topicGuide = config.config?.kind === 'topic';
    assert.equal(topicGuide, article.topic === true, 'Guide topic flag must match its source kind: ' + article.slug);
    assert.ok(config.config?.checkedOn && Object.keys(config.config.sources || {}).length, 'Guide source dates and source attribution are required: ' + article.slug);
    if (!topicGuide) assert.ok(config.config.fx?.date, 'Budget guide FX date is required: ' + article.slug);
    for (const sourceRecord of Object.values(config.config.sources)) assert.match(sourceRecord.url || '', /^https:\/\//, 'Guide source attribution must link to a public HTTPS source');
    for (const name of imageReferences(input).images) expectedAssets.set('assets/' + name, 'images/' + name);
    const html = publishGuideHTML(input, article);
    pages.push({article, source, html, checkedOn: config.config.checkedOn, fxDate: config.config.fx?.date ?? null});
  }
  const destinations = new Set();
  for (const asset of manifest.assets) {
    assert.equal(declaredAssets.get(asset.source), asset.destination, 'Asset is not in the guide publication allowlist: ' + asset.source);
    assert.ok(!destinations.has(asset.destination), 'Duplicate public guide asset: ' + asset.destination);
    destinations.add(asset.destination);
    const bytes = await readFile(join(sourceDirectory, asset.source));
    assert.equal(sha256(bytes), asset.sha256, 'Approved guide asset hash changed: ' + asset.source);
    if (expectedAssets.has(asset.source)) assetBuffers.set(asset.destination, bytes);
  }
  assert.equal(assetBuffers.size, expectedAssets.size, 'A required public guide asset is missing from the publication manifest');
  // Everything is checked before the first output write. Clean obsolete files
  // only inside the two owned generated directories, including withdrawn drafts.
  await Promise.all([mkdir(outputDirectory, {recursive: true}), mkdir(assetDirectory, {recursive: true})]);
  for (const page of pages) await writeFile(join(outputDirectory, page.article.slug + '.html'), page.html);
  for (const [destination, bytes] of assetBuffers) {
    const path = join(assetDirectory, destination);
    await mkdir(dirname(path), {recursive: true}); await writeFile(path, bytes);
  }
  const allowedPages = new Set(pages.map(page => page.article.slug + '.html'));
  for (const file of await existingFiles(outputDirectory)) if (!allowedPages.has(file)) await rm(join(outputDirectory, file));
  for (const file of await existingFiles(assetDirectory)) if (!assetBuffers.has(file)) await rm(join(assetDirectory, file));
  const report = {
    schemaVersion: 1, origin: SITE, sourceEdition: manifest.sourceEdition,
    publicationApprovedOn: manifest.publication.approvedOn,
    pages: pages.map(page => ({slug: page.article.slug, path: page.article.path, assetPath: page.article.assetPath, sourceSha256: page.source.sha256, sha256: sha256(page.html), updatedAt: page.article.updatedAt, checkedOn: page.checkedOn, fxDate: page.fxDate})),
    assets: [...assetBuffers].map(([path, bytes]) => ({path: '/guide-assets/' + path, bytes: bytes.length, sha256: sha256(bytes)})),
    rawEvidenceFilesCopied: 0,
  };
  if (reportPath) { await mkdir(dirname(reportPath), {recursive: true}); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = await buildCityGuides();
  console.log(`Published guide package: ${report.pages.length} pages, ${report.assets.length} approved assets; raw evidence files copied: 0.`);
}
