import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { liveTargetFromArgs, validateLiveOrigin } from '../scripts/live-target.mjs';

test('live origins accept explicit HTTPS sites and HTTP loopback, normalizing a root slash', () => {
  assert.equal(validateLiveOrigin('https://my-nomads.example/'), 'https://my-nomads.example');
  assert.equal(validateLiveOrigin('https://my-nomads.example:8443'), 'https://my-nomads.example:8443');
  for (const origin of ['http://localhost:8787', 'http://127.0.0.1:8787', 'http://[::1]:8787']) assert.equal(validateLiveOrigin(origin), origin);
  assert.equal(validateLiveOrigin('https://roamorrow.com/nomads/'),'https://roamorrow.com/nomads');
});

test('credentials, unsafe mount paths, query/hash, malformed URLs, and remote plaintext origins fail closed', () => {
  for (const value of [undefined, '', 'https://', 'https://site.example/path%2Fa/', 'https://site.example/foo/../', 'https://site.example/?', 'https://site.example/#', 'https://site.example/?key=fixture', 'https://site.example/#x', 'https://user:fixture-secret@site.example', 'https://@site.example', 'https://site.example\\path', ' https://site.example', 'http://site.example', 'http://localhost.example', 'file:///tmp/test', 'ftp://site.example']) {
    assert.throws(() => validateLiveOrigin(value), error => error.code === 'INVALID_LIVE_TARGET' && !error.message.includes('fixture-secret'));
  }
});

test('live mode requires a target, local direct eval remains available, and duplicate or misplaced targets are rejected', () => {
  assert.equal(liveTargetFromArgs(['1', '2', '--extra']), null);
  assert.throws(() => liveTargetFromArgs(['--live']), error => error.code === 'LIVE_TARGET_REQUIRED');
  assert.throws(() => liveTargetFromArgs([], { required: true }), error => error.code === 'LIVE_TARGET_REQUIRED');
  assert.equal(liveTargetFromArgs(['--live', '--url', 'https://my-site.example', '14']), 'https://my-site.example');
  assert.equal(liveTargetFromArgs(['--url=https://my-site.example/']), 'https://my-site.example');
  assert.equal(liveTargetFromArgs(['https://my-site.example', '--disconnect'], { required: true, allowPositional: true }), 'https://my-site.example');
  assert.throws(() => liveTargetFromArgs(['https://my-site.example']));
  assert.throws(() => liveTargetFromArgs(['--url']));
  assert.throws(() => liveTargetFromArgs(['--url', '--extra']));
  assert.throws(() => liveTargetFromArgs(['--url=https://one.example', '--url', 'https://two.example']));
  assert.throws(() => liveTargetFromArgs(['--url', 'https://one.example', 'https://two.example'], { allowPositional: true }));
});

test('both CLI entrypoints reject missing or invalid targets before config/secret reads or network activity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nomads-live-target-'));
  const execute = promisify(execFile);
  const env = { ...process.env, DEEPSEEK_API_KEY: '', AGENT_BRIDGE_SECRET: '' };
  try {
    for (const [file, args] of [
      ['../evals/run-flash.mjs', ['--live']],
      ['../evals/run-flash.mjs', ['--url', 'http://remote.example']],
      ['../scripts/check-flash-live.mjs', []],
      ['../scripts/check-flash-live.mjs', ['https://site.example/a%2Fb']],
    ]) {
      await assert.rejects(execute(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...args], { cwd: directory, env, timeout: 10000 }), error => {
        const output = String(error.stderr);
        assert.match(output, /LIVE_TARGET_REQUIRED|INVALID_LIVE_TARGET/u);
        assert.ok(!/ENOENT|Model key unavailable/u.test(output));
        assert.ok(!output.includes('agent-secrets.json'));
        return true;
      });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
