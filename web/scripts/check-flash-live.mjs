import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {liveTargetFromArgs} from './live-target.mjs';
const origin=liveTargetFromArgs(process.argv.slice(2),{required:true,allowPositional:true});
const {AGENT_BRIDGE_SECRET}=JSON.parse(await readFile('.data/deploy/agent-secrets.json','utf8'));
const owner=randomUUID(),other=randomUUID();
const headers=(id=owner)=>({Authorization:'Bearer '+AGENT_BRIDGE_SECRET,Cookie:'nomads-agent-session='+id,'Content-Type':'application/json'});
const report={origin,at:new Date().toISOString(),model:'deepseek-flash',checks:[]};
const check=(name,ok)=>{assert.ok(ok,name);report.checks.push({name,passed:true});console.log(name+': passed');};
const status=await (await fetch(origin+'/api/agent/status',{headers:headers()})).json();check('Flash runtime ready',status.ready&&status.model==='deepseek-flash');
const response=await fetch(origin+'/api/agent/answer',{method:'POST',headers:headers(),body:JSON.stringify({question:'一月去中国大陆，总预算2000人民币住30天，帮我比较几种吃住方案。'})});check('SSE accepted',response.ok&&response.headers.get('Content-Type').includes('text/event-stream'));
const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',runId,modelStarted=false;
while(!runId||!modelStarted){const {done,value}=await reader.read();assert.equal(done,false);buffer+=decoder.decode(value,{stream:true});let at;while((at=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,at);buffer=buffer.slice(at+2);const event=block.match(/^event: (.+)$/m)?.[1],line=block.match(/^data: (.+)$/m)?.[1];if(!line)continue;const data=JSON.parse(line);if(event==='start')runId=data.run_id;if(event==='model')modelStarted=true;}}
await new Promise(r=>setTimeout(r,1200));
check('Other session cannot read task',(await fetch(origin+'/api/agent/runs/'+runId,{headers:headers(other)})).status===404);
check('Other session cannot stop task',(await fetch(origin+'/api/agent/cancel',{method:'POST',headers:headers(other),body:JSON.stringify({run_id:runId})})).status===404);
const cancelled=await (await fetch(origin+'/api/agent/cancel',{method:'POST',headers:headers(),body:JSON.stringify({run_id:runId})})).json();check('Actual upstream task cancelled',cancelled.cancelled===true&&cancelled.runtime_reaped===true);
const trace=await (await fetch(origin+'/api/agent/runs/'+runId,{headers:headers()})).json();check('Terminal task status',trace.status==='cancelled'&&trace.model_requests>=1);
await reader.cancel();
check('Private evaluation remains inaccessible',(await fetch(origin+'/api/agent/evals/'+runId,{headers:{Cookie:'nomads-agent-session='+owner}})).status===404);
report.trace=trace;await writeFile('.data/deploy/flash-live-runtime.json',JSON.stringify(report,null,2),{mode:0o600});
if(process.argv.includes('--disconnect')){
 const controller=new AbortController();
 const r=await fetch(origin+'/api/agent/answer',{method:'POST',headers:headers(),body:JSON.stringify({question:'帮我深入比较清迈、槟城、大理一月月住的吃住取舍。'}),signal:controller.signal});
 assert.equal(r.status,200);const reader=r.body.getReader();let partial='',id,model=false;
 while(!id||!model){const next=await reader.read();assert.equal(next.done,false);partial+=decoder.decode(next.value,{stream:true});for(const block of partial.split('\n\n')){const event=block.match(/^event: (.+)$/m)?.[1],line=block.match(/^data: (.+)$/m)?.[1];if(!line)continue;try{const data=JSON.parse(line);if(event==='start')id=data.run_id;if(event==='model')model=true;}catch{}}}
 controller.abort();await reader.cancel().catch(()=>{});
 let stopped;for(let i=0;i<12;i++){await new Promise(r=>setTimeout(r,500));stopped=await (await fetch(origin+'/api/agent/runs/'+id,{headers:headers()})).json();if(!['running','stopping','finalizing'].includes(stopped.status))break;}
 check('Disconnect alone closes the task',stopped.status==='cancelled'&&stopped.runtime_reaped===true);
 report.disconnect_trace=stopped;await writeFile('.data/deploy/flash-live-runtime.json',JSON.stringify(report,null,2),{mode:0o600});
}
