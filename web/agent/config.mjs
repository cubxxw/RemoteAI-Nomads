import { readFile } from 'node:fs/promises';

export async function loadAgentConfig(root, env = process.env) {
  let local = {};
  try {
    local = Object.fromEntries((await readFile(root + '/.dev.vars', 'utf8')).split('\n')
      .filter(line => /^[A-Z][A-Z0-9_]*=/.test(line)).map(line => {
        const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1).trim()];
      }));
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const keys = ['DEEPSEEK_API_KEY', 'DEEPSEEK_MODEL', 'AGENT_BRIDGE_SECRET', 'WEB_ORIGIN', 'LOCAL_D1', 'AGENT_CHECKER', 'PREVIEW'];
  return { ...local, ...Object.fromEntries(keys.filter(key => env[key] !== undefined).map(key => [key, env[key]])) };
}
