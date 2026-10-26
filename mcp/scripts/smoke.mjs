// Exercise both official client generations against real HTTP/workerd.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {Client as ModernClient, StreamableHTTPClientTransport as ModernTransport} from '@modelcontextprotocol/client';
import {Client as LegacyClient} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport as LegacyTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const urlAt = process.argv.indexOf('--url');
let url = urlAt < 0 ? null : process.argv[urlAt + 1], child, log = '';
const root = fileURLToPath(new URL('..', import.meta.url));
try {
  if (!url) {
    const reservation = createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise(resolve => reservation.close(resolve));
    url = 'http://127.0.0.1:' + port + '/mcp';
    child = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js','dev','--ip','127.0.0.1','--port',String(port),'--inspector-port','0'],
      {cwd: root, stdio: ['ignore','pipe','pipe'], env: {...process.env, WRANGLER_SEND_METRICS: 'false'}});
    const capture = data => {log = (log + data).slice(-10000);};
    child.stdout.on('data', capture); child.stderr.on('data', capture);
    const deadline = Date.now() + 45000;
    let ready = false;
    while (Date.now() < deadline) {
      try {ready = (await fetch(new URL('/healthz', url), {signal: AbortSignal.timeout(1000)})).ok;} catch {}
      if (ready) break;
      if (child.exitCode !== null) break;
      await delay(250);
    }
    if (!ready) throw Error('Local Worker did not become ready.\n' + log);
  }
  for (const [generation, Client, Transport] of [['SDK v2.4', ModernClient, ModernTransport], ['SDK v1.29', LegacyClient, LegacyTransport]]) {
    const client = new Client({name: 'roamorrow-live-smoke', version: '1.0.0'});
    try {
      await client.connect(new Transport(new URL(url)));
      const list = await client.listTools(); assert.equal(list.tools.length, 12);
      const response = await client.callTool({name: 'nomads_get_context', arguments: {country: 'TH', months: [11],
        work_schedule: {home_timezone: 'Asia/Shanghai', date: '2026-11-16', times: ['09:00','18:00']}}});
      assert.equal(response.isError, false);
      const result = response.structuredContent;
      assert.equal(result.data.place.id, 'country:TH');
      assert.ok(result.data.candidates.length > 0);
      assert.ok(result.data.candidates.every(c => c.work.meeting_examples.times[0].local_time === '08:00'));
      const arithmetic = await client.callTool({name: 'nomads_calculate_budget', arguments: {
        budget: 5000, currency: 'CNY', days: 7, people: 2, reserve: 500,
        expenses: [{label: '整组住宿', category: 'housing', amount: 100, period: 'day', basis: 'group'},
          {label: '每人餐费', category: 'food', amount: 60, period: 'day', basis: 'person'}],
      }});
      assert.equal(arithmetic.structuredContent.data.remaining, 2960);
      console.log(JSON.stringify({generation, tools: list.tools.length, country: result.data.place.id,
        candidates: result.data.candidates.length, source_count: result.sources.length,
        data_version: result.data_version, login_required: false, result: 'pass'}));
    } finally {await client.close();}
  }
} finally {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(5000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
