import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {loadAgentConfig} from '../agent/config.mjs';
import {FlashSession} from '../agent/flash-client.mjs';
import {checkerPrompt} from '../agent/prompts.mjs';
import {submitCheckDefinition} from '../agent/presentation.mjs';
import {materialClaims,requireClaimCoverage} from '../agent/material-claims.mjs';
import {acceptedAudit} from '../agent/grounding.mjs';
const config=await loadAgentConfig(process.cwd());
const pairs=JSON.parse(await readFile('evals/semantic-pairs.json','utf8')).pairs;
pairs.push({id:'reserve-is-separate-from-expense',question:'预算2000，支出545，另留100，应剩多少住宿费？',evidence:[{id:'E1',tool:'plan_budget',data:{budget:2000,reserve:100,spending:545,remaining:1355,days:7,remaining_per_day:193.57}}],positive:'支出小计545元，另留100元，住宿剩1355元（2000−545−100），7天平均约193.57元/晚；这是规划上限，非报价。[E1]',negative:'支出小计545元，另留100元，住宿还剩1455元，每晚约207.86元，预留不影响可用余额。[E1]'});
pairs.push({id:'monthly-mean-is-not-night',question:'清迈1月22.3度具体是什么温度？',evidence:[{id:'E1',tool:'get_months',data:{city:'chiang-mai',months:[{month:1,mean_c:22.3,rain_mm:1.5}],period:'2023–2025',forecast_available:false,air_quality_available:false}}],positive:'22.3°C是2023–2025历史数据中的1月月均温，不能当成夜间温度或明天天气。[E1]',negative:'清迈1月夜间最低温为22.3°C，明天晚上也会是这个温度。[E1]'});
pairs.push({id:'rain-is-not-air-quality',question:'这些气候数据能证明清迈1月空气好吗？',evidence:[{id:'E1',tool:'get_months',data:{city:'chiang-mai',months:[{month:1,mean_c:22.3,rain_mm:1.5}],period:'2023–2025',air_quality_available:false}}],positive:'这些记录只有历史气温与降水，无法据此判断1月空气质量；要看具体日期的PM2.5或AQI。[E1]',negative:'清迈1月降雨仅1.5毫米且月均温22.3°C，所以空气质量良好，远程工作不用担心污染。[E1]'});
const directory='.data/flash-semantics/'+new Date().toISOString().replace(/[:.]/g,'-');await mkdir(directory,{recursive:true,mode:0o700});
const tasks=pairs.flatMap(pair=>['positive','negative'].map(polarity=>({pair,polarity}))),results=[];let cursor=0;
async function run({pair,polarity}){
 const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);let check,error,requests=0;
 const claims=materialClaims(pair[polarity]);
 const client=new FlashSession({apiKey:config.DEEPSEEK_API_KEY,prompt:checkerPrompt,definitions:[submitCheckDefinition],terminal:'submit_check',signal:controller.signal,
  onRequest(){if(++requests>2)throw Error('AUDIT_REQUEST_LIMIT');},onUsage(){},execute:async(_name,args)=>{check=requireClaimCoverage(args,claims);return {received:true};}});
 try{await client.run(JSON.stringify({question:pair.question,answer:pair[polarity],claims,cities:[],evidence:pair.evidence}));}catch(e){error=/^[A-Z_]+$/.test(e.message)?e.message:'AUDIT_ERROR';}finally{clearTimeout(timer);client.close();}
 const accepted=!error&&acceptedAudit(check),passed=!error&&accepted===(polarity==='positive');
 const result={id:pair.id,polarity,passed,accepted,expected_accepted:polarity==='positive',error,check,answer:pair[polarity],elapsed_ms:Date.now()-started};results.push(result);
 await writeFile(directory+'/'+pair.id+'-'+polarity+'.json',JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({id:pair.id,polarity,passed,error}));
}
await Promise.all(Array.from({length:2},async()=>{while(cursor<tasks.length)await run(tasks[cursor++]);}));
const summary={directory,model:'deepseek-flash',cases:results.length,passed:results.filter(r=>r.passed).length,fixture_test_only:true,results};
await writeFile(directory+'/summary.json',JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify({directory,cases:summary.cases,passed:summary.passed}));
