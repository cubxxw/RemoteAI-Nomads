import http from 'node:http';import path from 'node:path';import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';import {randomBytes} from 'node:crypto';
import {DeepSeekHarness} from '@deepseek-ai/dsh-sdk-client';
import {submitCheckDefinition} from '../agent/presentation.mjs';
import {validateArgs} from '../src/agent-tools.js';
import {compactProof,acceptedAudit} from '../agent/grounding.mjs';
const root=process.cwd(),round=new Date().toISOString().replace(/[:.]/g,'-'),directory=path.join(root,'.data/negative-audits',round);await mkdir(directory,{recursive:true,mode:0o700});
const config=Object.fromEntries((await readFile('.dev.vars','utf8')).split('\n').filter(l=>/^[A-Z][A-Z0-9_]*=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim()]}));
const prompt=await readFile('agent/checker-prompt.txt','utf8'),active=new Map();
const server=http.createServer(async(req,res)=>{try{const token=(req.headers.authorization||'').replace('Bearer ',''),state=active.get(token);if(!state){res.writeHead(403);return res.end();}let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);if(req.url==='/tool'){if(body.name!=='submit_check'||!validateArgs(body.args,submitCheckDefinition.parameters))throw Error('INVALID_AUDIT');state.result=body.args;}if(req.url==='/reserve'&&++state.requests>5)throw Error('LIMIT');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({received:true}));}catch{res.writeHead(500);res.end('{}')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const summaries=[];
const ids=process.argv.slice(2).map(Number).filter(Number.isFinite);
try{for(const id of ids.length?ids:[1,10,30]){
 const source=JSON.parse(await readFile(`.data/secretary-evals/2026-10-18T01-33-58-272Z/${String(id).padStart(2,'0')}.json`,'utf8'));
 const token=randomBytes(24).toString('hex'),state={requests:0},session=path.join(directory,'session-'+id);active.set(token,state);await mkdir(session,{mode:0o700});
 const patches=[...['persistent-bash','persistent-pwsh','tool-working-directory','llm-retry','session-title'].map(id=>({id,disabled:true})),{id:'sandbox-policy',name:'@deepseek-ai/dsh-sandbox-policy',config:{mode:'read-only',workspaceRoot:session}},{id:'tools',name:'@deepseek-ai/dsh-tools',config:{mode:'native'}},{insert:[{id:'audit-submit',name:path.join(root,'agent/nomad-plugin.mjs'),inject:['tools','llm'],config:{definitions:[submitCheckDefinition],bridgeUrl:'http://127.0.0.1:'+server.address().port,token,expiresAt:Date.now()+120000}}]}];
 const patch=path.join(session,'patch.json');await writeFile(patch,JSON.stringify(patches),{mode:0o600});
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));Object.assign(env,{DEEPSEEK_API_KEY:config.DEEPSEEK_API_KEY,DSH_SYSTEM_PROMPT:prompt,NODE_USE_ENV_PROXY:'1',NO_PROXY:'127.0.0.1,localhost,::1',no_proxy:'127.0.0.1,localhost,::1'});
 const h=new DeepSeekHarness({profile:'sdk-minimal',patches:[patch],dshHome:path.join(session,'home'),processCwd:session,cwd:session,env,provider:'deepseek-official',model:'deepseek-v4-pro',reasoningEffort:process.env.AUDIT_EFFORT||'low',maxTokens:16384,requestTimeoutMs:120000,initializeTimeoutMs:20000});
 let error;
 try{const evidence=compactProof({evidence:new Map(source.trace.evidence.map(({id,...e})=>[id,e]))});const reply=await h.run(JSON.stringify({question:source.question,answer:source.answer.answer,cities:source.answer.cities,evidence}));if(!state.result)try{state.result=JSON.parse(reply.finalResponse.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{error='NO_AUDIT_SUBMISSION';}}catch(e){error=e.message;}
 finally{await h.close();await rm(session,{recursive:true,force:true});active.delete(token);}
 const result={id,passed:!error&&!!state.result&&!acceptedAudit(state.result),result:state.result,error,requests:state.requests};await writeFile(path.join(directory,id+'.json'),JSON.stringify(result,null,2),{mode:0o600});summaries.push({id,passed:result.passed,issues:result.result?.issues});console.log(JSON.stringify(summaries.at(-1)));
}
await writeFile(path.join(directory,'summary.json'),JSON.stringify({directory,cases:summaries.length,passed:summaries.filter(x=>x.passed).length,results:summaries},null,2));}
finally{server.close();}
