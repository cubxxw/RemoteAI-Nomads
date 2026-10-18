import {calculateBudget} from './agent-budget.js';
import {snapshotBudget} from './agent-plan-state.js';

/** Explore a finite set of explicit assumptions, never a city's market supply. */
export function exploreBudgetOptions({budget,currency,days,reserve=0,scenarios}) {
 if(!Array.isArray(scenarios)||scenarios.length<2||scenarios.length>6)throw Error('TWO_TO_SIX_SCENARIOS_REQUIRED');
 const names=new Set();
 const options=scenarios.map(({label,expenses,days:scenarioDays})=>{
  if(typeof label!=='string'||!label.trim()||label.length>80||names.has(label.trim()))throw Error('UNIQUE_SCENARIO_LABEL_REQUIRED');
  names.add(label.trim());
  if(!Array.isArray(expenses)||expenses.some(e=>!['food','transport','utilities','workspace','insurance','communications','activities','incidentals'].includes(e.category)))throw Error('NON_HOUSING_CATEGORY_REQUIRED');
  if(expenses.some(e=>/住宿|房租|住房|租金|\b(?:rent|housing|lodging|accommodation|bed)\b/i.test(e.label)))throw Error('HOUSING_NOT_A_NON_HOUSING_EXPENSE');
  const args={budget,currency,days:scenarioDays??days,reserve,expenses,solve_for:'住宿'};
  if(!Number.isInteger(args.days))throw Error('SCENARIO_DURATION_REQUIRED');
  const snapshot=snapshotBudget(args);
  const plan=calculateBudget({...args,currency:snapshot.currency});
  return {label:label.trim(),days:plan.days,expenses:plan.expenses,non_housing_total:plan.spending,
   accommodation_total_cap:plan.spending_cap.total,accommodation_daily_cap:plan.spending_cap.daily,
   arithmetic_balanced:plan.arithmetic_balanced,market_feasibility:'unknown',quote:false};
 });
 const caps=options.map(o=>o.accommodation_daily_cap);
 return {budget,currency:currency.toUpperCase(),days:days??null,reserve,options,
  accommodation_cap_range:{minimum:Math.min(...caps),maximum:Math.max(...caps)},
  equation:'住宿总额 + 已列非住宿支出 + 预留 ≤ 总预算；所有金额同币种',
  exploration_scope:'只比较明确列出的假设，不是全城供给或全部消费可能性的穷举。',
  necessary_condition:'某一情景的住宿上限只在该组其他支出不变时成立，不能作为所有方案必须遵守的市场阈值。',
  accommodation_search_forms:['青旅床位','合租房间','独立房间','整租住房'].map(form=>({form,availability:'not_verified',price:'not_provided'})),
  next_step:'按所选城市和日期分别核对房型、租期、工作网络、税费和押金；查到的总价代回预算。用户选定方案后用plan_budget保存原始单价。',
  market_feasibility:'unknown',market_coverage_complete:false,quote:false};
}
