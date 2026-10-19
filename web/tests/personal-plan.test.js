import test from 'node:test';
import assert from 'node:assert/strict';
import {personalPlanSummary,personalPlanDifference} from '../public/modules/trip-state.js';

const plan=(days=30,month=11)=>({version:1,currency:'CNY',month,days,values:{rent:{amount:3000,origin:'edited'},food:{amount:100,origin:'edited'},transport:{amount:400,origin:'reference'},mobile:{amount:100,origin:'edited'},other:{amount:500,origin:'edited'}}});
test('saved personal figures have their own trip subtotal, provenance and optional ceiling',()=>{
 const summary=personalPlanSummary({...plan(),ceiling:{amount:8000}});
 assert.equal(summary.amount,7000);assert.equal(summary.edited,4);assert.equal(summary.references,1);assert.equal(summary.remaining,1000);
 assert.deepEqual(summary.missing,[]);assert.equal(summary.items.find(row=>row.key==='food').total,3000);
});
test('zero remains included while an unfilled personal field stays visibly missing',()=>{
 const record=plan();record.values.mobile={amount:0,origin:'edited'};record.values.other={amount:null,origin:'missing',cleared:true};
 const summary=personalPlanSummary(record);assert.equal(summary.amount,6400);assert.deepEqual(summary.missing,['其他日常开销']);
 assert.equal(summary.items.find(row=>row.key==='mobile').total,0);
 assert.equal(personalPlanDifference(summary,personalPlanSummary(plan()),11).reason,'missing');
});
test('personal differences require the same duration, month, selected comparison month and no missing daily costs',()=>{
 const a=personalPlanSummary(plan()),record=plan();record.values.rent.amount=3200;const b=personalPlanSummary(record);
 assert.equal(personalPlanDifference(a,b,11).difference,-200);
 assert.equal(personalPlanDifference(a,personalPlanSummary(plan(21)),11).reason,'duration');
 assert.equal(personalPlanDifference(a,personalPlanSummary(plan(30,12)),11).reason,'month');
 assert.equal(personalPlanDifference(a,b,12).reason,'month');
 assert.equal(personalPlanDifference(a,null,11).reason,'unavailable');
});
test('invalid or missing local records cannot become a fabricated personal estimate',()=>{
 assert.equal(personalPlanSummary(null),null);assert.equal(personalPlanSummary({...plan(),days:0}),null);
 assert.equal(personalPlanSummary(plan()).ceiling,null);
 assert.equal(personalPlanSummary(plan()).remaining,null);
});
test('a saved cap-only plan asks for missing costs rather than claiming the record was never saved',()=>{
 const record={...plan(),ceiling:{amount:8000}};
 for(const key of Object.keys(record.values))record.values[key]={amount:null,origin:'missing',cleared:true};
 const summary=personalPlanSummary(record);assert.equal(summary.amount,null);assert.equal(summary.missing.length,5);
 assert.equal(personalPlanDifference(summary,personalPlanSummary(plan()),11).reason,'missing');
});
