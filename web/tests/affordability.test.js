import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditAffordability} from '../agent/affordability.mjs';
test('own expense assumptions never prove a full-city price floor',()=>{
 for(const answer of ['整月不现实：按极简伙食35元/天，住宿只剩700元。','只适合借宿或换宿。','深圳1BR挂牌4960元，说明2000元整月租独立房不可行。'])assert.throws(()=>auditAffordability(answer),/UNPROVEN_CITY_PRICE_FLOOR/);
});
test('a scoped infeasible plan is different from an impossible destination',()=>{
 for(const answer of ['按这组开支假设，住宿剩700元；不能据此证明整月不现实。','这套方案下整月不现实，换一种吃住假设后需要重算。','这条报价说明2000元整月租这个房源不可行。','30天住宿可付上限23元/晚；当地能否找到房源尚未核实。'])assert.doesNotThrow(()=>auditAffordability(answer));
});
