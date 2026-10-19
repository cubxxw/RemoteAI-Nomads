import { createFlashRun,publicFlashRun,runFlashAgent,validateFlashInput } from '../agent/flash-agent.mjs';
import { executeNomadTool } from './agent-tools.js';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const active=run=>run&&['running','stopping','finalizing'].includes(run.status);
function abortableDatabase(db,signal){
  const check=()=>signal?.throwIfAborted();
  const wrap=statement=>({
    bind(...values){check();return wrap(statement.bind(...values));},
    async all(){check();const result=await statement.all();check();return result;},
    async first(){check();const result=await statement.first();check();return result;},
  });
  return {prepare(sql){check();return wrap(db.prepare(sql));}};
}
const failures={TIME_LIMIT:'这次查证超过了三分钟，任务已停止。问题已保留，可以缩小范围后重试。',MODEL_BUDGET:'本次已达到处理步骤额度，可以分成两个问题继续。',TOOL_BUDGET:'本次查询较多，可以先选择两座城市继续比较。',TOKEN_BUDGET:'本次资料较多，已停止继续计费。可以缩小范围再问。',MODEL_BALANCE_REQUIRED:'助手的模型额度暂时不足，问题已保留。城市资料仍可正常浏览。',MODEL_RATE_LIMIT:'模型当前使用较多，请稍后重试。',UNSUPPORTED_ANSWER:'这次回答仍有未核实的事实，暂未作为结论发出。问题已保留，可以调整条件重试。'};

// SQLite Durable Objects are available on Workers Free. No Container or subprocess.
// The object name is derived from the HttpOnly session cookie by the gateway.
export class NomadAgent {
  constructor(ctx,env,fetcher=fetch){this.ctx=ctx;this.env=env;this.fetcher=fetcher;this.run=null;this.task=null;}
  async fetch(request) {
    if(!this.env.AGENT_BRIDGE_SECRET||request.headers.get('Authorization')!=='Bearer '+this.env.AGENT_BRIDGE_SECRET)return json({error:'Not found'},404);
    const owner=request.headers.get('X-Nomads-Owner');
    if(!/^[a-f0-9]{64}$/.test(owner||''))return json({error:'Not found'},404);
    const route=new URL(request.url).pathname;
    if(route==='/status'&&request.method==='GET')return json({ready:!!this.env.DEEPSEEK_API_KEY,model:'deepseek-flash',harness:'Workers native tools',read_only:true,active_runs:active(this.run)&&this.run.owner===owner?[this.run.id]:[]});
    if(/^\/(runs|evals)\/[a-f0-9-]{36}$/.test(route)&&request.method==='GET') {
      const id=route.split('/').at(-1),evaluation=route.startsWith('/evals/');
      if(this.run?.id===id&&this.run.owner===owner) {
        const trace=publicFlashRun(this.run);
        return json(evaluation?{...trace,grounding_check:this.run.grounding,contract_errors:this.run.contract_errors||[],audit_history:this.run.audit_history||[],evidence:[...this.run.evidence].map(([id,e])=>({id,...e}))}:trace);
      }
      if(evaluation)return json({error:'Not found'},404);
      const saved=await this.ctx.storage.get('trace:'+id);
      if(!saved||saved.owner!==owner)return json({error:'Not found'},404);
      const {owner:privateOwner,...trace}=saved;
      // A prior in-flight fetch cannot survive an object restart. Report a closed
      // interruption instead of a forever-running task or a false completion.
      if(active(trace)){trace.status='failed';trace.runtime_reaped=true;trace.code='RUNTIME_INTERRUPTED';}
      return json(trace);
    }
    if(!['/answer','/cancel','/heartbeat','/tool'].includes(route)||request.method!=='POST')return json({error:'Not found'},404);
    const text=await request.text();if(text.length>24000)return json({error:'提问过长。'},413);
    let input;try{input=JSON.parse(text);}catch{return json({error:'无法读取提问。'},400);}
    if(route==='/tool'){
      try{
        request.signal.throwIfAborted();
        const scoped={...this.env,DB:abortableDatabase(this.env.DB,request.signal)};
        return json(await executeNomadTool(scoped,input?.name,input?.args));
      }
      catch{return json({error:{code:'DATABASE_UNAVAILABLE',message:'资料暂时未能读取，请稍后重试。'}},503);}
    }
    if(route==='/heartbeat') {
      const run=this.run;
      if(!active(run)||!run.renewLease||run.id!==input?.run_id||run.owner!==owner)return json({error:'Not found'},404);
      run.renewLease();return json({alive:true});
    }
    if(route==='/cancel') {
      const run=this.run;
      if(!run||run.id!==input?.run_id||run.owner!==owner)return json({error:'Not found'},404);
      if(active(run)){run.status='stopping';run.controller.abort(new Error('CANCELLED'));await this.task;}
      return json({cancelled:run.status==='cancelled'&&run.reaped,status:run.status,runtime_reaped:!!run.reaped});
    }
    if(!this.env.DEEPSEEK_API_KEY)return json({error:'助手尚未完成配置。'},503);
    let previousBudget;try{previousBudget=validateFlashInput(input);}catch{return json({error:'提问或对话记录无效，请缩短后重试。'},400);}
    if(this.task||this.admitting)return json({error:'已有回答正在进行，请先停止或稍候。'},429);
    this.admitting=true;
    const run=createFlashRun(owner,previousBudget);this.run=run;
    // Persist a small, non-content trace for cancellation/reload recovery.
    try{
      await this.ctx.storage.put('trace:'+run.id,{...publicFlashRun(run),owner});
      await this.ctx.storage.setAlarm(Date.now()+3600000);
    }catch{this.admitting=false;run.status='failed';return json({error:'助手暂时未能启动，请稍后重试。'},503);}
    const encoder=new TextEncoder();let writer,closed=false;
    const stream=new ReadableStream({start(controller){writer=controller;},cancel(){closed=true;if(active(run))run.controller.abort(new Error('CANCELLED'));}});
    const emit=(event,data)=>{
      run.events.push({event,...data,at:Date.now()});
      if(!closed)try{writer.enqueue(encoder.encode('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n'));}catch{closed=true;if(active(run))run.controller.abort(new Error('CANCELLED'));}
    };
    let leaseTimer;
    if(request.headers.get('X-Nomads-Stream-Lease')==='1'){
      run.renewLease=()=>{clearTimeout(leaseTimer);leaseTimer=setTimeout(()=>{if(active(run))run.controller.abort(new Error('CANCELLED'));},45000);};
      run.renewLease();
    }
    emit('start',{run_id:run.id,model:'deepseek-flash',read_only:true,...(run.renewLease?{lease_ms:45000}:{})});
    this.task=(async()=>{
      let answer,failure;
      try{answer=await runFlashAgent(run,input,this.env,emit,{fetcher:this.fetcher,executeTool:(_env,name,args)=>this.readTool(run,name,args)});run.status='finalizing';}
      catch(error){
        failure=run.controller.signal.aborted?(run.stop_reason==='timeout'?'TIME_LIMIT':'CANCELLED'):(/^[A-Z_]{1,80}$/.test(error.message)?error.message:'AGENT_RUNTIME_ERROR');
        if(failure==='AGENT_RUNTIME_ERROR')console.error(JSON.stringify({run:run.id,code:failure,name:error.name,message:String(error.message).replaceAll(this.env.DEEPSEEK_API_KEY,'[redacted]').replaceAll(this.env.AGENT_BRIDGE_SECRET,'[redacted]').slice(0,240)}));
      }
      finally{
        clearTimeout(leaseTimer);run.renewLease=null;
        run.ended=Date.now();run.status=failure?(failure==='CANCELLED'?'cancelled':'failed'):'completed';
        try{await this.ctx.storage.put('trace:'+run.id,{...publicFlashRun(run),owner});}catch{failure='TRACE_UNAVAILABLE';run.status='failed';}
        if(failure)emit(failure==='CANCELLED'?'cancelled':'error',{code:failure,runtime_reaped:!!run.reaped,message:failure==='CANCELLED'?'已停止，本次任务已关闭。':failures[failure]||'这次资料查询暂未完成。问题已保留，可以重试。'});
        else{emit('answer',answer);emit('done',{trace:publicFlashRun(run)});}
        if(!closed){closed=true;try{writer.close();}catch{}}
        this.task=null;
      }
    })();
    this.admitting=false;
    this.ctx.waitUntil(this.task);
    return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
  }
  async readTool(run,name,args){
    if(!this.env.NOMAD_AGENT)return executeNomadTool(this.env,name,args);
    // Each data call gets a fresh invocation's D1 allowance. A long tool loop
    // must not share the Free plan's 50-query cap across all of its tools.
    const reader=this.env.NOMAD_AGENT.get(this.env.NOMAD_AGENT.idFromName('tools:'+run.id));
    const response=await reader.fetch('https://agent.internal/tool',{method:'POST',headers:{Authorization:'Bearer '+this.env.AGENT_BRIDGE_SECRET,'X-Nomads-Owner':run.owner,'Content-Type':'application/json'},body:JSON.stringify({name,args}),signal:run.controller.signal});
    if(!response.ok)throw Error('DATABASE_UNAVAILABLE');
    return response.json();
  }
  async alarm(){if(this.task)await this.ctx.storage.setAlarm(Date.now()+3600000);else{await this.ctx.storage.deleteAll();this.run=null;}}
}
