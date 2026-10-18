// Arithmetic for a proposed plan. These amounts are inputs, never market quotes.
const round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
export function calculateBudget({ budget, currency, days = 30, reserve = 0, expenses = [], solve_for }) {
  const lines = expenses.map((line) => ({
    ...line,
    basis: "planning_assumption",
    total: round(line.amount * (line.period === "day" ? days : line.period === "month" ? days / 30 : 1)),
  }));
  const spending = round(lines.reduce((sum, line) => sum + line.total, 0));
  const usable = round(budget - reserve);
  return {
    budget, currency, days, reserve, usable, expenses: lines,
    spending, remaining: round(usable - spending),
    daily_envelope: round(usable / days),
    remaining_per_day: round((usable - spending) / days),
    arithmetic_balanced: spending <= usable,
    market_feasibility: "unknown",
    ...(solve_for ? {spending_cap: {label:solve_for, daily:Math.floor((usable-spending)/days*100)/100, total:round(usable-spending), basis:"满足已列开支假设后，这一项最多可付多少；是找报价的目标，不是最低市场价"}} : {}),
    basis: "按输入的规划假设验算，不是市场报价；未填写项目仍需从余额中支出。",
    formula: "日价×天数 / 月价×天数÷30 / 一次性原额；总预算－预留金－已列开支=余额",
    omitted_items: "未列项目未包含，机票/押金/保险是否计入需依用户场景说明",
  };
}
