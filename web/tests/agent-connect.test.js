import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {copyField} from '../public/modules/agent-connect.js';
import {publishedFallback} from '../src/published-fallback.js';
import {readFile} from 'node:fs/promises';

const origin = 'https://roamorrow.com/nomads';
const env = {SITE_ORIGIN: origin, PREVIEW: 'false', RELEASE_ID: 'connect-test', DB: {
  prepare() { throw new Error('Onboarding must not depend on a database read'); },
}};
globalThis.caches = {default: {async match() {}, async put() {}}};
test.after(() => {delete globalThis.caches;});

test('Agent onboarding is public, mounted, discoverable and available without D1', async () => {
  const response = await worker.fetch(new Request(origin + '/developers/'), env, {waitUntil() {}});
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /rel="canonical" href="https:\/\/roamorrow\.com\/nomads\/developers\/"/);
  assert.match(html, /href="\/nomads\/developers\/" aria-current="page">Agent 接入/);
  assert.match(html, /https:\/\/mcp\.roamorrow\.com\/mcp/);
  assert.match(html, /https:\/\/mcp\.roamorrow\.com\/skills\/roamorrow-nomad-planner\.zip/);
  assert.match(html, /src="\/nomads\/modules\/agent-connect\.js"/);
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.equal(response.headers.get('X-Robots-Tag'), 'index, follow');
});

test('Agent onboarding respects query, preview, HEAD and method boundaries', async () => {
  for (const [query, options] of [['?utm_source=docs', env], ['', {...env, PREVIEW: 'true'}]]) {
    const response = await worker.fetch(new Request(origin + '/developers/' + query), options, {waitUntil() {}});
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, follow');
    assert.match(await response.text(), /content="noindex,follow"/);
  }
  const head = await worker.fetch(new Request(origin + '/developers/', {method: 'HEAD'}), env, {waitUntil() {}});
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  assert.equal((await worker.fetch(new Request(origin + '/developers/', {method: 'POST'}), env, {})).status, 405);
});

test('copy writes exact public text and falls back to manual selection if permission is denied', async () => {
  let selected = false, focused = false, copied;
  const field = {value: 'https://mcp.roamorrow.com/mcp', focus() {focused = true;}, select() {selected = true;}};
  const feedback = {textContent: ''};
  assert.equal(await copyField(field, feedback, {async writeText(value) {copied = value;}}), true);
  assert.equal(copied, field.value);
  assert.equal(selected, false);
  assert.match(feedback.textContent, /已复制/);
  assert.equal(await copyField(field, feedback, {async writeText() {throw new Error('Permission denied');}}), false);
  assert.equal(selected, true);
  assert.equal(focused, true);
  assert.match(feedback.textContent, /已选中文本/);
  selected = false;
  assert.equal(await copyField(field, feedback, null), false);
  assert.equal(selected, true);
});

test('published onboarding survives an outage with mounted assets and query indexing rules', async () => {
  const fallbackEnv = {...env, ASSETS: {async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.endsWith('/manifest.json')) return Response.json({version: 1, origin, paths: ['/developers/']});
    return new Response(await readFile(new URL('../public/published-pages/developers/index.html', import.meta.url)), {headers: {'Content-Type': 'text/html'}});
  }}};
  for (const query of ['', '?utm_source=docs']) {
    const response = await publishedFallback(new Request('https://roamorrow.com/developers/' + query), fallbackEnv);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /href="\/nomads\/agent-connect\.css"/);
    assert.match(html, /href="\/nomads\/developers\/" aria-current="page"/);
    assert.match(html, query ? /content="noindex,follow"/ : /content="index,follow"/);
    if (query) assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
});
