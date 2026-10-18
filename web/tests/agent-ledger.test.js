import test from 'node:test';import assert from 'node:assert/strict';
import {readWithEvidence} from '../agent/ledger.mjs';
test('parallel reads that complete in reverse order retain exact evidence ownership',async()=>{
 const run={calls:0,evidence:new Map(),cities:new Map(),sourceIds:new Set()},events=[];let finishA,finishB;
 const first=readWithEvidence(run,{name:'get_city',args:{city:'a'},label:'读取'},()=>new Promise(r=>finishA=r),(event,value)=>events.push({event,...value}));
 const second=readWithEvidence(run,{name:'get_city',args:{city:'b'},label:'读取'},()=>new Promise(r=>finishB=r),(event,value)=>events.push({event,...value}));
 finishB({data:{budget:222},cities:[{slug:'b',name:'B'}],sources:[{id:'source-b'}]});const b=await second;
 finishA({data:{budget:111},cities:[{slug:'a',name:'A'}],sources:[{id:'source-a'}]});const a=await first;
 assert.notEqual(a._evidence_id,b._evidence_id);assert.equal(run.evidence.size,2);
 for(const [answer,slug,amount] of [[a,'a',111],[b,'b',222]]){const entry=run.evidence.get(answer._evidence_id);assert.equal(entry.args.city,slug);assert.equal(entry.result.data.budget,amount);assert.equal(entry.result.cities[0].slug,slug);const pair=events.filter(e=>e.call_id===answer._evidence_id);assert.deepEqual(pair.map(e=>e.event),['tool_start','tool_end']);}
 assert.deepEqual([...run.sourceIds].sort(),['source-a','source-b']);
});
