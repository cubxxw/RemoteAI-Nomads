import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAnswer} from '../agent/answer.mjs';
const c={slug:'kunming',name:'昆明',scores:{},budget_usd:860};
const setup=()=>({id:'test',calls:2,evidence:new Map([['E1',{tool:'search_cities',args:{country:'CN'},result:{data:{country:{name_zh:'中国'}},cities:[]}}],['E2',{tool:'get_city',args:{city:'kunming'},result:{data:{},cities:[c]}}]]),cities:new Map([['kunming',c]])});
test('a low budget receives the model planning answer, not a fixed empty-result report',()=>{
 const answer='2000元先按一人30天规划。可比较合住与缩短停留，昆明参考价不是最低生活费。[E2]';
 const parsed=parseAnswer(JSON.stringify({answer,city_slugs:['kunming'],evidence_ids:['E1','E2'],suggested_filters:{}}),setup());
 assert.equal(parsed.answer,answer);assert.equal(parsed.cities[0].slug,'kunming');
});
test('inline citations must belong to selected evidence, even when other evidence was read',()=>{
 const run=setup();assert.throws(()=>parseAnswer(JSON.stringify({answer:'参考[E2]',city_slugs:[],evidence_ids:['E1']}),run),/UNREAD_CITATION/);
});
test('an exact country or contextual month query never becomes a broader ranking URL',()=>{
 const run=setup();run.evidence.get('E1').result.data.filters={country:'CN',month:1,incomplete:true,recommended_only:false};
 const parsed=parseAnswer(JSON.stringify({answer:'中国1月方案[E1]',city_slugs:[],evidence_ids:['E1'],suggested_filters:{q:'中国',month:1}}),run);
 assert.equal(parsed.ranking_url,null);
});

test('checker proof retains the dated exchange rate already read by get_costs', async()=>{
 const {compactProof}=await import('../agent/grounding.mjs');
 const proof=compactProof({evidence:new Map([['E1',{tool:'get_costs',args:{city:'tokyo'},result:{data:{city:'tokyo',fx:{USD:{rate:6.6862,date:'2026-10-16',source_id:'ecb'}}},cities:[],warnings:[]}}]])});
 assert.equal(proof[0].data.fx.USD.date,'2026-10-16');
});
