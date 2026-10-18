import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {reservePublicAnswer} from '../src/agent-admissions.js';
import {loadAgentConfig} from '../agent/config.mjs';
import {agentRoute} from '../src/agent-gateway.js';
import worker from '../src/worker.js';

function environment(limit=20){
  const db=new DatabaseSync(':memory:');
  db.exec('CREATE TABLE agent_admissions(id TEXT PRIMARY KEY,owner_hash TEXT,network_hash TEXT,created_at INTEGER)');
  const prepare=(sql,args=[])=>({bind(...values){return prepare(sql,values)},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}}}});
  return {env:{DB:{prepare},AGENT_BRIDGE_SECRET:'fixture-service-secret',AGENT_DAILY_LIMIT:String(limit)},db};
}
test('public admission persists per-owner, network and global rolling quotas without storing IPs',async()=>{
  const {env,db}=environment(); const now=1800000000000;
  for(let i=0;i<4;i++)assert.equal(await reservePublicAnswer(env,'owner-a','192.0.2.1',now),true);
  assert.equal(await reservePublicAnswer(env,'owner-a','192.0.2.1',now),false);
  for(let i=0;i<4;i++)assert.equal(await reservePublicAnswer(env,'owner-b','192.0.2.1',now),true);
  assert.equal(await reservePublicAnswer(env,'owner-c','192.0.2.1',now),false);
  for(let i=0;i<12;i++)assert.equal(await reservePublicAnswer(env,'other-'+i,'198.51.100.'+i,now),true);
  assert.equal(await reservePublicAnswer(env,'last','203.0.113.2',now),false);
  assert.equal(db.prepare('SELECT count(*) n FROM agent_admissions').get().n,20);
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM agent_admissions').all()).includes('192.0.2.1'));
  assert.equal(await reservePublicAnswer(env,'next-day','203.0.113.3',now+86400001),true);
  db.close();
});
test('D1 daily exhaustion has a clear reset time and never invokes the model service',async()=>{
  let calls=0;
  const env={PREVIEW:'false',PUBLIC_AGENT:'true',AGENT_BRIDGE_SECRET:'fixture-secret',DB:{prepare(){return {bind(){return this;},async run(){throw Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");}};}},AGENT_SERVICE:{async fetch(){calls++;return Response.json({});}}};
  const response=await agentRoute(new Request('https://nomads.example/api/agent/answer',{method:'POST',body:JSON.stringify({question:'清迈一月气温？'})}),env);
  assert.equal(response.status,503);assert.equal(calls,0);
  const result=await response.json();assert.equal(result.code,'D1_DAILY_READ_LIMIT');assert.match(result.error,/北京时间/);assert.match(result.error,/本机历史/);
  assert.ok(Number(response.headers.get('Retry-After'))>0);assert.ok(Number(response.headers.get('Retry-After'))<=86400);
});
test('deployment config reads environment secrets without requiring a local development file',async()=>{
  const config=await loadAgentConfig('/this-fixture-has-no-development-file',{DEEPSEEK_API_KEY:'fixture-key',AGENT_CHECKER:'deepseek',LOCAL_D1:'false'});
  assert.equal(config.DEEPSEEK_API_KEY,'fixture-key');
  assert.equal(config.LOCAL_D1,'false');
});
test('service-bound agent requests retain bridge authorization and browser session isolation',async()=>{
  let forwarded;
  const env={AGENT_BRIDGE_SECRET:'fixture-secret',AGENT_SERVICE:{async fetch(url,init){forwarded={url,init};return Response.json({ready:true});}}};
  const response=await agentRoute(new Request('https://nomads.example/api/agent/status'),env);
  assert.equal(response.status,200);
  assert.equal(forwarded.url,'https://agent.internal/status');
  assert.equal(forwarded.init.headers.Authorization,'Bearer fixture-secret');
  assert.match(forwarded.init.headers['X-Nomads-Owner'],/^[a-f0-9]{64}$/);
  assert.match(response.headers.get('Set-Cookie'),/HttpOnly; SameSite=Strict; Max-Age=86400; Secure/);
});
test('native Flash routes to a stable per-session object without an external server',async()=>{
  const names=[],requests=[];
  const env={AGENT_BRIDGE_SECRET:'fixture-secret',NOMAD_AGENT:{idFromName(name){names.push(name);return name;},get(){return {async fetch(url,init){requests.push({url,init});return Response.json({ready:true,model:'deepseek-flash'});}};}}};
  const response=await agentRoute(new Request('https://nomads.example/api/agent/status'),env);
  assert.equal((await response.json()).model,'deepseek-flash');
  const cookie=response.headers.get('Set-Cookie').split(';')[0];
  await agentRoute(new Request('https://nomads.example/api/agent/status',{headers:{Cookie:cookie}}),env);
  assert.equal(names[0],names[1]);assert.equal(requests[0].init.headers['X-Nomads-Owner'],names[0]);
  await agentRoute(new Request('https://nomads.example/api/agent/status'),env);assert.notEqual(names[2],names[0]);
  assert.equal((await agentRoute(new Request('https://nomads.example/api/agent/evals/00000000-0000-4000-8000-000000000000',{headers:{Cookie:cookie}}),env)).status,404);
});
test('private agent routes stay absent and cross-origin requests stay refused before backend setup',async()=>{
  assert.equal((await agentRoute(new Request('https://nomads.example/api/agent/evals/private'),{})).status,404);
  assert.equal((await agentRoute(new Request('https://nomads.example/api/agent/answer',{method:'POST',headers:{Origin:'https://other.example'},body:'{}'}),{})).status,403);
  assert.equal((await agentRoute(new Request('https://nomads.example/api/agent/status'),{})).status,503);
});
test('public HTTP requests redirect to the configured HTTPS host and preserve shared filters',async()=>{
  const response=await worker.fetch(new Request('http://nomads.example/cities/?month=1&budget=1000'),{PREVIEW:'false',SITE_ORIGIN:'https://nomads.example'},{});
  assert.equal(response.status,308);
  assert.equal(response.headers.get('Location'),'https://nomads.example/cities/?month=1&budget=1000');
});
test('production agent stays closed with a service binding until public admission is enabled',async()=>{
  let calls=0;
  const env={PREVIEW:'false',PUBLIC_AGENT:'false',AGENT_BRIDGE_SECRET:'fixture-secret',AGENT_SERVICE:{async fetch(){calls++;return Response.json({ready:true});}}};
  assert.equal((await agentRoute(new Request('https://nomads.example/api/agent/status'),env)).status,503);
  assert.equal(calls,0);
  assert.equal((await agentRoute(new Request('https://nomads.example/api/agent/status',{headers:{Authorization:'Bearer fixture-secret'}}),env)).status,200);
  assert.equal(calls,1);
});
test('Docker build context excludes local data, credentials and evaluations',async()=>{
  const dockerfile=await readFile(new URL('../deploy/Dockerfile',import.meta.url),'utf8');
  assert.ok(!dockerfile.includes('COPY . '));
  assert.ok(!dockerfile.includes('.dev.vars'));
  assert.match(dockerfile,/USER node/);
  const ignore=await readFile(new URL('../.dockerignore',import.meta.url),'utf8');
  assert.ok(ignore.startsWith('*\n'));
  assert.ok(!ignore.includes('!.data')&&!ignore.includes('!.dev.vars'));
});
