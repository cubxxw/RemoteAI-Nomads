import test from 'node:test';
import assert from 'node:assert/strict';
import { FlashSession } from '../agent/flash-client.mjs';

const definition = {name:'get_city',description:'Read a city',parameters:{type:'object',properties:{city:{type:'string'}},required:['city'],additionalProperties:false}};
const terminal = {name:'finish_plan',description:'Submit answer',parameters:{type:'object',properties:{answer:{type:'string'}},required:['answer'],additionalProperties:false}};
const call = (name,args,id='c1') => ({id,type:'function',function:{name,arguments:JSON.stringify(args)}});
const reply = (tool_calls,reasoning_content='private reasoning',content=null) => Response.json({choices:[{finish_reason:tool_calls?'tool_calls':'stop',message:{role:'assistant',content,reasoning_content,...(tool_calls?{tool_calls}:{})}}],usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120}});

test('Flash loop preserves private reasoning across tool turns and uses only Flash',async()=>{
  const requests=[],reads=[],usage=[];
  const session=new FlashSession({apiKey:'fixture-key',prompt:'Travel secretary',definitions:[definition,terminal],terminal:'finish_plan',signal:new AbortController().signal,
    onRequest(){},onUsage:v=>usage.push(v),execute:async(name,args)=>{reads.push({name,args});return name==='finish_plan'?{received:true}:{city:'Tokyo'};},
    fetcher:async(url,init)=>{assert.equal(url,'https://api.deepseek.com/chat/completions');requests.push(JSON.parse(init.body));return requests.length===1?reply([call('get_city',{city:'tokyo'})]):reply([call('finish_plan',{answer:'Tokyo [E1]'})]);}});
  await session.run('Tokyo?');
  assert.equal(requests.length,2);assert.ok(requests.every(r=>r.model==='deepseek-flash'&&r.thinking.type==='enabled'&&r.reasoning_effort==='low'));
  assert.equal(requests[1].messages[2].reasoning_content,'private reasoning');
  assert.equal(requests[1].messages[3].role,'tool');assert.equal(reads.length,2);assert.equal(usage.length,2);
  await session.run('Correct the answer');
  assert.equal(requests.at(-1).messages.filter(m=>m.role==='assistant').length,2);
});
test('invalid and unauthorized tool calls are returned to the model without execution',async()=>{
  let requests=0;const reads=[];
  const session=new FlashSession({apiKey:'fixture-key',prompt:'Travel',definitions:[definition,terminal],terminal:'finish_plan',signal:new AbortController().signal,onRequest(){},onUsage(){},execute:async(name)=>{reads.push(name);return {received:true};},fetcher:async()=>++requests===1?reply([call('shell',{}),{...call('get_city',{}),function:{name:'get_city',arguments:'broken'}}]):reply([call('finish_plan',{answer:'No access'})])});
  await session.run('Run shell');assert.deepEqual(reads,['finish_plan']);
});
test('provider errors never echo response bodies or API keys',async()=>{
  const session=new FlashSession({apiKey:'fixture-key',prompt:'Travel',definitions:[],signal:new AbortController().signal,onRequest(){},onUsage(){},execute(){},fetcher:async()=>new Response('fixture-key secret body',{status:401})});
  await assert.rejects(()=>session.run('Hello'),{message:'MODEL_AUTH_FAILED'});
});
test('abort stops the active upstream request and prevents later tools',async()=>{
  const controller=new AbortController();let requested;
  const pending=new Promise(resolve=>{requested=resolve;});let reads=0;
  const session=new FlashSession({apiKey:'fixture-key',prompt:'Travel',definitions:[definition],signal:controller.signal,onRequest(){},onUsage(){},execute(){reads++;},fetcher:async(_url,{signal})=>{requested();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  const run=session.run('Tokyo');await pending;controller.abort(new Error('CANCELLED'));await assert.rejects(run,/CANCELLED/);assert.equal(reads,0);
});
