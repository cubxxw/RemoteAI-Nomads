export function selectBudgetSnapshot(evidence,selectedIds){
 const chosen=new Set(selectedIds);
 const plans=[...evidence].filter(([id,e])=>chosen.has(id)&&e.purpose!=='alternative_calculation'&&['plan_budget','recalculate_budget'].includes(e.tool)&&e.result.data?.snapshot);
 // Multiple hypotheses are choices, not an implicit user confirmation of the last one.
 return plans.length===1?structuredClone(plans[0][1].result.data.snapshot):null;
}
import {snapshotBudget} from '../src/agent-plan-state.js';

export function budgetChoices(evidence,selectedIds){
 const selected=new Set(selectedIds),choices=[];
 for(const [id,e]of evidence){
  if(!selected.has(id))continue;
  if(e.tool==='explore_budget_options')for(const [i,option]of(e.result.data?.options||[]).entries()){
   const scenario=e.args.scenarios[i];
   choices.push({id:id+':'+i,label:option.label,days:option.days,currency:e.result.data.currency,
    spending:option.non_housing_total,remaining:option.accommodation_total_cap,remaining_label:'留给住宿',
    snapshot:snapshotBudget({budget:e.args.budget,currency:e.args.currency,days:scenario.days??e.args.days,reserve:e.args.reserve,expenses:scenario.expenses,solve_for:'住宿'})});
  }
  else if(['plan_budget','recalculate_budget'].includes(e.tool)&&e.result.data?.snapshot){
   const p=e.result.data;choices.push({id,label:p.days+'天的预算假设',days:p.days,currency:p.currency,spending:p.spending,remaining:p.remaining,remaining_label:'未分配',snapshot:structuredClone(p.snapshot)});
  }
 }
 return choices.length>1||choices.some(c=>evidence.get(c.id.split(':')[0])?.purpose==='alternative_calculation'||c.id.includes(':'))?choices.slice(0,6):[];
}
