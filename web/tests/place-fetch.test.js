import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPlaceBatch} from '../scripts/place-fetch.mjs';
test('a malformed first response followed by a timeout never becomes a successful empty snapshot', async () => {
  let calls=0;
  await assert.rejects(fetchPlaceBatch(['a','b'],'query',{fetcher:async()=>{
    if(calls++===0)return {ok:true,json:async()=>({elements:'invalid'})};
    throw new Error('timeout');
  }}),/keep the previous snapshot/);
  assert.equal(calls,2);
});
test('a valid fallback can contain a verified empty array; rate limiting still backs off', async () => {
  let calls=0;const pauses=[];
  const result=await fetchPlaceBatch(['a','b'],'query',{pause:async ms=>pauses.push(ms),fetcher:async()=>calls++===0?{ok:false,status:429}:{ok:true,json:async()=>({elements:[]})}});
  assert.equal(result.endpoint,'b');assert.deepEqual(result.payload.elements,[]);assert.deepEqual(pauses,[30000]);
});
