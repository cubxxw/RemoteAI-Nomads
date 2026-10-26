import {McpServer, createMcpHandler, originValidationResponse} from '@modelcontextprotocol/server';
import {tools} from './tools.js';
import {query} from './query.js';

const MAX_BODY = 16384;
const snapshots = new WeakMap();
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, follow'};
const json = (body, status = 200, extra = {}) => Response.json(body, {status, headers: {...headers, ...extra}});
const error = (code, message, status, extra) => json({error: {code, message}}, status, extra);

async function snapshot(env) {
  if (!env.ASSETS) throw Error('Missing public assets');
  let pending = snapshots.get(env.ASSETS);
  if (!pending) {
    pending = (async () => {
      const manifestResponse = await env.ASSETS.fetch(new Request('https://assets.invalid/data/manifest.json'));
      if (!manifestResponse.ok) throw Error('Missing manifest');
      const manifest = await manifestResponse.json();
      if (manifest.schema_version !== 1 || !/^\/data\/public-[0-9a-f]{20}\.json$/.test(manifest.path)) throw Error('Invalid manifest');
      const asset = await env.ASSETS.fetch(new Request('https://assets.invalid' + manifest.path));
      if (!asset.ok) throw Error('Missing snapshot');
      const bytes = await asset.arrayBuffer();
      if (bytes.byteLength > 8 * 1024 * 1024) throw Error('Snapshot too large');
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (digest !== manifest.sha256) throw Error('Invalid snapshot checksum');
      const data = JSON.parse(new TextDecoder().decode(bytes));
      if (data.schema_version !== 1 || data.data_version !== manifest.data_version) throw Error('Invalid snapshot version');
      return data;
    })();
    snapshots.set(env.ASSETS, pending);
    pending.catch(() => {if (snapshots.get(env.ASSETS) === pending) snapshots.delete(env.ASSETS);});
  }
  return pending;
}

async function readJSON(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY) throw Object.assign(Error('Too large'), {status: 413});
  const chunks = []; let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {await reader.cancel(); throw Object.assign(Error('Too large'), {status: 413});}
        chunks.push(value);
      }
    } finally {reader.releaseLock();}
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  try {return JSON.parse(new TextDecoder().decode(bytes));}
  catch {throw Object.assign(Error('Invalid JSON'), {status: 400});}
}

async function rateLimit(request, env) {
  if (!env.BURST_LIMIT && !env.MINUTE_LIMIT) return true;
  const network = request.headers.get('CF-Connecting-IP') || 'unidentified-network';
  const day = new Date().toISOString().slice(0, 10);
  const bytes = new TextEncoder().encode((env.RATE_LIMIT_SALT || '') + day + '|' + network);
  const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
  const results = await Promise.all([env.BURST_LIMIT, env.MINUTE_LIMIT].filter(Boolean).map(binding => binding.limit({key})));
  return results.every(r => r.success);
}

function server(env) {
  const instance = new McpServer({name: 'roamorrow-nomads', version: '0.1.0'}, {
    instructions: '公开只读旅居资料。优先nomads_get_context，一次获得候选、证据和缺项；通常可先给结果，只补问会改变结论的一项。历史数据不是现价、天气预报或资格保证。',
  });
  for (const tool of tools) {
    instance.registerTool(tool.name, {description: tool.description, inputSchema: tool.schema, annotations: tool.annotations},
      async args => {
        const result = query(await snapshot(env), tool.name, args);
        return {content: [{type: 'text', text: JSON.stringify(result)}], structuredContent: result, isError: !!result.error};
      });
  }
  return instance;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url), api = url.pathname === '/api/query', mcp = url.pathname === '/mcp';
    const cors = api ? {'Access-Control-Allow-Origin': '*'} : request.headers.has('Origin') ?
      {'Access-Control-Allow-Origin': request.headers.get('Origin'), Vary: 'Origin'} : {};
    if (mcp) {
      const allowed = ['roamorrow.com', 'mcp.roamorrow.com', 'localhost', '127.0.0.1',
        ...(env.ALLOWED_ORIGIN_HOSTS || '').split(',').map(s => s.trim()).filter(Boolean)];
      const rejection = originValidationResponse(request, allowed);
      if (rejection) return error('ORIGIN_NOT_ALLOWED', '此浏览器来源未获允许；桌面客户端无需Origin标头。', 403);
    }
    if ((api || mcp) && request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {
      ...headers, ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id, MCP-Method, MCP-Client-Info, MCP-Client-Capabilities',
      'Access-Control-Expose-Headers': 'MCP-Protocol-Version, Retry-After',
    }});
    if (url.pathname === '/healthz') {
      try {const data = await snapshot(env); return json({ok: true, data_version: data.data_version, cities: data.cities.length});}
      catch {return error('DATA_UNAVAILABLE', '公开资料暂时不可用，请稍后重试。', 503, {'Retry-After': '60'});}
    }
    if (!api && !mcp) return env.ASSETS ? env.ASSETS.fetch(request) : error('NOT_FOUND', '没有这个地址。', 404);
    if (env.MCP_ENABLED === 'false') return error('MAINTENANCE', '资料服务维护中，请稍后重试。', 503, {...cors, 'Retry-After': '60'});
    if (request.method !== 'POST') return error('METHOD_NOT_ALLOWED', '请用客户端发送POST查询。', 405, {...cors, Allow: 'POST, OPTIONS'});
    try {
      if (!await rateLimit(request, env)) return error('RATE_LIMITED', '查询较密集，请稍后重试。', 429, {...cors, 'Retry-After': '60'});
      const body = await readJSON(request);
      if (!body || typeof body !== 'object' || Array.isArray(body)) return error('INVALID_REQUEST', '请发送一个查询对象。', 400, cors);
      if (api) {
        if (Object.keys(body).some(k => !['tool', 'arguments'].includes(k)) || typeof body.tool !== 'string' ||
            body.arguments !== undefined && (!body.arguments || typeof body.arguments !== 'object' || Array.isArray(body.arguments))) {
          return error('INVALID_REQUEST', '使用tool和arguments发送查询。', 400, cors);
        }
        return json(query(await snapshot(env), body.tool, body.arguments || {}), 200, cors);
      }
      // SDK v2 owns both 2026 stateless requests and legacy 2025 handshakes.
      // https://github.com/modelcontextprotocol/typescript-sdk
      const handler = createMcpHandler(() => server(env), {maxRequestBodySize: MAX_BODY, maxSubscriptions: 0});
      try {
        const response = await handler.fetch(request, {parsedBody: body});
        const outgoing = new Headers(response.headers);
        for (const [key, value] of Object.entries({...headers, ...cors})) outgoing.set(key, value);
        return new Response(response.body, {status: response.status, headers: outgoing});
      } finally {await handler.close();}
    } catch (cause) {
      if (cause.status) return error(cause.status === 413 ? 'REQUEST_TOO_LARGE' : 'INVALID_JSON',
        cause.status === 413 ? '查询内容过大，请只传本次需要的条件。' : '查询不是有效JSON。', cause.status, cors);
      return error('DATA_UNAVAILABLE', '公开资料暂时不可用，请稍后重试。', 503, {...cors, 'Retry-After': '60'});
    }
  },
};
