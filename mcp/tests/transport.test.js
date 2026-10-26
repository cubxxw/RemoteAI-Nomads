import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {Client as ModernClient, StreamableHTTPClientTransport as ModernTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createSnapshot} from '../scripts/build-data.mjs';
import worker from '../src/worker.js';

const seed = JSON.parse(gunzipSync(await readFile(new URL('../../web/data/public-catalog.json.gz', import.meta.url))));
const snapshot = createSnapshot(seed), body = JSON.stringify(snapshot);
const manifest = {schema_version: 1, data_version: snapshot.data_version, path: '/data/' + snapshot.data_version + '.json',
  sha256: createHash('sha256').update(body).digest('hex')};
const env = {ASSETS: {async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/data/manifest.json') return Response.json(manifest);
  if (path === manifest.path) return new Response(body, {headers: {'Content-Type': 'application/json'}});
  return new Response('Not found', {status: 404});
}}};
const call = (data, options = {}) => worker.fetch(new Request('https://mcp.test/api/query', {
  method: 'POST', headers: {'Content-Type': 'application/json', ...options.headers}, body: JSON.stringify(data),
}), options.env || env, {});

test('ordinary JSON access needs no account and uses the same typed query boundary', async () => {
  const response = await call({tool: 'nomads_get_context', arguments: {place: '泰国', months: [11]}});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Set-Cookie'), null);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  const result = await response.json();
  assert.equal(result.data.place.id, 'country:TH');
  assert.ok(result.sources.length);
  const invalid = await call({tool: 'nomads_find_cities', arguments: {limit: 1000}});
  assert.equal((await invalid.json()).error.code, 'INVALID_ARGUMENTS');
});

for (const [name, Client, Transport] of [['2026 SDK v2', ModernClient, ModernTransport], ['2025 SDK v1', LegacyClient, LegacyTransport]]) {
  test(name + ' discovers twelve tools and reads real country context without auth or sessions', async () => {
    const requests = [];
    const transport = new Transport(new URL('https://mcp.test/mcp'), {fetch: async (input, init) => {
      const request = new Request(input, init); requests.push(request.clone());
      return worker.fetch(request, env, {});
    }});
    const client = new Client({name: 'nomads-compatibility-test', version: '1.0.0'});
    try {
      await client.connect(transport);
      const listed = await client.listTools();
      assert.equal(listed.tools.length, 12);
      assert.ok(listed.tools.every(t => t.annotations.readOnlyHint));
      const result = await client.callTool({name: 'nomads_get_context', arguments: {place: '泰国', months: [11]}});
      assert.equal(result.isError, false);
      assert.equal(result.structuredContent.data.place.id, 'country:TH');
      assert.ok(result.structuredContent.sources.length);
      assert.ok(requests.every(r => !r.headers.has('Authorization')));
      assert.ok(requests.every(r => !r.headers.has('Mcp-Session-Id')));
    } finally {await client.close();}
  });
}

test('request bytes, malformed JSON, origins and overload receive bounded errors', async () => {
  const large = await call({tool: 'nomads_get_context', arguments: {place: 'x'.repeat(17000)}});
  assert.equal(large.status, 413);
  const malformed = await worker.fetch(new Request('https://mcp.test/api/query', {method: 'POST', body: '{'}), env, {});
  assert.equal(malformed.status, 400);
  const forbidden = await worker.fetch(new Request('https://mcp.test/mcp', {method: 'POST', headers: {Origin: 'https://unrelated.example'},
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'tools/list'})}), env, {});
  assert.equal(forbidden.status, 403);
  const rebound = await worker.fetch(new Request('http://attacker.invalid/mcp', {method: 'POST',
    headers: {Origin: 'http://attacker.invalid'}, body: '{}'}), env, {});
  assert.equal(rebound.status, 403, 'a request hostname cannot grant itself an allowed browser origin');
  const overloaded = await call({tool: 'nomads_get_catalog_info'}, {env: {...env, BURST_LIMIT: {async limit() {return {success: false};}}}});
  assert.equal(overloaded.status, 429);
  assert.ok(overloaded.headers.get('Retry-After'));
  assert.equal(overloaded.headers.get('Location'), null);
});

test('a damaged snapshot cannot be served as successful public data', async () => {
  const damaged = {ASSETS: {async fetch(request) {
    return new URL(request.url).pathname.endsWith('manifest.json') ? Response.json(manifest) : new Response('{}');
  }}};
  const response = await call({tool: 'nomads_get_catalog_info'}, {env: damaged});
  assert.equal(response.status, 503);
  const error = await response.json();
  assert.equal(error.error.code, 'DATA_UNAVAILABLE');
  assert.ok(!JSON.stringify(error).includes('/Users/'));
});
