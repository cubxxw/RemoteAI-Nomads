import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPages} from '../scripts/audit-seo.mjs';

const origin = 'https://example.com/nomads';
const html = (canonical, {robots = 'index,follow', title = '页面', description = '页面说明', links = '', schema = '{"@context":"https://schema.org","@type":"WebPage"}'} = {}) =>
  `<html><head><title>${title}</title><meta name="description" content="${description}"><meta name="robots" content="${robots}"><link rel="canonical" href="${canonical}"><script type="application/ld+json">${schema}</script></head><body><h1>${title}</h1>${links}</body></html>`;

test('audit rejects sitemap targets that are missing, noindex, repeated, queried or noncanonical', () => {
  const report = auditPages({origin, pages: [
    {url: origin, html: html(origin)},
    {url: origin + '/draft/', html: html(origin + '/draft/', {robots: 'noindex,follow'})},
    {url: origin + '/alias/', html: html(origin)},
  ], sitemap: [origin, origin, origin + '/draft/', origin + '/missing/', origin + '/alias/', origin + '?month=1']});
  assert.deepEqual(new Set(report.errors.map(item => item.code)), new Set(['sitemap_duplicate', 'sitemap_noindex', 'sitemap_missing', 'sitemap_noncanonical', 'sitemap_query']));
});

test('audit accepts canonical aliases outside the sitemap and follows mounted HTML links', () => {
  const guide = origin + '/guides/first-month/';
  const report = auditPages({origin, pages: [
    {url: origin, html: html(origin, {links: '<a href="/nomads/guides/first-month/">指南</a>'})},
    {url: origin + '/cities/', html: html(origin)},
    {url: guide, html: html(guide, {title: '试住指南'})},
  ], sitemap: [origin, guide]});
  assert.equal(report.errors.length, 0);
  assert.ok(!report.warnings.some(item => ['orphan_page', 'duplicate_title', 'indexable_without_sitemap'].includes(item.code)));
  assert.equal(report.summary.canonicalPages, 2);
});

test('audit catches broken page metadata and schema instead of silently accepting malformed HTML', () => {
  const report = auditPages({origin, pages: [{url: origin, html: '<html><head><title> </title><link rel="canonical" href="' + origin + '"><link rel="canonical" href="' + origin + '/other/"><script type="application/ld+json">{bad}</script></head><body></body></html>'}], sitemap: [origin]});
  for (const code of ['missing_title', 'missing_description', 'multiple_canonical', 'missing_robots', 'h1_count', 'invalid_schema']) assert.ok(report.errors.some(item => item.code === code), code);
});

test('audit reports undiscovered content and duplicate descriptions across distinct canonical pages', () => {
  const child = origin + '/guides/unlinked/';
  const report = auditPages({origin, pages: [{url: origin, html: html(origin)}, {url: child, html: html(child)}], sitemap: [origin, child]});
  assert.equal(report.errors.length, 0);
  assert.ok(report.warnings.some(item => item.code === 'orphan_page' && item.url === child));
  assert.ok(report.warnings.some(item => item.code === 'duplicate_description'));
});

test('invalid JSON-LD node shapes are reported without crashing the audit', () => {
  for (const schema of ['42', '"not a schema"', '{}', '[]', '[null]', '{"@graph":42}', '{"@type":42}']) {
    const url = origin + '/cities/tokyo/';
    const report = auditPages({origin, pages: [{url, html: html(url, {schema})}], sitemap: [url]});
    assert.ok(report.errors.some(item => item.code === 'invalid_schema'), schema);
  }
});
