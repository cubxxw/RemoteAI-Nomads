// Offline audit of reviewed publication artifacts; no credentials or live D1.
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {publicAssetPath} from './build-public-pages.mjs';

const decode = value => value.replace(/&(?:amp|quot|apos|lt|gt|#39);/g, entity => ({'&amp;': '&', '&quot;': '"', '&apos;': "'", '&#39;': "'", '&lt;': '<', '&gt;': '>'}[entity]));
const attributes = tag => Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs)].map(match => [match[1].toLowerCase(), decode(match[3])]));
const tags = (html, name) => [...html.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'gi'))].map(match => attributes(match[0]));

function inspect(page) {
  const metadata = tags(page.html, 'meta');
  const jsonld = [...page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].filter(match => attributes(match[1]).type === 'application/ld+json');
  let invalidSchema = false;
  const schema = jsonld.flatMap(match => {
    try {
      const parsed = JSON.parse(match[2]);
      const nodes = Array.isArray(parsed) ? parsed : parsed?.['@graph'] ?? [parsed];
      const nonemptyString = value => typeof value === 'string' && value.trim().length > 0;
      if (!Array.isArray(nodes) || !nodes.length || nodes.some(node => {
        if (!node || typeof node !== 'object' || Array.isArray(node)) return true;
        const type = node['@type'];
        return type === undefined ? !nonemptyString(node['@id'])
          : !(nonemptyString(type) || (Array.isArray(type) && type.length > 0 && type.every(nonemptyString)));
      })) throw new Error('Invalid JSON-LD node shape');
      return nodes;
    }
    catch {invalidSchema = true; return [];}
  });
  return {...page,
    title: decode(page.html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim(),
    description: metadata.find(meta => meta.name?.toLowerCase() === 'description')?.content?.trim(),
    robots: metadata.find(meta => meta.name?.toLowerCase() === 'robots')?.content,
    canonical: tags(page.html, 'link').filter(link => link.rel?.toLowerCase() === 'canonical').map(link => link.href),
    links: tags(page.html, 'a').map(link => link.href).filter(Boolean),
    h1Count: (page.html.match(/<h1\b/gi) || []).length,
    bytes: Buffer.byteLength(page.html), schema, invalidSchema,
  };
}

export function auditPages({origin, pages, sitemap}) {
  const errors = [], warnings = [], inspected = pages.map(inspect);
  const byURL = new Map(inspected.map(page => [page.url, page]));
  const sitemapSet = new Set(sitemap), seen = new Set();
  const issue = (list, code, url, detail) => list.push({code, url, ...(detail ? {detail} : {})});
  for (const url of sitemap) {
    if (seen.has(url)) issue(errors, 'sitemap_duplicate', url);
    seen.add(url);
    const target = new URL(url);
    if (target.search || target.hash) {issue(errors, 'sitemap_query', url); continue;}
    const page = byURL.get(url);
    if (!page) {issue(errors, 'sitemap_missing', url); continue;}
    if (/\bnoindex\b/i.test(page.robots || '')) issue(errors, 'sitemap_noindex', url);
    if (page.canonical.length !== 1 || page.canonical[0] !== url) issue(errors, 'sitemap_noncanonical', url, page.canonical.join(', '));
  }
  const canonicalPages = inspected.filter(page => !/\bnoindex\b/i.test(page.robots || '') && page.canonical[0] === page.url);
  const incoming = new Set();
  for (const page of inspected) {
    for (const href of page.links) {
      try {
        const target = new URL(href, page.url);
        if (target.search || !['https:', 'http:'].includes(target.protocol)) continue;
        target.hash = '';
        if (target.href !== page.url) incoming.add(target.href);
      } catch {issue(warnings, 'invalid_link', page.url, href);}
    }
    if (/\bnoindex\b/i.test(page.robots || '') && !sitemapSet.has(page.url)) continue;
    for (const [code, valid] of [
      ['missing_title', !!page.title], ['missing_description', !!page.description],
      ['missing_canonical', page.canonical.length > 0], ['multiple_canonical', page.canonical.length <= 1],
      ['missing_robots', !!page.robots], ['h1_count', page.h1Count === 1], ['invalid_schema', !page.invalidSchema],
    ]) if (!valid) issue(errors, code, page.url);
    if (page.bytes > 300000) issue(warnings, 'large_html', page.url, String(page.bytes) + ' uncompressed bytes; measure real loading separately');
    if (page.schema.length === 0) issue(warnings, 'missing_schema', page.url);
    if (/\/(?:cities|guides)\/[^/]+\/$/.test(page.url) && !page.schema.some(node => node['@type'] === 'BreadcrumbList')) issue(warnings, 'missing_breadcrumb', page.url);
  }
  for (const page of canonicalPages) {
    if (!sitemapSet.has(page.url)) issue(warnings, 'indexable_without_sitemap', page.url);
    if (page.url !== origin && !incoming.has(page.url)) issue(warnings, 'orphan_page', page.url);
  }
  for (const field of ['title', 'description']) {
    const values = new Map();
    for (const page of canonicalPages) {
      const value = page[field];
      if (!value) continue;
      const urls = values.get(value) || []; urls.push(page.url); values.set(value, urls);
    }
    for (const [value, urls] of values) if (urls.length > 1) issue(warnings, 'duplicate_' + field, urls[0], JSON.stringify({value, urls}));
  }
  return {origin, summary: {pages: pages.length, sitemapURLs: sitemap.length, canonicalPages: canonicalPages.length, errors: errors.length, warnings: warnings.length}, errors, warnings};
}

export async function auditDirectory(directory) {
  const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'));
  const sitemap = [...(await readFile(resolve(directory, 'sitemap.xml'), 'utf8')).matchAll(/<loc>(.*?)<\/loc>/g)].map(match => decode(match[1]));
  const pages = await Promise.all(manifest.paths.filter(path => path.endsWith('/')).map(async path => ({
    url: manifest.origin + (path === '/' && new URL(manifest.origin).pathname !== '/' ? '' : path),
    html: await readFile(resolve(directory, publicAssetPath(path)), 'utf8'),
  })));
  return auditPages({origin: new URL(manifest.origin).href, pages, sitemap});
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.some((arg, i) => arg.startsWith('--') && (!['--directory', '--output'].includes(arg) || !args[i + 1] || args[i + 1].startsWith('--')))) throw new Error('Usage: node scripts/audit-seo.mjs [--directory PATH] [--output FILE]');
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : null;
  const directory = option('--directory') || fileURLToPath(new URL('../public/published-pages', import.meta.url));
  const report = await auditDirectory(directory);
  if (option('--output')) await writeFile(option('--output'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({origin: report.origin, ...report.summary, warningCounts: report.warnings.reduce((counts, item) => ({...counts, [item.code]: (counts[item.code] || 0) + 1}), {}), errors: report.errors}, null, 2));
  if (report.errors.length) process.exitCode = 1;
}
