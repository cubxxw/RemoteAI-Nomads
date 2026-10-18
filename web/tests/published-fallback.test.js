import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedFallback} from '../src/published-fallback.js';
import worker from '../src/worker.js';
const html='<!doctype html><head><meta name="robots" content="index,follow"><link rel="canonical" href="https://nomads.example/cities/penang/"></head><main>公开城市资料</main>';
function environment(){
 const paths=[];
 return {paths,env:{PREVIEW:'false',ASSETS:{async fetch(request){const p=new URL(request.url).pathname;paths.push(p);if(p==='/published-pages/manifest.json')return Response.json({version:1,snapshot_date:'2026-10-18',paths:['/cities/penang/','/api/rankings']});if(p==='/published-pages/rankings.json')return Response.json([{slug:'penang'}]);return new Response(html,{headers:{'Content-Type':'text/html','X-Robots-Tag':'noindex, nofollow'}});}}}};
}
test('outage fallback serves only an exact pre-published path, with public security and canonical semantics',async()=>{
 const {env,paths}=environment(),response=await publishedFallback(new Request('https://nomads.example/cities/penang/'),env);
 assert.equal(response.status,200);assert.equal(response.headers.get('X-Data-Mode'),'published-snapshot');assert.equal(response.headers.get('X-Data-Snapshot'),'2026-10-18');assert.equal(response.headers.get('X-Robots-Tag'),null);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
 assert.match(await response.text(),/canonical/);assert.deepEqual(paths,['/published-pages/manifest.json','/published-pages/cities/penang/']);
 assert.equal(await publishedFallback(new Request('https://nomads.example/cities/unpublished/'),env),null);
 assert.equal(await publishedFallback(new Request('https://nomads.example/api/agent/status'),env),null);
 assert.equal(await publishedFallback(new Request('https://nomads.example/cities/penang/'),{...env,PREVIEW:'true'}),null);
});
test('shared filtered views remain noindex, HEAD is empty, and rankings stay JSON',async()=>{
 const {env}=environment();const filtered=await publishedFallback(new Request('https://nomads.example/cities/penang/?month=1'),env);
 assert.match(await filtered.text(),/content="noindex,follow"/);
 assert.equal(await (await publishedFallback(new Request('https://nomads.example/cities/penang/',{method:'HEAD'}),env)).text(),'');
 assert.deepEqual(await (await publishedFallback(new Request('https://nomads.example/api/rankings'),env)).json(),[{slug:'penang'}]);
});
test('missing or malformed fallback assets never pretend the live database worked',async()=>{
 const request=new Request('https://nomads.example/cities/penang/');
 for(const response of [new Response('missing',{status:404}),Response.json({version:9,paths:['/cities/penang/']}),new Response('damaged')]){
  assert.equal(await publishedFallback(request,{PREVIEW:'false',ASSETS:{async fetch(){return response.clone();}}}),null);
 }
});
test('two published cities can still be compared for the requested month without indexing unreviewed combinations',async()=>{
 const city=slug=>({slug,name:slug,nameEn:slug,country:'Test',budget:1000,scores:{safety:8,cost:7,climate:6,life:7,internet:8,community:2},visa:{label:'需复核'},months:Array.from({length:12},(_,i)=>({month:i+1,meanC:20+i,rainMm:10,status:'recommended'}))});
 const env={PREVIEW:'false',SITE_ORIGIN:'https://nomads.example',ASSETS:{async fetch(r){return new URL(r.url).pathname.endsWith('manifest.json')?Response.json({version:1,paths:[],snapshot_date:'2026-10-18'}):Response.json([city('a-city'),city('b-city')]);}}};
 const r=await publishedFallback(new Request('https://nomads.example/compare/a-city-vs-b-city/?month=2'),env);assert.equal(r.status,200);const body=await r.text();assert.match(body,/2 月气候/);assert.match(body,/21°C/);assert.match(body,/noindex,follow/);assert.match(body,/companion-launcher/);
 const reverse=await publishedFallback(new Request('https://nomads.example/compare/b-city-vs-a-city/?month=2'),env);assert.equal(reverse.status,308);assert.equal(reverse.headers.get('Location'),'https://nomads.example/compare/a-city-vs-b-city/?month=2');
 assert.equal(await publishedFallback(new Request('https://nomads.example/compare/a-city-vs-unknown/'),env),null);
});
test('worker keeps public browsing available during D1 outage and reports database health honestly',async()=>{
 const {env}=environment(),before=globalThis.caches;let reads=0;
 const production={...env,SITE_ORIGIN:'https://nomads.example',RELEASE_ID:'outage-integration',DB:{prepare(){reads++;throw Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");}}};
 globalThis.caches={default:{async match(){return null;},async put(){}}};
 try{
  const page=await worker.fetch(new Request('https://nomads.example/cities/penang/'),production,{waitUntil(){}});assert.equal(page.status,200);assert.equal(page.headers.get('X-Data-Mode'),'published-snapshot');assert.equal(reads,1);
  const again=await worker.fetch(new Request('https://nomads.example/cities/penang/'),production,{waitUntil(){}});assert.equal(again.status,200);assert.equal(reads,1);
  const health=await worker.fetch(new Request('https://nomads.example/healthz'),production,{waitUntil(){}});assert.equal(health.status,503);assert.equal((await health.json()).ok,false);
 }finally{if(before===undefined)delete globalThis.caches;else globalThis.caches=before;}
});
