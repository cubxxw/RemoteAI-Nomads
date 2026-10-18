import test from 'node:test';import assert from 'node:assert/strict';
import {acceptedAudit,auditSearchClaims} from '../agent/grounding.mjs';
test('a self-declared overall pass cannot hide a contradictory factual check',()=>{
 assert.equal(acceptedAudit({supported:true,checks:[{claim:'总额当非住房',supported:false}],issues:['总消费已经含住房，不能再加房租']}),false);
 assert.equal(acceptedAudit({supported:true,checks:[{supported:true}],issues:['仍有未解决的重要问题']}),false);
 assert.equal(acceptedAudit({supported:true,checks:[{supported:true}],issues:[]}),true);
});
test('global missing-count metadata is not mistaken for current query exclusions',()=>{
 const run={evidence:new Map([['E1',{tool:'search_cities',result:{data:{matched:10,excluded_missing_scores:124},cities:[]}}]])};
 assert.doesNotThrow(()=>auditSearchClaims({answer:'本次未排除缺分城市。',cities:[]},run));
 assert.throws(()=>auditSearchClaims({answer:'本次命中11座城市。',cities:[]},run),/INCORRECT_RESULT_COUNT/);
});
