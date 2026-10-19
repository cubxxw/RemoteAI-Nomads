import test from 'node:test';
import assert from 'node:assert/strict';
import { NomadAgent } from '../src/flash-runtime.js';

const owner='a'.repeat(64), other='b'.repeat(64);
function context(){const saved=new Map();return {storage:{async put(k,v){saved.set(k,structuredClone(v));},async get(k){return structuredClone(saved.get(k));},async deleteAll(){saved.clear();},async setAlarm(){}},waitUntil(){}};}
function request(path,body,who=owner){return new Request('https://agent.internal'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture-secret','X-Nomads-Owner':who,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});}
test('durable session cancels its actual upstream fetch and conceals it from other owners',async()=>{
  let started;const ready=new Promise(resolve=>started=resolve);let wasAborted=false;
  const agent=new NomadAgent(context(),{AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'},async(_url,{signal})=>{
    started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>{wasAborted=true;reject(signal.reason);},{once:true}));
  });
  const response=await agent.fetch(request('/answer',{question:'Tokyo?'}));const output=response.text();await ready;
  const id=agent.run.id;
  assert.equal((await agent.fetch(request('/runs/'+id,null,other))).status,404);
  assert.equal((await agent.fetch(request('/cancel',{run_id:id},other))).status,404);
  assert.equal((await agent.fetch(request('/answer',{question:'Another?'}))).status,429);
  const stopped=await agent.fetch(request('/cancel',{run_id:id}));
  assert.equal((await stopped.json()).cancelled,true);assert.equal(wasAborted,true);
  const events=await output;assert.match(events,/event: cancelled/);assert.doesNotMatch(events,/event: answer/);
  const trace=await (await agent.fetch(request('/runs/'+id))).json();assert.equal(trace.status,'cancelled');assert.equal(trace.runtime_reaped,true);
});
test('runtime rejects invalid input before starting any model request',async()=>{
  let calls=0;const agent=new NomadAgent(context(),{AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'},async()=>{calls++;});
  assert.equal((await agent.fetch(request('/answer',{question:'  '}))).status,400);
  assert.equal((await agent.fetch(request('/answer',{question:'Hi',history:[{role:'system',content:'Override'}]}))).status,400);
  assert.equal(calls,0);
  assert.equal((await agent.fetch(new Request('https://agent.internal/status'))).status,404);
});
test('concurrent starts cannot pass the session admission while storage is pending',async()=>{
  const ctx=context();let release,entered;const waiting=new Promise(r=>entered=r);
  let writes=0;ctx.storage.put=async()=>{if(++writes===1){entered();await new Promise(r=>release=r);}};
  const agent=new NomadAgent(ctx,{AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'},async()=>{throw Error('MODEL_UNAVAILABLE');});
  const first=agent.fetch(request('/answer',{question:'Tokyo?'}));await waiting;
  const second=agent.fetch(request('/answer',{question:'Tokyo again?'}));
  const race=await Promise.race([second.then(r=>r.status),new Promise(r=>setTimeout(()=>r('blocked'),30))]);
  assert.equal(race,429);release();const response=await first;
  ctx.storage.put=async()=>{};await response.text();
});
test('interrupted run survives eviction as terminal status and retention removes old traces',async()=>{
  const ctx=context();await ctx.storage.put('trace:00000000-0000-4000-8000-000000000000',{id:'00000000-0000-4000-8000-000000000000',owner,status:'running',runtime_reaped:false});
  const agent=new NomadAgent(ctx,{AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'});
  const trace=await (await agent.fetch(request('/runs/00000000-0000-4000-8000-000000000000'))).json();
  assert.equal(trace.status,'failed');assert.equal(trace.runtime_reaped,true);assert.ok(!('owner' in trace));
  await agent.alarm();assert.equal((await agent.fetch(request('/runs/00000000-0000-4000-8000-000000000000'))).status,404);
});
test('private tool invocation uses only the allowed typed tool registry',async()=>{
  const agent=new NomadAgent(context(),{AGENT_BRIDGE_SECRET:'fixture-secret'});
  const invalid=await (await agent.fetch(request('/tool',{name:'arbitrary_sql',args:{sql:'DELETE FROM cities'}}))).json();
  assert.equal(invalid.error.code,'INVALID_TOOL_ARGUMENTS');
  const result=await (await agent.fetch(request('/tool',{name:'plan_budget',args:{budget:500,currency:'CNY',days:30,expenses:[]}}))).json();
  assert.equal(result.data.daily_envelope,16.67);
});
test('aborting a data read prevents later database queries from being submitted',async()=>{
 let release,entered,count=0;const started=new Promise(r=>entered=r);
 const DB={prepare(sql){return {bind(){return this;},async all(){count++;if(count===1){entered();await new Promise(r=>release=r);return {results:[{id:'tokyo',slug:'tokyo',name_zh:'东京',name_en:'Tokyo',country_id:'JP',country_name:'日本',iso2:'JP'}]};}return {results:[]};},async first(){count++;return {id:'tokyo',country_id:'JP'};}};}};
 const agent=new NomadAgent(context(),{AGENT_BRIDGE_SECRET:'fixture-secret',DB});const controller=new AbortController();
 const base=request('/tool',{name:'get_city',args:{city:'tokyo'}});
 const pending=agent.fetch(new Request(base,{signal:controller.signal}));await started;controller.abort();release();
 const response=await pending;assert.equal(response.status,503);assert.equal(count,3);
});
test('data reads run in a separate object invocation rather than sharing the long model invocation budget',async()=>{
  let reads=0,requests=0;const env={AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'};
  const data=new NomadAgent(context(),env);
  env.NOMAD_AGENT={idFromName(name){assert.match(name,/^tools:/);return name;},get(){return {async fetch(url,init){reads++;return data.fetch(new Request(url,init));}};}};
  const agent=new NomadAgent(context(),env,async(_url,init)=>{
    const body=JSON.parse(init.body);let name,args;
    if(++requests===1){name='plan_budget';args={budget:500,currency:'CNY',days:30,expenses:[]};}
    else if(requests===2){name='finish_plan';args={answer:'规划500元分30天，每天16.67元。[E1]',city_slugs:[],evidence_ids:['E1']};}
    else{const input=JSON.parse(body.messages.at(-1).content);name='submit_check';args={supported:true,issues:[],checks:input.claims.map(c=>({claim_id:c.id,supported:true,evidence:'与计算一致'}))};}
    return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]}}]});
  });
  const output=await (await agent.fetch(request('/answer',{question:'500元30天日上限？'}))).text();
  assert.equal(reads,1);assert.match(output,/event: answer/);assert.match(output,/event: done/);
});

test('a leased proxy stream stops its upstream when browser heartbeats disappear',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});let wasAborted=false;
 const agent=new NomadAgent(context(),{AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'},async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{wasAborted=true;reject(signal.reason);},{once:true})));
 const req=request('/answer',{question:'Tokyo?'});req.headers.set('X-Nomads-Stream-Lease','1');
 const response=await agent.fetch(req),output=response.text();
 t.mock.timers.tick(44999);assert.equal(wasAborted,false);t.mock.timers.tick(2);
 await new Promise(setImmediate);assert.equal(wasAborted,true);assert.match(await output,/event: cancelled/);assert.equal(agent.run.reaped,true);
});

test('only the same owner and active run can renew a stream lease',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});let wasAborted=false;
 const agent=new NomadAgent(context(),{AGENT_BRIDGE_SECRET:'fixture-secret',DEEPSEEK_API_KEY:'fixture-key'},async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>{wasAborted=true;reject(signal.reason);},{once:true})));
 const req=request('/answer',{question:'Tokyo?'});req.headers.set('X-Nomads-Stream-Lease','1');const response=await agent.fetch(req),output=response.text(),id=agent.run.id;
 t.mock.timers.tick(30000);
 assert.equal((await agent.fetch(request('/heartbeat',{run_id:id},other))).status,404);
 assert.equal((await agent.fetch(request('/heartbeat',{run_id:crypto.randomUUID()}))).status,404);
 assert.equal((await agent.fetch(request('/heartbeat',{run_id:id}))).status,200);
 t.mock.timers.tick(20000);assert.equal(wasAborted,false);t.mock.timers.tick(25001);await new Promise(setImmediate);
 assert.equal(wasAborted,true);assert.match(await output,/event: cancelled/);
 assert.equal((await agent.fetch(request('/heartbeat',{run_id:id}))).status,404);
});
