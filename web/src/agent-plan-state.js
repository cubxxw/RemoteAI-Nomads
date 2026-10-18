// Serializable arithmetic state. Planning allocations never become market quotes.
const MAX_AMOUNT = 100000000;
const round = value => { const n = Math.round((value + Number.EPSILON) * 100) / 100; return n === 0 ? 0 : n; };
const fail = code => { throw new Error(code); };
const amount = value => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) fail('INVALID_PLAN_AMOUNT');
  return value;
};
const duration = value => {
  if (!Number.isInteger(value) || value < 1 || value > 365) fail('INVALID_PLAN_DAYS');
  return value;
};
const label = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) fail('INVALID_EXPENSE_LABEL');
  return value;
};
const expenseTotal = (expense, days) => round(expense.amount * (expense.period === 'day' ? days : expense.period === 'month' ? days / 30 : 1));
const anchor = (name, total, days, balance = total, origin = 'original_plan') => ({
  label: name, originalTotal: total, originalDays: days, originalBalance: balance, origin,
  basis: origin === 'original_plan' ? 'original_planning_cap' : 'explicit_reallocation_cap',
  market_feasibility: 'unknown', quote: false,
});
const cap = (reference, days, basis) => {
  if (!reference) return null;
  const total = round(reference.originalTotal * days / reference.originalDays);
  return { ...reference, total, daily: Math.floor((total / days + Number.EPSILON) * 100) / 100,
    basis, market_feasibility: 'unknown', quote: false };
};

/** Capture raw plan_budget arguments, preserving amount/period rather than rounded display totals. */
export function snapshotBudget(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) fail('INVALID_PLAN_ARGUMENTS');
  const originalBudget = amount(args.budget), originalDays = duration(args.days ?? 30), reserve = amount(args.reserve ?? 0);
  if (typeof args.currency !== 'string' || !/^[A-Za-z]{3}$/.test(args.currency)) fail('INVALID_PLAN_CURRENCY');
  const currency = args.currency.toUpperCase();
  if (!Array.isArray(args.expenses ?? []) || (args.expenses?.length || 0) > 12) fail('INVALID_PLAN_EXPENSES');
  const expenses = (args.expenses || []).map(expense => {
    if (!expense || typeof expense !== 'object' || !['day', 'month', 'once'].includes(expense.period)) fail('INVALID_EXPENSE_PERIOD');
    return { label: label(expense.label), amount: amount(expense.amount), period: expense.period };
  });
  const solve_for = args.solve_for === undefined || args.solve_for === null ? null : label(args.solve_for);
  if (solve_for && expenses.some(e => e.label.trim().toLowerCase() === solve_for.trim().toLowerCase())) fail('SOLVED_EXPENSE_ALREADY_LISTED');
  const balance = round(originalBudget - reserve - expenses.reduce((sum, e) => sum + expenseTotal(e, originalDays), 0));
  const spending_cap = solve_for ? anchor(solve_for, Math.max(0, balance), originalDays, balance) : null;
  return { version: 1, originalBudget, originalDays, currency, reserve, expenses, solve_for,
    spending_cap, active_spending_cap: spending_cap ? { ...spending_cap } : null,
    currentBudget: originalBudget, currentDays: originalDays };
}

function restoreSnapshot(snapshot) {
  if (!snapshot || snapshot.version !== 1) fail('UNSUPPORTED_PLAN_SNAPSHOT');
  const restored = snapshotBudget({ budget: snapshot.originalBudget, currency: snapshot.currency, days: snapshot.originalDays,
    reserve: snapshot.reserve, expenses: snapshot.expenses, solve_for: snapshot.solve_for });
  restored.currentBudget = amount(snapshot.currentBudget ?? snapshot.originalBudget);
  restored.currentDays = duration(snapshot.currentDays ?? snapshot.originalDays);
  if (!restored.spending_cap) {
    if (snapshot.spending_cap || snapshot.active_spending_cap) fail('INVALID_SNAPSHOT_ALLOCATION');
    return restored;
  }
  const original = snapshot.spending_cap;
  if (!original || original.label !== restored.spending_cap.label || original.originalTotal !== restored.spending_cap.originalTotal ||
    original.originalDays !== restored.originalDays) fail('INVALID_ORIGINAL_PLAN_ALLOCATION');
  const active = snapshot.active_spending_cap || original;
  if (active.label !== restored.solve_for || !['original_plan', 'explicit_reallocation'].includes(active.origin)) fail('INVALID_SNAPSHOT_ALLOCATION');
  const total = amount(active.originalTotal), days = duration(active.originalDays);
  if (active.origin === 'original_plan' && (total !== original.originalTotal || days !== original.originalDays)) fail('INVALID_ORIGINAL_PLAN_ALLOCATION');
  restored.active_spending_cap = anchor(active.label, total, days,
    active.origin === 'original_plan' ? restored.spending_cap.originalBalance : total, active.origin);
  return restored;
}

/**
 * Default: preserve prices and the current allocation's original ratio.
 * Only explicit reallocation consumes the newly available balance and creates a new active anchor.
 * The returned snapshot can be passed to the next call; the supplied snapshot is never mutated.
 */
export function recalculateBudget(snapshot, options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_RECALCULATION_ARGUMENTS');
  const days = duration(options.days), mode = options.mode ?? 'preserve_allocations';
  if (!['preserve_allocations', 'reallocate_remaining'].includes(mode)) fail('INVALID_RECALCULATION_MODE');
  const next = restoreSnapshot(snapshot);
  const budget = options.budget === undefined ? next.currentBudget : amount(options.budget);
  const expenses = next.expenses.map(expense => ({ ...expense, basis: 'planning_assumption', total: expenseTotal(expense, days) }));
  const listed_spending = round(expenses.reduce((sum, e) => sum + e.total, 0));
  const balance_before_cap = round(budget - next.reserve - listed_spending);
  const preserved_spending_cap = cap(next.active_spending_cap, days, 'preserved_planning_cap');
  const available = Math.max(0, balance_before_cap);
  const reallocated_spending_cap = next.solve_for ? cap(anchor(next.solve_for, available, days, balance_before_cap, 'explicit_reallocation'), days, 'reallocation_option') : null;
  const spending_cap = mode === 'reallocate_remaining' && reallocated_spending_cap
    ? { ...reallocated_spending_cap, basis: 'explicit_reallocation_cap' }
    : preserved_spending_cap ? { ...preserved_spending_cap } : null;
  if (mode === 'reallocate_remaining' && next.solve_for) next.active_spending_cap = anchor(next.solve_for, available, days, balance_before_cap, 'explicit_reallocation');
  next.currentBudget = budget; next.currentDays = days;
  const spending = round(listed_spending + (spending_cap?.total || 0));
  const total_allocated = round(spending + next.reserve), remaining = round(budget - total_allocated);
  return { snapshot: next, mode, budget, currency: next.currency, days, reserve: next.reserve,
    usable: round(budget - next.reserve), expenses, listed_spending, balance_before_cap,
    original_spending_cap: next.spending_cap ? { ...next.spending_cap } : null,
    preserved_spending_cap, reallocated_spending_cap, spending_cap,
    spending, total_allocated, remaining, arithmetic_balanced: remaining >= 0,
    daily_envelope: round((budget - next.reserve) / days), remaining_per_day: round(remaining / days),
    market_feasibility: 'unknown', quote: false,
    basis: '保留原始日价、月价和一次性金额；住宿余额是规划上限，不是报价。默认沿用原分配，重分配余额须明确选择。',
    formula: '日价×天数；月价×天数÷30；一次性与预留不变；原规划上限×新天数÷原规划天数。',
  };
}
