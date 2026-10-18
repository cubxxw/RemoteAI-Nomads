import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consumeEvents} from '../evals/live-result.mjs';
import {parseAgentEvent} from '../public/modules/agent-sse.js';
test('model Unicode paragraph separators survive the browser SSE parser',()=>{
  const data={answer:'第一段\u2028第二段\u2029第三段'};
  assert.deepEqual(parseAgentEvent('event: answer\ndata: '+JSON.stringify(data)),{type:'answer',data});
  assert.equal(parseAgentEvent(': keepalive'),null);
});
test('live eval retains the run id when a later stream read fails',async()=>{
  let pull=0;const encoder=new TextEncoder();
  const response=new Response(new ReadableStream({pull(c){if(!pull++){c.enqueue(encoder.encode('event: start\ndata: {"run_id":"test-run"}\n\n'));}else c.error(new Error('connection lost'));}}));
  const events=[];
  await assert.rejects(consumeEvents(response,(...e)=>events.push(e)),/connection lost/);
  assert.deepEqual(events,[['start',{run_id:'test-run'}]]);
});
