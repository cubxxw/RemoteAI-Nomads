import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBudget } from '../src/agent-budget.js';
test('2000 CNY is a planning envelope, not an empty USD reference-price filter', () => {
  const plan = calculateBudget({budget:2000,currency:'CNY',days:30,reserve:200,expenses:[{label:'合住预算上限',amount:800,period:'month'},{label:'自炊与餐食预算',amount:25,period:'day'},{label:'本地交通',amount:100,period:'once'}]});
  assert.equal(plan.spending,1650);assert.equal(plan.remaining,150);assert.equal(plan.arithmetic_balanced,true);assert.equal(plan.currency,'CNY');assert.equal(plan.daily_envelope,60);
  assert.ok(plan.expenses.every(x=>x.basis==='planning_assumption'));
});
test('shortening a trip prorates monthly assumptions and retains one-off costs', () => {
  const plan=calculateBudget({budget:2000,currency:'CNY',days:10,reserve:200,expenses:[{label:'住宿假设',amount:1800,period:'month'},{label:'交通',amount:100,period:'once'}]});
  assert.equal(plan.spending,700);assert.equal(plan.remaining,1100);
});
test('an infeasible plan shows the actual gap without changing the budget',()=>{
  const plan=calculateBudget({budget:1,currency:'USD',days:30,reserve:0,expenses:[{label:'餐食假设',amount:3,period:'day'}]});
  assert.equal(plan.remaining,-89);assert.equal(plan.arithmetic_balanced,false);assert.equal(plan.budget,1);
});

test('derive a lodging target from the user envelope without asserting a market floor',()=>{
 const p=calculateBudget({budget:2000,currency:'CNY',days:30,reserve:200,solve_for:'住宿',expenses:[{label:'吃饭假设',amount:25,period:'day'},{label:'交通假设',amount:3,period:'day'}]});
 assert.equal(p.spending_cap.daily,32);assert.equal(p.spending_cap.total,960);assert.equal(p.market_feasibility,'unknown');assert.equal(p.within_budget,undefined);
});
