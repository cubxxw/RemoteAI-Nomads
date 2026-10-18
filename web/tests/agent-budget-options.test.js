import test from 'node:test';import assert from 'node:assert/strict';
import {exploreBudgetOptions} from '../src/agent-budget-options.js';
const args={budget:2000,currency:'CNY',days:30,scenarios:[
 {label:'餐费20元/天假设',expenses:[{category:'food',label:'餐费',amount:20,period:'day'}]},
 {label:'餐费15元/天假设',expenses:[{category:'food',label:'餐费',amount:15,period:'day'}]},
]};
test('a 47/night cap is conditional: changing the food assumption admits 50/night arithmetically',()=>{
 const p=exploreBudgetOptions(args);
 assert.equal(p.options[0].accommodation_daily_cap,46.66);
 assert.equal(p.options[1].accommodation_daily_cap,51.66);
 assert.ok(30*(15+50)<=p.budget);assert.equal(p.market_feasibility,'unknown');
 assert.equal(p.market_coverage_complete,false);assert.ok(p.accommodation_search_forms.every(o=>o.availability==='not_verified'&&o.price==='not_provided'));
});
test('shared reserve, one-time fares, monthly amounts, and zero expenses stay explicit',()=>{
 const p=exploreBudgetOptions({...args,reserve:200,days:15,scenarios:[
  {label:'一次性机票',expenses:[{category:'transport',label:'机票',amount:800,period:'once'},{category:'food',label:'伙食',amount:600,period:'month'}]},
  {label:'免费吃饭的用户条件',expenses:[{category:'food',label:'伙食',amount:0,period:'day'}]},
 ]});
 assert.equal(p.options[0].non_housing_total,1100);assert.equal(p.options[0].accommodation_total_cap,700);
 assert.equal(p.options[1].accommodation_total_cap,1800);
});
test('overspending rules out only the supplied scenario, with no negative amount silently replaced by zero',()=>{
 const p=exploreBudgetOptions({...args,budget:1});
 assert.ok(p.options.every(o=>!o.arithmetic_balanced&&o.accommodation_total_cap<0));assert.equal(p.market_feasibility,'unknown');
});
test('options cannot duplicate housing inside non-housing costs or mutate the supplied assumptions',()=>{
 const before=structuredClone(args);exploreBudgetOptions(args);assert.deepEqual(args,before);
 assert.throws(()=>exploreBudgetOptions({...args,scenarios:[args.scenarios[0],args.scenarios[0]]}),/UNIQUE/);
 for(const label of ['住宿','房租','住房','租金','rent','bed'])assert.throws(()=>exploreBudgetOptions({...args,scenarios:[args.scenarios[0],{label:'重复住房',expenses:[{category:'incidentals',label,amount:20,period:'day'}]}]}),/HOUSING/);
 assert.throws(()=>exploreBudgetOptions({...args,scenarios:[args.scenarios[0],{label:'住房类别',expenses:[{category:'housing',label:'项目',amount:20,period:'day'}]}]}),/CATEGORY/);
 assert.throws(()=>exploreBudgetOptions({...args,days:0}),/DAYS/);
});
test('January is not a 30-day duration: compare explicit short and monthly stays without inventing a default',()=>{
 const p=exploreBudgetOptions({...args,days:undefined,scenarios:args.scenarios.map((s,i)=>({...s,days:i===0?7:30}))});
 assert.deepEqual(p.options.map(o=>o.days),[7,30]);assert.equal(p.days,null);
 assert.equal(p.options[0].non_housing_total,140);assert.equal(p.options[0].accommodation_total_cap,1860);
 assert.throws(()=>exploreBudgetOptions({...args,days:undefined}),/DURATION/);
});
