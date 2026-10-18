import { FlashSession } from './flash-client.mjs';
import { secretaryPrompt, checkerPrompt } from './prompts.mjs';
import { executeNomadTool,toolDefinitions,toolLabels,validateArgs,argumentProblems } from '../src/agent-tools.js';
import { recalculateBudget } from '../src/agent-plan-state.js';
import { finishPlanDefinition,submitCheckDefinition } from './presentation.mjs';
import { readWithEvidence } from './ledger.mjs';
import { parseAnswer } from './answer.mjs';
import { auditSearchClaims,compactProof,acceptedAudit } from './grounding.mjs';
import { materialClaims,requireClaimCoverage } from './material-claims.mjs';
import { selectBudgetSnapshot,budgetChoices } from './budget-choice.mjs';
import { auditBudgetScope } from './budget-scope.mjs';
import { auditAffordability } from './affordability.mjs';

export function validateFlashInput(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.question!=='string'||!input.question.trim()||input.question.length>3000)throw Error('INVALID_INPUT');
  if(input.history!==undefined&&(!Array.isArray(input.history)||input.history.length>6||input.history.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>8000)))throw Error('INVALID_HISTORY');
  if(input.context!==undefined&&(!input.context||typeof input.context!=='object'||Array.isArray(input.context)))throw Error('INVALID_CONTEXT');
  return input.previous_budget?recalculateBudget(input.previous_budget,{days:input.previous_budget.currentDays}).snapshot:null;
}
export function createFlashRun(owner,previousBudget=null) {
  return {id:crypto.randomUUID(),owner,controller:new AbortController(),started:Date.now(),status:'running',phase:'planning',events:[],requests:0,calls:0,usage:{},evidence:new Map(),cities:new Map(),sourceIds:new Set(),verified:false,reaped:false,previousBudget};
}
export function publicFlashRun(run) {
  return {id:run.id,status:run.status,model:'deepseek-flash',harness:'Workers native tools v1',elapsed_ms:(run.ended||Date.now())-run.started,
    model_requests:run.requests,tool_calls:run.calls,usage:run.usage,evidence_checked:run.verified,runtime_reaped:!!run.reaped,
    events:run.events.filter(e=>['tool_start','tool_end','model','error','cancelled'].includes(e.event)).map(({at,event,call_id,tool,label,duration_ms,ok,count})=>({at,event,call_id,tool,label,duration_ms,ok,count})),
    ...(run.grounding?{grounding_check:{model:'deepseek-flash',supported:run.grounding.supported,attempts:run.grounding.attempts}}:{})};
}
export async function runFlashAgent(run,input,env,emit,{fetcher=fetch,executeTool=executeNomadTool}={}) {
  const sessions=[];
  const resultCache=new Map();
  async function execute(name,args) {
    run.controller.signal.throwIfAborted();
    const presentation=[finishPlanDefinition,submitCheckDefinition].find(d=>d.name===name);
    const def=presentation||toolDefinitions.find(d=>d.name===name);
    if(!def||!validateArgs(args,def.parameters))return {error:{code:'INVALID_TOOL_ARGUMENTS',problems:def?argumentProblems(args,def.parameters):['工具不在允许范围内'],message:'请按工具定义修正参数再调用。'}};
    if(presentation) {
      if(name==='finish_plan'&&run.phase==='planning'){run.draft=structuredClone(args);run.draft_version=(run.draft_version||0)+1;}
      else if(name==='submit_check'&&run.phase==='validation')run.check_submission=structuredClone(args);
      else throw Error('INVALID_PRESENTATION_ROLE');
      return {received:true};
    }
    if(name==='get_sources'&&args.source_ids.some(id=>!run.sourceIds.has(id)))return {error:{code:'UNREAD_SOURCE',message:'只能核对本次工具已返回的来源ID。'}};
    const cacheKey=name+JSON.stringify(args);
    if(resultCache.has(cacheKey))return resultCache.get(cacheKey);
    const result=await readWithEvidence(run,{name,args,label:toolLabels[name]},async()=>{
      if(name==='recalculate_budget')return run.previousBudget?{data:recalculateBudget(run.previousBudget,args),cities:[],sources:[],warnings:[],read_only:true}:{error:{code:'PREVIOUS_PLAN_REQUIRED',message:'当前没有已保存的预算快照，请从用户已确认条件建立计划。'}};
      return executeTool(env,name,args);
    },emit);
    // Retain full evidence for links, cards and audit. Avoid sending duplicate
    // city arrays and decorative photo URLs back on every model turn.
    const {cities:duplicateCities,...data}=result.data||{};
    const compact={...result,data,cities:(result.cities||[]).map(({photo,url,...city})=>city)};
    if(duplicateCities&&!result.cities?.length)compact.data.cities=duplicateCities;
    if(!result.error)resultCache.set(cacheKey,compact);
    return compact;
  }
  function session(prompt,definitions,terminal) {
    const client=new FlashSession({apiKey:env.DEEPSEEK_API_KEY,prompt,definitions,terminal,signal:run.controller.signal,fetcher,execute,
      onRequest(){
        run.requests++;
        const key=run.phase==='validation'?'checking_requests':'planning_requests';run[key]=(run[key]||0)+1;
        if(run.requests>18||run[key]>(key==='checking_requests'?6:12))throw Error('MODEL_BUDGET');
        // Cache replay costs much less than fresh generation. This is a soft
        // next-request safeguard using Flash's current relative token weights,
        // not a promise of a hard dollar cap.
        const fresh=run.usage.prompt_cache_miss_tokens??Math.max(0,(run.usage.prompt_tokens||0)-(run.usage.prompt_cache_hit_tokens||0));
        const weighted=fresh+(run.usage.prompt_cache_hit_tokens||0)/50+(run.usage.completion_tokens||0)*4;
        if(weighted>250000)throw Error('TOKEN_BUDGET');
        emit('model',{round:run.requests,label:run.phase==='validation'?'正在核对回答与依据':run.requests===1?'正在理解条件':'正在核对并组织答案'});
      },
      onUsage(usage){for(const key of ['prompt_tokens','completion_tokens','total_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens'])if(typeof usage[key]==='number'&&usage[key]>=0&&Number.isFinite(usage[key]))run.usage[key]=(run.usage[key]||0)+usage[key];},
    });sessions.push(client);return client;
  }
  const deadline=setTimeout(()=>{run.stop_reason='timeout';run.controller.abort(new Error('TIME_LIMIT'));},180000);
  try {
    const context={current_date:new Date().toISOString().slice(0,10),current_filters:input.context||{},planning_defaults:{party_size:1,days:null,transport_to_destination:'未说明；以用户条件为准'},previous_budget:run.previousBudget,history:input.history||[]};
    let planner=session(secretaryPrompt,[...toolDefinitions,finishPlanDefinition],'finish_plan');
    await planner.run(JSON.stringify({context,question:input.question}));
    let answer;
    let formatFailures=0;
    for(let attempt=0;attempt<3;) {
      run.controller.signal.throwIfAborted();
      try {
        if(!run.draft)throw Error('DRAFT_NOT_SUBMITTED');
        answer=parseAnswer(JSON.stringify(run.draft),run);
        answer.proposal_version=run.draft_version;
        auditSearchClaims(answer,run);
        auditBudgetScope(answer.answer,input);
        auditAffordability(answer.answer);
      }catch(error){
        if(++formatFailures>=3)throw error;
        run.phase='planning';run.draft=null;
        (run.contract_errors??=[]).push(error.message);
        emit('checking',{label:'正在校正回答格式与引用'});
        const instructions={UNCONFIRMED_TRANSPORT_EXCLUSION:'用户未明确排除的机票、动车或往返交通不能写成已排除。未知费用列为待从总预算扣除，不能改变用户总预算。',UNPROVEN_CITY_PRICE_FLOOR:'当前数据没有穷举全城供给，不能得出“整月不现实、只能借宿”等结论。删除这种全局断言，保留具体假设下的余额和可验证的住房选项；单条整租报价只能否定那条报价。'};
        await planner.run(JSON.stringify({correction:error.message,evidence_ids:[...run.evidence.keys()],city_slugs:[...run.cities.keys()],instruction:(instructions[error.message]||'只修正此结构或引用问题。')+'用finish_plan重新提交。'}));
        continue;
      }
      run.phase='validation';run.check_submission=null;
      emit('checking',{label:'正在核对回答与本次依据'});
      const claims=materialClaims(answer.answer);
      const checker=session(checkerPrompt,[submitCheckDefinition],'submit_check');
      const checkInput={context,question:input.question,answer:answer.answer,claims,cities:answer.cities,evidence:compactProof(run)};
      let check;
      for(let formatAttempt=0;formatAttempt<2;formatAttempt++) {
        await checker.run(JSON.stringify(checkInput));
        try {check=requireClaimCoverage(run.check_submission,claims);break;}
        catch{if(formatAttempt===1)throw Error('CHECKER_FORMAT_UNAVAILABLE');run.check_submission=null;}
      }
      checker.close();
      run.grounding={model:'deepseek-flash',supported:acceptedAudit(check),issues:check.issues,checks:check.checks,attempts:attempt+1};
      (run.audit_history??=[]).push({proposal_version:answer.proposal_version,answer:answer.answer,claims,check});
      if(run.grounding.supported)break;
      if(++attempt>=3)throw Error('UNSUPPORTED_ANSWER');
      run.phase='planning';run.draft=null;
      emit('checking',{label:'发现不一致，正在按依据修正'});
      // Rebuild from the user's request and actual evidence. Reusing all prior
      // hidden reasoning kept anchoring Flash to unsupported first-draft claims.
      planner.close();
      planner=session(secretaryPrompt,[...toolDefinitions,finishPlanDefinition],'finish_plan');
      await planner.run(JSON.stringify({context,question:input.question,evidence:compactProof(run),prior_answer:answer.answer,issues:check.issues,instruction:'根据工具证据重新组织简短、有用的回答，修正这些冲突；删掉无依据或无关的附加判断，不必保留原段落。需要新计算就调用工具，再用finish_plan提交。'}));
    }
    if(!answer||!run.grounding?.supported)throw Error('UNSUPPORTED_ANSWER');
    run.controller.signal.throwIfAborted();
    run.verified=answer.evidence_checked;
    answer.grounding_check=run.grounding;
    const snapshot=selectBudgetSnapshot(run.evidence,answer.evidence.map(e=>e.id));
    if(snapshot)answer.budget_snapshot=snapshot;
    answer.budget_options=budgetChoices(run.evidence,answer.evidence.map(e=>e.id));
    return answer;
  } finally {
    clearTimeout(deadline);
    sessions.forEach(s=>s.close());
    run.reaped=true;
  }
}
