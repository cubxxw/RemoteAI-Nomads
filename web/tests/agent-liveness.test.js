import test from 'node:test';
import assert from 'node:assert/strict';
import {runLiveness} from '../public/modules/agent-liveness.js';

test('browser lease renewal and navigation cancellation retain the mounted session path',async()=>{
 const previous=globalThis.document;globalThis.document={documentElement:{dataset:{nomadsBase:'/nomads'}}};
 try{
  const calls=[];let tick,cleared=false;
  const run={id:crypto.randomUUID(),controller:new AbortController()};
  const live=runLiveness(run,{fetcher:async(url,init)=>{calls.push({url,...init});return new Response();},every(fn,ms){assert.equal(ms,10000);tick=fn;return 7;},clear(id){assert.equal(id,7);cleared=true;}});
  live.start(45000);tick();await Promise.resolve();assert.equal(calls[0].url,'/nomads/api/agent/heartbeat');assert.equal(JSON.parse(calls[0].body).run_id,run.id);
  live.abandon();await Promise.resolve();assert.equal(cleared,true);assert.equal(run.controller.signal.aborted,true);assert.equal(calls[1].url,'/nomads/api/agent/cancel');assert.equal(calls[1].keepalive,true);
 }finally{previous===undefined?delete globalThis.document:globalThis.document=previous;}
});

test('clients without an accepted leased run do not emit heartbeat requests',()=>{
 let timers=0;const run={id:null,controller:new AbortController()};const live=runLiveness(run,{every(){timers++;}});live.start(45000);run.id=crypto.randomUUID();live.start(undefined);assert.equal(timers,0);
});
