import test from'node:test';import assert from'node:assert/strict';import{selectBudgetSnapshot,budgetChoices}from'../agent/budget-choice.mjs';
const plan=(purpose)=>({tool:'plan_budget',purpose,result:{data:{snapshot:{version:1,originalDays:30}}}});
test('multiple budget hypotheses never silently select the last alternative',()=>{
 const e=new Map([['E1',plan()],['E2',plan()]]);assert.equal(selectBudgetSnapshot(e,['E1','E2']),null);
 assert.deepEqual(selectBudgetSnapshot(e,['E1']),{version:1,originalDays:30});
});
test('a user can select the exact raw units from a short/monthly scenario without selecting one by default',()=>{
 const args={budget:2000,currency:'CNY',scenarios:[{label:'月住假设',days:30,expenses:[{category:'food',label:'餐食',amount:35,period:'day'}]},{label:'短住假设',days:7,expenses:[]}]};
 const e=new Map([['E1',{tool:'explore_budget_options',args,result:{data:{currency:'CNY',options:[{label:'月住假设',days:30,non_housing_total:1050,accommodation_total_cap:950},{label:'短住假设',days:7,non_housing_total:0,accommodation_total_cap:2000}]}}}]]);
 const choices=budgetChoices(e,['E1']);assert.equal(choices.length,2);assert.equal(choices[0].snapshot.expenses[0].amount,35);assert.equal(choices[0].snapshot.expenses[0].period,'day');assert.equal(choices[0].snapshot.spending_cap.originalTotal,950);
 assert.equal(choices[1].snapshot.originalDays,7);assert.equal(selectBudgetSnapshot(e,['E1']),null);assert.deepEqual(budgetChoices(e,[]),[]);
});
test('editor calculation proofs do not become a user-confirmed budget plan',()=>{
 const e=new Map([['E1',plan('alternative_calculation')]]);assert.equal(selectBudgetSnapshot(e,['E1']),null);
});
