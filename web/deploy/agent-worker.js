import { Container } from '@cloudflare/containers';

export class NomadAgent extends Container {
  defaultPort = 8789;
  sleepAfter = '3m';
  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      NODE_ENV: 'production', AGENT_HOST: '0.0.0.0', AGENT_PORT: '8789',
      LOCAL_D1: 'false', PREVIEW: 'false', AGENT_CHECKER: 'deepseek',
      WEB_ORIGIN: env.WEB_ORIGIN, DEEPSEEK_MODEL: env.DEEPSEEK_MODEL,
      DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY, AGENT_BRIDGE_SECRET: env.AGENT_BRIDGE_SECRET,
    };
  }
}

export default {
  async fetch(request, env) {
    if (!env.AGENT_BRIDGE_SECRET || request.headers.get('Authorization') !== 'Bearer ' + env.AGENT_BRIDGE_SECRET)
      return new Response('Not found', {status: 404});
    return env.NOMAD_AGENT.getByName('shared-v1').fetch(request);
  },
};
