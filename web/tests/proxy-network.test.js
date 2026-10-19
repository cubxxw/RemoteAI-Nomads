import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {agentRoute} from '../src/agent-gateway.js';

const secret='fixture-narrow-network-key';
function headers(ip,stamp=Date.now(),key=secret){
 return {'CF-Connecting-IP':'198.51.100.9','x-nomads-network-ip':ip,'x-nomads-network-time':String(stamp),'x-nomads-network-signature':createHmac('sha256',key).update(stamp+'\n'+ip).digest('hex')};
}
function environment(){return {PUBLIC_AGENT:'true',AGENT_BRIDGE_SECRET:'fixture-bridge',NOMADS_PROXY_SECRET:secret,NOMAD_AGENT:{idFromName(name){return name;},get(){return {async fetch(url,init){return Response.json({network:init.headers['X-Nomads-Network']});}};}}};}
const status=(values,env=environment())=>agentRoute(new Request('https://roamorrow.com/api/agent/status',{headers:values}),env);

test('authenticated clients behind one proxy retain distinct original network identities',async()=>{
 const a=await status(headers('203.0.113.1')),b=await status(headers('203.0.113.2'));
 assert.equal(a.status,200);assert.equal(b.status,200);
 assert.equal((await a.json()).network,'203.0.113.1');assert.equal((await b.json()).network,'203.0.113.2');
 assert.equal(a.headers.get('X-Nomads-Network-Verified'),'true');
});

test('forged, expired and partially supplied proxy identities fail before the agent sees them',async()=>{
 const valid=headers('203.0.113.1');
 for(const values of [{...valid,'x-nomads-network-ip':'203.0.113.2'},headers('203.0.113.1',Date.now()-120000),headers('203.0.113.1',Date.now(),'wrong-fixture-key'),{'x-nomads-network-ip':'203.0.113.1','CF-Connecting-IP':'198.51.100.9'}]){
  const response=await status(values);assert.equal(response.status,403);assert.equal((await response.json()).code,'INVALID_PROXY_NETWORK');
 }
});

test('unsigned forwarded headers on the public worker never replace Cloudflare client identity',async()=>{
 const response=await status({'CF-Connecting-IP':'203.0.113.8','X-Forwarded-For':'192.0.2.99','x-vercel-forwarded-for':'192.0.2.98'});
 assert.equal(response.status,200);assert.equal((await response.json()).network,'203.0.113.8');
});

test('same-origin heartbeat forwards its owner and lease protocol without consuming answer admission',async()=>{
 const env=environment();env.NOMAD_AGENT.get=()=>({async fetch(url,init){return Response.json({path:new URL(url).pathname,owner:init.headers['X-Nomads-Owner'],lease:init.headers['X-Nomads-Stream-Lease']});}});
 const values={...headers('203.0.113.1'),Origin:'https://roamorrow.com','Content-Type':'application/json','X-Nomads-Stream-Lease':'1'};
 const response=await agentRoute(new Request('https://roamorrow.com/api/agent/heartbeat',{method:'POST',headers:values,body:JSON.stringify({run_id:crypto.randomUUID()})}),env);
 assert.equal(response.status,200);const data=await response.json();assert.equal(data.path,'/heartbeat');assert.equal(data.lease,'1');assert.match(data.owner,/^[a-f0-9]{64}$/);
 assert.equal((await agentRoute(new Request('https://roamorrow.com/api/agent/heartbeat',{headers:values}),env)).status,405);
 assert.equal((await agentRoute(new Request('https://roamorrow.com/api/agent/heartbeat',{method:'POST',headers:{...values,Origin:'https://other.example'},body:'{}'}),env)).status,403);
});
