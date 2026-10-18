import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client';
import { submitCheckDefinition } from '../agent/presentation.mjs';
import { validateArgs } from '../src/agent-tools.js';
import { acceptedAudit } from '../agent/grounding.mjs';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const directory = path.join(root, 'evals', 'semantic-results', stamp);
await mkdir(directory, { recursive: true, mode: 0o700 });
const fixtureText = await readFile(path.join(root, 'evals/semantic-pairs.json'), 'utf8');
const fixture = JSON.parse(fixtureText);
const prompt = await readFile(path.join(root, 'agent/checker-prompt.txt'), 'utf8');
// Credentials are loaded internally using the existing local runner convention.
// Neither credential values nor raw runtime diagnostics are written to results.
const config = Object.fromEntries((await readFile(path.join(root, '.dev.vars'), 'utf8')).split('\n')
  .filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => {
    const separator = line.indexOf('=');
    return [line.slice(0, separator), line.slice(separator + 1).trim()];
  }));
const digest = value => createHash('sha256').update(value).digest('hex');
const fingerprints = {
  checker_prompt_sha256: digest(prompt), fixture_sha256: digest(fixtureText),
  accepted_audit_sha256: digest(await readFile(path.join(root, 'agent/grounding.mjs'))),
  submission_schema_sha256: digest(await readFile(path.join(root, 'agent/presentation.mjs'))),
  sdk_version: '0.2.1-alpha.2', model: 'deepseek-v4-pro',
};
await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ directory, ...fingerprints }, null, 2), { mode: 0o600 });
await writeFile(path.join(directory, 'checker-prompt.snapshot.txt'), prompt, { mode: 0o600 });
await writeFile(path.join(directory, 'semantic-pairs.snapshot.json'), fixtureText, { mode: 0o600 });
const active = new Map();
const server = http.createServer(async (req, res) => {
  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const state = active.get(token);
    if (!state) { res.writeHead(403); res.end('{}'); return; }
    let raw = '', bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 128000) throw Error('AUDIT_BODY_LIMIT');
      raw += chunk;
    }
    const body = JSON.parse(raw || '{}');
    if (req.url === '/reserve' && ++state.requests > 3) throw Error('AUDIT_REQUEST_LIMIT');
    if (req.url === '/tool') {
      if (body.name !== 'submit_check' || !validateArgs(body.args, submitCheckDefinition.parameters)) throw Error('INVALID_AUDIT');
      state.submissions.push(structuredClone(body.args));
      state.result = structuredClone(body.args);
    }
    if (req.url === '/usage') {
      for (const [name, value] of Object.entries(body.usage || {})) {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) state.usage[name] = (state.usage[name] || 0) + value;
      }
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ received: true }));
  } catch {
    if (!res.headersSent) res.writeHead(400);
    res.end('{}');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const selectedEfforts = process.argv.slice(2).filter(value => ['low', 'high'].includes(value));
const efforts = selectedEfforts.length ? [...new Set(selectedEfforts)] : ['low', 'high'];
// Each run has a fresh opaque workspace/session and sees no gold label or pair ID.
const pairFilter = process.argv.slice(2).find(value => value.startsWith('--pair='))?.slice(7);
const polarityFilter = process.argv.slice(2).find(value => value.startsWith('--polarity='))?.slice(11);
const tasks = efforts.flatMap(effort => fixture.pairs.filter(pair => !pairFilter || pair.id === pairFilter).flatMap((pair, index) =>
  (index % 2 ? ['negative', 'positive'] : ['positive', 'negative']).filter(polarity => !polarityFilter || polarity === polarityFilter)
    .map(polarity => ({ effort, pair, polarity }))));
const results = [];
let cursor = 0;
async function run({ effort, pair, polarity }) {
  const started = Date.now();
  const token = randomBytes(24).toString('hex');
  const state = { requests: 0, usage: {}, submissions: [] };
  active.set(token, state);
  const workspace = path.join(directory, 'runtime', randomUUID());
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const expiresAt = Date.now() + 180000;
  const patches = [
    ...['persistent-bash', 'persistent-pwsh', 'tool-working-directory', 'llm-retry', 'session-title'].map(id => ({ id, disabled: true })),
    { id: 'sandbox-policy', name: '@deepseek-ai/dsh-sandbox-policy', config: { mode: 'read-only', workspaceRoot: workspace } },
    { id: 'tools', name: '@deepseek-ai/dsh-tools', config: { mode: 'native' } },
    { insert: [{ id: 'audit-submit', name: path.join(root, 'agent/nomad-plugin.mjs'), inject: ['tools', 'llm'], config: {
      definitions: [submitCheckDefinition], bridgeUrl: 'http://127.0.0.1:' + server.address().port, token, expiresAt,
    } }] },
  ];
  const patch = path.join(workspace, 'patch.json');
  await writeFile(patch, JSON.stringify(patches), { mode: 0o600 });
  const childEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy']
    .filter(name => process.env[name]).map(name => [name, process.env[name]]));
  Object.assign(childEnv, { DEEPSEEK_API_KEY: config.DEEPSEEK_API_KEY, DSH_SYSTEM_PROMPT: prompt, NODE_USE_ENV_PROXY: '1', NO_PROXY: '127.0.0.1,localhost,::1', no_proxy: '127.0.0.1,localhost,::1' });
  const harness = new DeepSeekHarness({ profile: 'sdk-minimal', patches: [patch], dshHome: path.join(workspace, 'home'),
    processCwd: workspace, cwd: workspace, env: childEnv, provider: 'deepseek-official', model: 'deepseek-v4-pro',
    reasoningEffort: effort, maxTokens: 16384, initializeTimeoutMs: 20000, requestTimeoutMs: 180000 });
  let error, reaped = false;
  const timer = setTimeout(() => { error = 'AUDIT_WALL_TIMEOUT'; harness.close().catch(() => {}); }, 180000);
  try {
    const reply = await harness.run(JSON.stringify({ question: pair.question, answer: pair[polarity], cities: [], evidence: pair.evidence }));
    if (!state.result) state.finalResponse = reply.finalResponse || '';
    if (!state.result) error = 'NO_NATIVE_AUDIT_SUBMISSION';
  } catch (failure) {
    error ||= /^[A-Z_]{1,80}$/.test(failure.message || '') ? failure.message : 'AUDIT_RUNTIME_ERROR';
  } finally {
    clearTimeout(timer);
    try { await harness.close(); reaped = true; } catch { error = 'AUDIT_CLOSE_FAILED'; }
    active.delete(token);
    await rm(workspace, { recursive: true, force: true });
  }
  const accepted = !error && acceptedAudit(state.result);
  const result = { pair_id: pair.id, polarity, effort, model: 'deepseek-v4-pro',
    expected_accepted: polarity === 'positive', actual_accepted: accepted,
    verdict_matches_expected: !error && accepted === (polarity === 'positive'),
    target_error: pair.target_error, question: pair.question, answer: pair[polarity], evidence: pair.evidence,
    audit: state.result, submissions: state.submissions, final_response_without_submission: state.finalResponse,
    requests: state.requests, usage: state.usage,
    elapsed_ms: Date.now() - started, runtime_reaped: reaped, error,
    reason_review: 'Pending independent manual review; a matching rejection alone does not prove the target error was detected.',
  };
  await writeFile(path.join(directory, `${effort}-${pair.id}-${polarity}.json`), JSON.stringify(result, null, 2), { mode: 0o600 });
  results.push(result);
  console.log(JSON.stringify({ pair_id: pair.id, polarity, effort, actual_accepted: accepted,
    verdict_matches_expected: result.verdict_matches_expected, error, elapsed_ms: result.elapsed_ms }));
}
try {
  const workers = await Promise.allSettled(Array.from({ length: 2 }, async () => {
    while (cursor < tasks.length) await run(tasks[cursor++]);
  }));
  const workerFailures = workers.filter(result => result.status === 'rejected').length;
  const summary = { directory, ...fingerprints, cases: results.length,
    scheduled_cases: tasks.length, worker_failures: workerFailures,
    verdict_matches_expected: results.filter(result => result.verdict_matches_expected).length,
    manual_target_reason_review_required: true,
    results: results.map(({ pair_id, polarity, effort, expected_accepted, actual_accepted, verdict_matches_expected, requests, elapsed_ms, runtime_reaped, error }) =>
      ({ pair_id, polarity, effort, expected_accepted, actual_accepted, verdict_matches_expected, requests, elapsed_ms, runtime_reaped, error })) };
  await writeFile(path.join(directory, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ completed: results.length, directory }));
} finally {
  await new Promise(resolve => server.close(resolve));
  await rm(path.join(directory, 'runtime'), { recursive: true, force: true });
}
