import test from 'node:test';
import assert from 'node:assert/strict';
import {travelerDefaults,estimateTravelerBudget} from '../public/modules/traveler-budget.js';

const price=(field,amount,extra={})=>({field,scope:'city',provider:'costcompass',category:field.startsWith('housing')?'housing':'sample',period:field.startsWith('housing')?'month':'item',currency:'CNY',amount,displayAmount:amount,quality:'sample',quality_flags:field.startsWith('housing')?['asking_rent']:[],observed_at:'2026-10-13',source_url:'https://example.com/prices',...extra});
test('single traveler defaults use eligible one-bedroom rent and explicit everyday quantities',()=>{
 const input=[price('housing_1br_center',4000),price('housing_1br_outside',3000),price('housing_3br_outside',1500),price('restaurant_inexpensive',10,{period:'meal'}),price('transport_oneway_ticket',4,{period:'trip'}),price('utilities_mobile_10gb',100,{period:'month'})];
 const before=structuredClone(input),d=travelerDefaults(input);
 assert.equal(d.rent.amount,3000);assert.equal(d.food.amount,30);assert.equal(d.transport.amount,240);assert.equal(d.mobile.amount,100);assert.equal(d.other.amount,null);
 assert.match(d.food.basis,/3/);assert.match(d.transport.basis,/2/);assert.equal(d.rent.source.date,'2026-10-13');
 assert.deepEqual(input,before);
 const sum=estimateTravelerBudget(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.amount])),30);
 assert.equal(sum.amount,4240);assert.deepEqual(sum.missing,['其他日常开销']);
});
test('national, regional, reviewed, multi-person, missing FX and wrong-unit prices never prefill a single traveler plan',()=>{
 const invalid=[price('housing_1br_center',100,{scope:'national'}),price('housing_1br_outside',100,{scope:'regional'}),price('housing_1br_center',100,{quality:'review'}),price('housing_1br_center',100,{quality_flags:['asking_rent','rent_outlier_requires_review']}),price('housing_3br_center',100),price('housing_1br_outside',100,{displayAmount:null,currency:'USD'}),price('housing_1br_center',100,{period:'day'}),price('restaurant_midrange_2p',100,{period:'meal'}),price('utilities_basic_85m2',100,{period:'month'})];
 assert.ok(Object.values(travelerDefaults(invalid)).every(row=>row.amount===null));
});
test('partial city evidence produces a named subtotal without invented meals, transport or communication',()=>{
 const d=travelerDefaults([price('housing_1br_center',2987.47)]);
 const e=estimateTravelerBudget(Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.amount])),30);
 assert.equal(e.amount,2987.47);assert.deepEqual(e.missing,['餐费','当地交通','手机套餐','其他日常开销']);
 assert.equal(estimateTravelerBudget({},30).amount,null);
 assert.equal(estimateTravelerBudget({rent:0,food:0,transport:0,mobile:0,other:0},30).amount,0);
 for(const days of [0,1.5,366,''])assert.equal(estimateTravelerBudget({rent:3000},days).error,true);
 assert.equal(estimateTravelerBudget({rent:-1},30).error,true);
});
test('month passes take precedence over a per-trip assumption and non-monthly phone quotes stay unknown',()=>{
 const d=travelerDefaults([price('transport_monthly_pass',150,{period:'month'}),price('transport_oneway_ticket',4,{period:'trip'}),price('utilities_mobile_10gb',30,{period:'day'})]);
 assert.equal(d.transport.amount,150);assert.match(d.transport.basis,/月票/);assert.equal(d.mobile.amount,null);
 assert.equal(estimateTravelerBudget({rent:3000,food:30,transport:150,mobile:100,other:null},15).amount,2075);
});
test('an incomplete native numeric input is invalid rather than a missing expense',()=>{
 const e=estimateTravelerBudget({rent:null,food:100},30,['rent']);
 assert.equal(e.error,true);assert.equal(e.amount,null);
});
