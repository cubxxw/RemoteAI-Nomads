import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotBudget, recalculateBudget } from '../src/agent-plan-state.js';

const base = () => ({ budget: 2000, currency: 'CNY', days: 30, solve_for: '住宿', expenses: [
  { label: '食物', amount: 600, period: 'month' },
  { label: '交通', amount: 200, period: 'month' },
  { label: '杂费', amount: 100, period: 'month' },
] });
const freeze = object => { Object.freeze(object); for (const v of Object.values(object)) if (v && typeof v === 'object') freeze(v); return object; };

test('snapshot stores original units and the original planning cap, without rewriting monthly inputs as rounded daily prices', () => {
  const args = base(), snapshot = snapshotBudget(args);
  assert.equal(snapshot.originalBudget, 2000); assert.equal(snapshot.originalDays, 30);
  assert.equal(snapshot.currency, 'CNY'); assert.equal(snapshot.reserve, 0);
  assert.deepEqual(snapshot.expenses, args.expenses);
  assert.equal(snapshot.spending_cap.originalTotal, 1100);
  assert.equal(snapshot.spending_cap.originalDays, 30);
  assert.equal(snapshot.spending_cap.basis, 'original_planning_cap');
  assert.equal(snapshot.spending_cap.market_feasibility, 'unknown');
  args.expenses[1].amount = 1;
  assert.equal(snapshot.expenses[1].amount, 200);
});

test('15 days preserves the old 550 lodging allocation and exposes 1550 only as a separate reallocation option', () => {
  const snapshot = freeze(snapshotBudget(base())), before = JSON.stringify(snapshot);
  const result = recalculateBudget(snapshot, { days: 15 });
  assert.deepEqual(result.expenses.map(e => [e.amount, e.period, e.total]), [[600, 'month', 300], [200, 'month', 100], [100, 'month', 50]]);
  assert.equal(result.listed_spending, 450);
  assert.equal(result.preserved_spending_cap.total, 550);
  assert.equal(result.reallocated_spending_cap.total, 1550);
  assert.equal(result.spending_cap.total, 550);
  assert.equal(result.spending, 1000); assert.equal(result.remaining, 1000);
  assert.equal(result.market_feasibility, 'unknown'); assert.equal(result.within_budget, undefined);
  assert.equal(JSON.stringify(snapshot), before);
});

test('reserve and one-off expenses remain fixed when shortening the trip', () => {
  const snapshot = snapshotBudget({ ...base(), reserve: 200, expenses: [...base().expenses, { label: '一次性车票', amount: 100, period: 'once' }] });
  const result = recalculateBudget(snapshot, { days: 15 });
  assert.equal(snapshot.spending_cap.originalTotal, 800);
  assert.equal(result.reserve, 200);
  assert.equal(result.expenses.at(-1).total, 100);
  assert.equal(result.preserved_spending_cap.total, 400);
  assert.equal(result.listed_spending, 550); assert.equal(result.spending, 950);
  assert.equal(result.total_allocated, 1150); assert.equal(result.remaining, 850);
});

test('daily and monthly prices are retained while one-off costs and reserve stay fixed', () => {
  const snapshot = snapshotBudget({ budget: 3000, currency: 'USD', days: 30, reserve: 150, expenses: [
    { label: '餐食', amount: 7.25, period: 'day' }, { label: '交通', amount: 200, period: 'month' }, { label: '签证', amount: 100, period: 'once' },
  ] });
  const result = recalculateBudget(snapshot, { days: 10 });
  assert.deepEqual(result.expenses.map(e => e.total), [72.5, 66.67, 100]);
  assert.equal(result.reserve, 150); assert.equal(result.spending_cap, null);
  assert.equal(result.spending, 239.17); assert.equal(result.remaining, 2610.83);
});

test('repeated recalculation retains unrounded anchors instead of compounding a rounded daily amount', () => {
  const snapshot = snapshotBudget({ budget: 1, currency: 'CNY', days: 3, solve_for: '住宿', expenses: [] });
  const first = recalculateBudget(snapshot, { days: 1 });
  const next = recalculateBudget(JSON.parse(JSON.stringify(first.snapshot)), { days: 2 });
  assert.equal(first.spending_cap.total, 0.33);
  assert.equal(next.spending_cap.total, 0.67);
  assert.equal(next.snapshot.spending_cap.originalTotal, 1);
  assert.equal(next.snapshot.spending_cap.originalDays, 3);
  const transport = snapshotBudget({ budget: 1000, currency: 'CNY', days: 30, expenses: [{ label: '交通', amount: 200, period: 'month' }] });
  const day = recalculateBudget(transport, { days: 1 });
  const twenty = recalculateBudget(day.snapshot, { days: 20 });
  assert.equal(day.expenses[0].total, 6.67); assert.equal(twenty.expenses[0].total, 133.33);
  assert.equal(twenty.snapshot.expenses[0].amount, 200); assert.equal(twenty.snapshot.expenses[0].period, 'month');
});

test('only explicit reallocation applies the new cap and establishes a new active anchor for the next change', () => {
  const original = snapshotBudget(base());
  const result = recalculateBudget(original, { days: 15, mode: 'reallocate_remaining' });
  assert.equal(result.preserved_spending_cap.total, 550);
  assert.equal(result.spending_cap.total, 1550); assert.equal(result.remaining, 0);
  assert.equal(result.snapshot.spending_cap.originalTotal, 1100);
  assert.equal(result.snapshot.active_spending_cap.originalTotal, 1550);
  assert.equal(result.snapshot.active_spending_cap.originalDays, 15);
  const next = recalculateBudget(result.snapshot, { days: 30 });
  assert.equal(next.spending_cap.total, 3100);
  assert.equal(next.remaining, -2000); assert.equal(next.arithmetic_balanced, false);
  assert.equal(original.active_spending_cap.originalTotal, 1100);
});

test('a new budget does not silently raise the old allocation, and persists for subsequent recalculations', () => {
  const result = recalculateBudget(snapshotBudget(base()), { days: 15, budget: 2500 });
  assert.equal(result.spending_cap.total, 550); assert.equal(result.remaining, 1500);
  assert.equal(result.reallocated_spending_cap.total, 2050);
  assert.equal(result.snapshot.originalBudget, 2000); assert.equal(result.snapshot.currentBudget, 2500);
  const next = recalculateBudget(result.snapshot, { days: 30 });
  assert.equal(next.budget, 2500); assert.equal(next.remaining, 500);
});

test('a longer trip can exceed the unchanged budget without making a claim about market feasibility', () => {
  const result = recalculateBudget(snapshotBudget(base()), { days: 60 });
  assert.equal(result.spending, 4000); assert.equal(result.remaining, -2000);
  assert.equal(result.arithmetic_balanced, false); assert.equal(result.market_feasibility, 'unknown');
  assert.equal(result.reallocated_spending_cap.total, 200);
});

test('overcommitted inputs preserve the shortfall and never turn a negative balance into a negative expense', () => {
  const snapshot = snapshotBudget({ budget: 100, currency: 'CNY', days: 30, reserve: 200, solve_for: '住宿', expenses: [{ label: '餐食', amount: 300, period: 'month' }] });
  assert.equal(snapshot.spending_cap.originalTotal, 0);
  assert.equal(snapshot.spending_cap.originalBalance, -400);
  const result = recalculateBudget(snapshot, { days: 15 });
  assert.equal(result.spending_cap.total, 0); assert.equal(result.reallocated_spending_cap.total, 0);
  assert.equal(result.remaining, -250); assert.equal(result.arithmetic_balanced, false);
});

test('an empty plan without solve_for does not fabricate lodging or consume its remaining budget', () => {
  const result = recalculateBudget(snapshotBudget({ budget: 0, currency: 'JPY', days: 30 }), { days: 15 });
  assert.equal(result.spending_cap, null); assert.equal(result.reallocated_spending_cap, null);
  assert.equal(result.spending, 0); assert.equal(result.remaining, 0); assert.equal(result.market_feasibility, 'unknown');
});

test('derived receipt totals are ignored, and returned state shares no mutable expense references', () => {
  const snapshot = snapshotBudget({ budget: 1000, currency: 'cny', days: 30, expenses: [{ label: '交通', amount: 200, period: 'month', total: 999, daily: 6.67 }] });
  assert.equal(snapshot.currency, 'CNY'); assert.deepEqual(snapshot.expenses, [{ label: '交通', amount: 200, period: 'month' }]);
  const result = recalculateBudget(snapshot, { days: 15 });
  result.snapshot.expenses[0].amount = 1; result.expenses[0].amount = 2;
  assert.equal(snapshot.expenses[0].amount, 200);
});

test('invalid inputs and duplicate solved items fail clearly rather than changing the plan', () => {
  for (const patch of [{ days: 0 }, { days: 1.5 }, { days: 366 }, { budget: NaN }, { budget: -1 }, { budget: '2000' }, { reserve: Infinity }, { currency: '人民币' }]) {
    assert.throws(() => snapshotBudget({ ...base(), ...patch }));
  }
  for (const expense of [{ label: '费用', amount: -1, period: 'day' }, { label: '费用', amount: 2, period: 'week' }, { label: '', amount: 2, period: 'day' }]) {
    assert.throws(() => snapshotBudget({ ...base(), expenses: [expense] }));
  }
  assert.throws(() => snapshotBudget({ ...base(), expenses: [{ label: '住宿', amount: 1, period: 'month' }] }), /SOLVED_EXPENSE_ALREADY_LISTED/);
  const snapshot = freeze(snapshotBudget(base()));
  assert.throws(() => recalculateBudget(snapshot, { days: 15, mode: 'silently_change_prices' }), /INVALID_RECALCULATION_MODE/);
  assert.throws(() => recalculateBudget(snapshot, { days: 0 }));
  assert.throws(() => recalculateBudget({ ...snapshot, version: 2 }, { days: 15 }), /UNSUPPORTED_PLAN_SNAPSHOT/);
});
