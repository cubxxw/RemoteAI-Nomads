#!/usr/bin/env node
// Optional JSON fallback. No dependencies, local profile, cookies or account.
const fail = message => {process.stderr.write(message + '\n'); process.exitCode = 1;};
try {
  const tool = process.argv[2];
  if (!/^nomads_[a-z_]+$/.test(tool || '')) throw Error('用法：node query.mjs nomads_get_context < arguments.json');
  let raw = process.argv[3] || '';
  if (!raw) for await (const chunk of process.stdin) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 15000) throw Error('只传本次需要的条件，参数最多15000字节。');
  }
  const args = JSON.parse(raw || '{}');
  const url = new URL(process.env.NOMADS_API_URL || 'https://mcp.roamorrow.com/api/query');
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === 'https:' || url.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(url.hostname))) {
    throw Error('使用公开HTTPS接口；本地测试可用localhost HTTP。不要把密钥放进地址。');
  }
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({tool, arguments: args}), signal: AbortSignal.timeout(15000)});
  if (!(response.headers.get('Content-Type') || '').includes('application/json')) throw Error('接口未返回JSON，请检查NOMADS_API_URL。');
  const result = await response.json();
  process.stdout.write(JSON.stringify(result) + '\n');
  if (!response.ok || result.error) process.exitCode = 1;
} catch (error) {
  fail(['TimeoutError','AbortError'].includes(error.name) ? '查询超时，请稍后重试。' :
    error instanceof SyntaxError ? '参数需要有效JSON。' : error.message === 'fetch failed' ?
      '资料服务未连接；开发时可设置NOMADS_API_URL指向本地/api/query。' : error.message);
}
