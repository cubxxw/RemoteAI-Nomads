import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlashAgent, createFlashRun, publicFlashRun } from '../agent/flash-agent.mjs';

const reply=(name,args)=>Response.json({choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,reasoning_content:'private',tool_calls:[{id:crypto.randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]}}],usage:{prompt_tokens:50,completion_tokens:10,total_tokens:60}});
test('real calculator evidence reaches the answer only after a separate Flash audit',async()=>{
  const events=[],requests=[];const run=createFlashRun('owner');
  const answer=await runFlashAgent(run,{question:'500人民币住30天，日上限多少？'}, {DEEPSEEK_API_KEY:'fixture-key'},(name,data)=>events.push({name,data}),{fetcher:async(_url,init)=>{
    const body=JSON.parse(init.body);requests.push(body);
    if(requests.length===1)return reply('plan_budget',{budget:500,currency:'CNY',days:30,expenses:[]});
    if(requests.length===2)return reply('finish_plan',{answer:'500元分配30天，按假设每天可分配16.67元。[E1]',city_slugs:[],evidence_ids:['E1']});
    const checkInput=JSON.parse(body.messages.at(-1).content);
    return reply('submit_check',{supported:true,issues:[],checks:checkInput.claims.map(c=>({claim_id:c.id,supported:true,evidence:'plan_budget中daily_envelope为16.67，属于规划假设。'}))});
  }});
  assert.equal(requests.length,3);assert.equal(run.calls,1);assert.equal(answer.grounding_check.supported,true);
  assert.equal(answer.evidence[0].id,'E1');assert.equal(answer.budget_snapshot.originalBudget,500);
  assert.equal(publicFlashRun(run).model,'deepseek-flash');assert.ok(!JSON.stringify(publicFlashRun(run)).includes('private'));
  assert.ok(events.some(e=>e.name==='tool_end'));
});
test('unsupported drafts are revised and never emitted as a completed answer',async()=>{
  const run=createFlashRun('owner');let calls=0;
  await assert.rejects(()=>runFlashAgent(run,{question:'预算?'},{DEEPSEEK_API_KEY:'fixture-key'},()=>{},{fetcher:async(_url,init)=>{
    const body=JSON.parse(init.body);calls++;
    if(body.tools[0].function.name==='submit_check') {
      const data=JSON.parse(body.messages.at(-1).content);
      return reply('submit_check',{supported:false,issues:['无依据的行情保证'],checks:data.claims.map(c=>({claim_id:c.id,supported:false,evidence:'无此报价'}))});
    }
    return reply('finish_plan',{answer:'500元肯定能租到整套房。',city_slugs:[],evidence_ids:[]});
  }}),/UNSUPPORTED_ANSWER/);
  assert.equal(calls,6);assert.equal(run.verified,false);
});
test('cached context does not exhaust the fresh-generation token safeguard',async()=>{
 const run=createFlashRun('owner');let calls=0;
 const answer=await runFlashAgent(run,{question:'500元30天日上限？'},{DEEPSEEK_API_KEY:'fixture'},()=>{},{fetcher:async(_url,init)=>{
  const body=JSON.parse(init.body);calls++;let response;
  if(calls===1)response=reply('plan_budget',{budget:500,currency:'CNY',days:30,expenses:[]});
  else if(calls===2)response=reply('finish_plan',{answer:'规划上限每天16.67元。[E1]',city_slugs:[],evidence_ids:['E1']});
  else{const input=JSON.parse(body.messages.at(-1).content);response=reply('submit_check',{supported:true,issues:[],checks:input.claims.map(c=>({claim_id:c.id,supported:true,evidence:'与预算计算一致'}))});}
  const payload=await response.json();payload.usage={prompt_tokens:280000,prompt_cache_hit_tokens:270000,prompt_cache_miss_tokens:10000,completion_tokens:100,total_tokens:280100};return Response.json(payload);
 }});
 assert.ok(answer.answer.includes('16.67'));assert.equal(calls,3);
});
test('a citation-format correction does not spend one of the three fact-review attempts',async()=>{
 const run=createFlashRun('owner');let requests=0,audits=0;
 const answer=await runFlashAgent(run,{question:'500人民币30天每天可分多少？'},{DEEPSEEK_API_KEY:'fixture'},()=>{},{fetcher:async(_url,init)=>{
  requests++;const body=JSON.parse(init.body);
  if(requests===1)return reply('finish_plan',{answer:'每天16.67元。[E9]',city_slugs:[],evidence_ids:['E9']});
  if(requests===2)return reply('plan_budget',{budget:500,currency:'CNY',days:30,expenses:[]});
  if(body.tools[0].function.name==='submit_check'){
   const input=JSON.parse(body.messages.at(-1).content),supported=++audits===3;
   return reply('submit_check',{supported,issues:supported?[]:['请明确金额是规划上限'],checks:input.claims.map(c=>({claim_id:c.id,supported,evidence:'真实计算值16.67；核对草稿表述'}))});
  }
  return reply('finish_plan',{answer:'规划上限每天16.67元。[E1]',city_slugs:[],evidence_ids:['E1']});
 }});
 assert.equal(audits,3);assert.equal(run.contract_errors.length,1);assert.ok(answer.answer.includes('16.67'));
});
test('a factual revision starts from evidence without retaining the prior hidden reasoning',async()=>{
 const run=createFlashRun('owner');let stage=0;let revision;
 await runFlashAgent(run,{question:'500元30天日上限？'},{DEEPSEEK_API_KEY:'fixture'},()=>{},{fetcher:async(_url,init)=>{
  const body=JSON.parse(init.body);stage++;
  if(stage===1)return reply('plan_budget',{budget:500,currency:'CNY',days:30,expenses:[]});
  if(stage===2)return reply('finish_plan',{answer:'每天16.67元。[E1]',city_slugs:[],evidence_ids:['E1']});
  if(body.tools[0].function.name==='submit_check'){
   const input=JSON.parse(body.messages.at(-1).content),supported=stage>3;
   return reply('submit_check',{supported,issues:supported?[]:['明确为规划上限'],checks:input.claims.map(c=>({claim_id:c.id,supported,evidence:'500/30=16.67'}))});
  }
  revision=body;
  return reply('finish_plan',{answer:'规划上限每天16.67元。[E1]',city_slugs:[],evidence_ids:['E1']});
 }});
 assert.equal(revision.messages.length,2);
 assert.ok(!JSON.stringify(revision.messages).includes('reasoning_content'));
 assert.equal(JSON.parse(revision.messages[1].content).evidence[0].tool,'plan_budget');
});
