import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {loadAgentConfig} from '../agent/config.mjs';

// Secret values travel through stdin only. This file contains no credentials.
const root = process.cwd();
const config = await loadAgentConfig(root);
if (!config.DEEPSEEK_API_KEY) throw Error('Set DEEPSEEK_API_KEY in the environment or private .dev.vars first');
const file = root + '/.data/deploy/agent-secrets.json';
await mkdir(root + '/.data/deploy', {recursive:true});
let secrets;
try { secrets = JSON.parse(await readFile(file, 'utf8')); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  secrets = {AGENT_BRIDGE_SECRET:randomBytes(32).toString('hex')};
}
secrets.DEEPSEEK_API_KEY = config.DEEPSEEK_API_KEY;
await writeFile(file, JSON.stringify(secrets), {mode:0o600});
const backend = process.argv.includes('--agent');
const payload = backend || process.argv.includes('--native') ? secrets : {AGENT_BRIDGE_SECRET:secrets.AGENT_BRIDGE_SECRET};
const args = ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', backend ? 'deploy/wrangler.agent.jsonc' : 'wrangler.production.jsonc'];
const child = spawn(process.execPath, args, {cwd:root, stdio:['pipe','inherit','inherit']});
child.stdin.end(JSON.stringify(payload));
child.on('error', () => { console.error('Unable to start the deployment client'); process.exitCode=1; });
child.on('exit', code => { process.exitCode=code ?? 1; });
