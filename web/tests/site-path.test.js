import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {shell} from '../src/render.js';
import {withPlanMonth} from '../public/modules/trip-state.js';
import {countryHref,renderCountryPreview} from '../public/modules/country-map.js';

const site = 'https://roamorrow.com/nomads';
const context = {waitUntil() {}};

test('mounted release endpoint stays inside the public namespace without redirecting', async () => {
  const response = await worker.fetch(new Request('https://nomads.cubxxw.com/nomads/release.json'), {
    PREVIEW: 'false', SITE_ORIGIN: site, RELEASE_ID: 'mount-test',
  }, context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).release_id, 'mount-test');
});

test('mounted HTML links and canonical home resolve under Nomads, not the main product', () => {
  const html = shell({title: '城市排行', description: '选城', body: '<a href="/cities/chiang-mai/?month=11">清迈</a><a href="https://example.com/a">来源</a>', env: {PREVIEW: 'false', SITE_ORIGIN: site}, indexable: true});
  assert.match(html, /rel="canonical" href="https:\/\/roamorrow\.com\/nomads"/);
  assert.match(html, /href="\/nomads\/cities\/chiang-mai\/\?month=11"/);
  assert.match(html, /src="\/nomads\/app\.js"/);
  assert.match(html, /href="https:\/\/example\.com\/a"/);
  assert.doesNotMatch(html, /(?:href|src|action)="\/(?!nomads(?:\/|"))/);
});

test('mounted static resources reach the asset binding at their original path', async () => {
  const response = await worker.fetch(new Request('https://nomads.cubxxw.com/nomads/app.js?v=2'), {
    SITE_ORIGIN: site, PREVIEW: 'false', ASSETS: {async fetch(request) {
      const url = new URL(request.url);
      return new Response(url.pathname + url.search, {headers: {'Content-Type': 'text/javascript'}});
    }},
  }, context);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '/app.js?v=2');
});

test('legacy redirects retain deep paths and shared filters after cutover is enabled', async () => {
  const response = await worker.fetch(new Request('https://nomads.cubxxw.com/cities/chiang-mai/?month=11&budget=8000'), {
    SITE_ORIGIN: site, PREVIEW: 'false', LEGACY_REDIRECT: 'true',
  }, context);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), 'https://roamorrow.com/nomads/cities/chiang-mai/?month=11&budget=8000');
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('open legacy tabs retain their agent session until they move to the new site',async()=>{
 const env={SITE_ORIGIN:site,PREVIEW:'false',LEGACY_REDIRECT:'true',PUBLIC_AGENT:'true',AGENT_BRIDGE_SECRET:'fixture-secret',NOMAD_AGENT:{idFromName(name){return name;},get(){return {async fetch(){return Response.json({ready:true});}};}}};
 const response=await worker.fetch(new Request('https://nomads.cubxxw.com/api/agent/status',{headers:{Origin:'https://nomads.cubxxw.com'}}),env,context);
 assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/Path=\/api\/agent\//);
});

test('compatibility stage keeps the legacy release endpoint working before cutover', async () => {
  const response = await worker.fetch(new Request('https://nomads.cubxxw.com/release.json'), {
    SITE_ORIGIN: site, PREVIEW: 'false', RELEASE_ID: 'compatibility', LEGACY_REDIRECT: 'false',
  }, context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).release_id, 'compatibility');
});

test('agent status uses the public origin and scopes its cookie to the mounted API', async () => {
  const env = {SITE_ORIGIN: site, PREVIEW: 'false', PUBLIC_AGENT: 'true', AGENT_BRIDGE_SECRET: 'fixture-secret',
    NOMAD_AGENT: {idFromName(name) {return name;}, get() {return {async fetch() {return Response.json({ready: true});}};}},
  };
  const response = await worker.fetch(new Request('https://nomads.cubxxw.com/nomads/api/agent/status', {headers: {Origin: 'https://roamorrow.com'}}), env, context);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ready, true);
  assert.match(response.headers.get('Set-Cookie'), /Path=\/nomads\/api\/agent\//);
  const denied = await worker.fetch(new Request('https://nomads.cubxxw.com/nomads/api/agent/status', {headers: {Origin: 'https://other.example'}}), env, context);
  assert.equal(denied.status, 403);
});

test('mounted canonical redirects keep their prefix and do not change the query', async () => {
  const response = await worker.fetch(new Request('https://nomads.cubxxw.com/nomads/cities/chiang-mai?month=11'), {
    SITE_ORIGIN: site, PREVIEW: 'false',
  }, context);
  assert.equal(response.status, 308);
  assert.equal(response.headers.get('Location'), 'https://roamorrow.com/nomads/cities/chiang-mai/?month=11');
});

test('client-generated journey and country links stay mounted with or without a selected month', () => {
  const previous = globalThis.document;
  globalThis.document = {documentElement: {dataset: {nomadsBase: '/nomads'}}};
  try {
    assert.equal(withPlanMonth('/cities/chiang-mai/', 11), '/nomads/cities/chiang-mai/?month=11');
    assert.equal(withPlanMonth('/cities/chiang-mai/', null), '/nomads/cities/chiang-mai/');
    assert.equal(withPlanMonth('/nomads/cities/chiang-mai/', 11), '/nomads/cities/chiang-mai/?month=11');
    assert.equal(countryHref('TH'), '/nomads/countries/th/');
    const city = {slug: 'chiang-mai', name: '清迈', countryCode: 'TH', lat: 18.79, lon: 98.98, rank: 1};
    const html = renderCountryPreview({code: 'TH', name: '泰国', nameEn: 'Thailand', cities: [city], visible: [city]});
    assert.match(html, /href="\/nomads\/cities\/chiang-mai\/"/);
  } finally {if (previous === undefined) delete globalThis.document; else globalThis.document = previous;}
});

test('legacy local-data export stays available after public URLs move',async()=>{
  const env={SITE_ORIGIN:site,PREVIEW:'false',LEGACY_REDIRECT:'true',ASSETS:{async fetch(request){return new Response(new URL(request.url).pathname,{headers:{'Content-Type':'text/html'}});}}};
  const response=await worker.fetch(new Request('https://nomads.cubxxw.com/local-data/'),env,context);
  assert.equal(response.status,200);assert.equal(await response.text(),'/local-data.html');
  assert.match(response.headers.get('X-Robots-Tag'),/noindex/);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
});

test('legacy lazy modules and map data remain same-origin after the public-page redirect is enabled',async()=>{
 const env={SITE_ORIGIN:site,PREVIEW:'false',LEGACY_REDIRECT:'true',ASSETS:{async fetch(request){return new Response(new URL(request.url).pathname);}}};
 for(const path of ['/modules/agent-ui.js','/map/world.json','/places/chiang-mai.json']){
  const response=await worker.fetch(new Request('https://nomads.cubxxw.com'+path),env,context);
  assert.equal(response.status,200);assert.equal(await response.text(),path);
 }
});

test('legacy HTTP compatibility redirects to HTTPS without repeating the same URL',async()=>{
 const response=await worker.fetch(new Request('http://nomads.cubxxw.com/cities/chiang-mai/?month=11'),{SITE_ORIGIN:site,PREVIEW:'false',LEGACY_REDIRECT:'false'},context);
 assert.equal(response.status,308);assert.equal(response.headers.get('Location'),'https://nomads.cubxxw.com/cities/chiang-mai/?month=11');
});
