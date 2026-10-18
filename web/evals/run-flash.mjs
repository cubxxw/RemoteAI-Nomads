import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {loadAgentConfig} from '../agent/config.mjs';
import {createFlashRun,runFlashAgent,publicFlashRun,validateFlashInput} from '../agent/flash-agent.mjs';
import {grade} from './grade.mjs';
import {consumeEvents} from './live-result.mjs';
import {liveTargetFromArgs} from '../scripts/live-target.mjs';

// Resolve and validate consent to a specific live origin before reading any
// development or deployment credentials. No flags retains local direct eval.
const origin=liveTargetFromArgs(process.argv.slice(2));
const config=await loadAgentConfig(process.cwd());
if(!config.DEEPSEEK_API_KEY)throw Error('Model key unavailable');
let bridge=config.AGENT_BRIDGE_SECRET;
if(origin?.startsWith('https:'))bridge=JSON.parse(await readFile('.data/deploy/agent-secrets.json','utf8')).AGENT_BRIDGE_SECRET;
const numbers=new Set(process.argv.slice(2).filter(v=>/^\d+$/.test(v)).map(Number));
const suite=JSON.parse(await readFile('evals/cases.json','utf8'));
if(process.argv.includes('--extra'))suite.push(...JSON.parse(await readFile('evals/flash-extra-cases.json','utf8')));
const cases=suite.filter(c=>!numbers.size||numbers.has(c.id));
const directory='.data/flash-evals/'+new Date().toISOString().replace(/[:.]/g,'-');await mkdir(directory,{recursive:true,mode:0o700});
const db=new DatabaseSync('.data/release/published.sqlite',{readOnly:true});
const prepare=(sql,args=[])=>({bind(...values){return prepare(sql,values);},async all(){return {results:db.prepare(sql).all(...args)};},async first(){return db.prepare(sql).get(...args)||null;}});
const env={DB:{prepare},PREVIEW:'false',DEEPSEEK_API_KEY:config.DEEPSEEK_API_KEY};
const expected=new Map(db.prepare('SELECT slug,budget_amount FROM cities').all().map(c=>[c.slug,c]));
const files=['agent/flash-client.mjs','agent/flash-agent.mjs','agent/budget-scope.mjs','agent/affordability.mjs','agent/prompts.mjs','src/flash-runtime.js','src/agent-gateway.js','src/agent-tools.js','src/agent-budget.js','src/agent-budget-options.js','src/agent-plan-state.js','src/cost-data.js','agent/answer.mjs','agent/grounding.mjs','agent/material-claims.mjs','agent/ledger.mjs','agent/presentation.mjs','agent/budget-choice.mjs','public/modules/agent-sse.js','evals/live-result.mjs','evals/grade.mjs','evals/cases.json','evals/flash-extra-cases.json','evals/run-flash.mjs'];
const hash=createHash('sha256');for(const f of files)hash.update(f+'\n').update(await readFile(f));
const fingerprint=hash.digest('hex');
const releaseBefore=origin?await (await fetch(origin+'/release.json')).json():null;
await writeFile(directory+'/manifest.json',JSON.stringify({model:'deepseek-flash',origin:origin||'direct HTTP model + read-only published SQLite snapshot',runtime_sha256:fingerprint,release:releaseBefore,questions:cases.map(c=>({id:c.id,question:c.question})),started_at:new Date().toISOString()},null,2),{mode:0o600});
let cursor=0;const results=[];
async function execute(c){
  const started=Date.now();let answer,trace,error,run,diagnostic;
  try{
    if(origin){
      const headers={Authorization:'Bearer '+bridge,Cookie:'nomads-agent-session='+randomUUID(),'Content-Type':'application/json'};
      const response=await fetch(origin+'/api/agent/answer',{method:'POST',headers,body:JSON.stringify({question:c.question,context:c.context||{},history:c.history||[]}),signal:AbortSignal.timeout(205000)});
      if(!response.ok)throw Error('HTTP_'+response.status);
      let id,streamError,terminal=false;
      try {await consumeEvents(response,(event,data)=>{
        if(event==='start')id=data.run_id;if(event==='answer')answer=data;if(event==='error')error=data.code;
        if(event==='done'||event==='error'||event==='cancelled')terminal=true;
      });}catch(e){streamError=e;diagnostic={stage:'stream',name:e.name,message:String(e.message).replaceAll(config.DEEPSEEK_API_KEY,'[redacted]').replaceAll(bridge,'[redacted]').slice(0,240),run_id:id};}
      if(id){
        const audit=await fetch(origin+'/api/agent/evals/'+id,{headers});
        if(audit.ok)trace=await audit.json();
        else diagnostic={...diagnostic,trace_http:audit.status,run_id:id};
      }
      if(streamError)error='STREAM_INTERRUPTED';
      else if(!terminal)error='STREAM_NOT_COMPLETED';
    }else{
      run=createFlashRun(createHash('sha256').update(randomUUID()).digest('hex'),validateFlashInput(c));
      answer=await runFlashAgent(run,c,env,(event,data)=>run.events.push({event,...data,at:Date.now()}));
      run.ended=Date.now();run.status='completed';
    }
  }catch(e){error=/^[A-Z_0-9]+$/.test(e.message)?e.message:'EVALUATION_ERROR';diagnostic={...diagnostic,name:e.name,message:String(e.message).replaceAll(config.DEEPSEEK_API_KEY,'[redacted]').replaceAll(bridge||'__no_secret__','[redacted]').slice(0,240)};if(run){run.status='failed';run.ended=Date.now();}}
  if(run)trace={...publicFlashRun(run),grounding_check:run.grounding,contract_errors:run.contract_errors||[],audit_history:run.audit_history||[],evidence:[...run.evidence].map(([id,e])=>({id,...e}))};
  const result={id:c.id,key:c.key,question:c.question,...grade(c,answer,trace,error,{expected,apiKey:config.DEEPSEEK_API_KEY}),error,diagnostic,elapsed_ms:Date.now()-started,answer,trace};results.push(result);
  await writeFile(directory+'/'+String(c.id).padStart(2,'0')+'.json',JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify({id:c.id,passed:result.passed,score:result.score,error,elapsed_ms:result.elapsed_ms,failed:result.checks.filter(v=>!v.ok).map(v=>v.name)}));
}
await Promise.all(Array.from({length:3},async()=>{while(cursor<cases.length)await execute(cases[cursor++]);}));
results.sort((a,b)=>a.id-b.id);
const releaseAfter=origin?await (await fetch(origin+'/release.json')).json():null;
const summary={model:'deepseek-flash',runtime_sha256:fingerprint,release:releaseBefore,release_stable:!origin||releaseBefore.version_id===releaseAfter.version_id,origin:origin||'direct HTTP model + published SQLite snapshot',directory,cases:results.length,passed:results.filter(r=>r.passed).length,average:results.reduce((s,r)=>s+r.score,0)/results.length,manual_semantic_review_required:true,results:results.map(({id,key,passed,score,error,elapsed_ms})=>({id,key,passed,score,error,elapsed_ms}))};
await writeFile(directory+'/summary.json',JSON.stringify(summary,null,2),{mode:0o600});
await writeFile('.data/flash-evals/latest.json',JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify(summary));db.close();
