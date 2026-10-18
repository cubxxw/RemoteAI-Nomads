import test from 'node:test';import assert from 'node:assert/strict';
import {parseAnswer} from '../agent/answer.mjs';
import {validateArgs,toolDefinitions} from '../src/agent-tools.js';
const run=()=>({id:'fixture',calls:1,evidence:new Map([['E1',{tool:'get_city',args:{city:'fixture-city'},result:{sources:[],warnings:[]}}]]),cities:new Map([['fixture-city',{slug:'fixture-city',budget_usd:123}]])});
const value={answer:'这是已读取的测试城市资料。',city_slugs:['fixture-city'],evidence_ids:['E1'],suggested_filters:{},followups:[]};
test('answer cannot cite evidence or cities not read in this run',()=>{assert.throws(()=>parseAnswer(JSON.stringify({...value,evidence_ids:['E9']}),run()),/UNREAD_EVIDENCE/);assert.throws(()=>parseAnswer(JSON.stringify({...value,city_slugs:['other']}),run()),/UNREAD_CITY/);});
test('parenthesized citations become clickable and cannot evade evidence ownership',()=>{
 const answer=parseAnswer(JSON.stringify({...value,answer:'已读资料（E1），范围清楚。'}),run());assert.equal(answer.answer,'已读资料[E1]，范围清楚。');
 assert.throws(()=>parseAnswer(JSON.stringify({...value,answer:'未读资料(E9)。'}),run()),/UNREAD_CITATION/);
});
test('strict filter validation rejects type coercion, invalid ranges and silent loss',()=>{for(const filters of [{month:99},{visa:'bad'},{warm:'false'},{budget:'1000'},{min_temp:20},{warm:true}])assert.throws(()=>parseAnswer(JSON.stringify({...value,suggested_filters:filters}),run()),/INVALID_FILTER/);});
test('city facts are assembled from the database snapshot rather than model values',()=>{const answer=parseAnswer(JSON.stringify({...value,cities:[{slug:'fixture-city',budget_usd:1}]}),run());assert.equal(answer.cities[0].budget_usd,123);});
test('no read does not get an evidence checked badge',()=>{const r={id:'fixture',calls:0,evidence:new Map(),cities:new Map()};const answer=parseAnswer(JSON.stringify({...value,city_slugs:[],evidence_ids:[]}),r);assert.equal(answer.evidence_checked,false);});
test('tool schemas reject arbitrary SQL, unknown keys, NaN, shell and malformed dates',()=>{const definition=toolDefinitions.find(d=>d.name==='search_cities');assert.equal(validateArgs({query:'x',sql:'DROP TABLE cities'},definition.parameters),false);assert.equal(validateArgs({max_budget:NaN},definition.parameters),false);assert.equal(validateArgs({recommended_only:false,max_temp:24,month:7},definition.parameters),true);assert.ok(!toolDefinitions.some(d=>/shell|sql|write|publish/i.test(d.name)));});

test('too many read cards is a specific display limit, not an unread-city error',()=>{const r=run();for(let i=0;i<6;i++)r.cities.set('c'+i,{slug:'c'+i});assert.throws(()=>parseAnswer(JSON.stringify({...value,city_slugs:Array.from({length:6},(_,i)=>'c'+i)}),r),/TOO_MANY_CITY_CARDS/);});
