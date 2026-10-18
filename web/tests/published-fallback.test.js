import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publishedFallback} from '../src/published-fallback.js';
import {parseState,rankCities,stateParams} from '../public/modules/ranking.js';
import {UI_PRESETS} from '../public/modules/rank-controls.js';
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
test('all five seasonal links have the correct first paint, controls and noindex even when D1 is unavailable',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../public/published-pages/rankings.json',import.meta.url),'utf8'));
 const env={PREVIEW:'false',SITE_ORIGIN:'https://nomads.example',ASSETS:{async fetch(request){
  return new URL(request.url).pathname.endsWith('manifest.json')?Response.json({version:1,snapshot_date:'2026-10-18',paths:['/','/cities/']}):Response.json(catalog);
 }}};
 for(const key of ['default','budget','internet','visa','safe']){
  const preset=UI_PRESETS[key],state={...parseState(new URL('https://nomads.example/?month=10&season=2026-10')),...preset};
  const query=stateParams(state).toString(),expected=rankCities(catalog,state).slice(0,5).map(c=>c.slug);
  for(const path of ['/','/cities/']){
   const response=await publishedFallback(new Request('https://nomads.example'+path+'?'+query),env);
   assert.equal(response.status,200);assert.equal(response.headers.get('X-Data-Mode'),'published-snapshot');
   const body=await response.text(),rendered=[...body.matchAll(/<article class="ranking-row" data-city="([^"]+)"/g)].slice(0,5).map(m=>m[1]);
   assert.deepEqual(rendered,expected,key+' SSR');
   assert.match(body,new RegExp('data-preset="'+key+'" class="preset-chip selected" aria-pressed="true"'));
   assert.match(body,/data-remove-filter="season"/);assert.match(body,/content="noindex,follow"/);
   assert.doesNotMatch(body,/<p class="rank-season-note" id="rank-season-note" hidden/);
   assert.equal(body.includes('<small>自定义分</small>'),!['default','visa'].includes(key));
  }
 }
 const root=await publishedFallback(new Request('https://nomads.example/'),env),body=await root.text();
 assert.match(body,/content="index,follow"/);assert.match(body,/<p class="rank-season-note" id="rank-season-note" hidden/);
 const head=await publishedFallback(new Request('https://nomads.example/?month=10&season=2026-10',{method:'HEAD'}),env);assert.equal(await head.text(),'');
});
test('two published cities can still be compared for the requested month without indexing unreviewed combinations',async()=>{
 const city=slug=>({slug,name:slug,nameEn:slug,country:'Test',budget:1000,scores:{safety:8,cost:7,climate:6,life:7,internet:8,community:2},visa:{label:'需复核'},months:Array.from({length:12},(_,i)=>({month:i+1,meanC:20+i,rainMm:10,status:'recommended'}))});
 const env={PREVIEW:'false',SITE_ORIGIN:'https://nomads.example',ASSETS:{async fetch(r){return new URL(r.url).pathname.endsWith('manifest.json')?Response.json({version:1,paths:[],snapshot_date:'2026-10-18'}):Response.json([city('a-city'),city('b-city')]);}}};
 const r=await publishedFallback(new Request('https://nomads.example/compare/a-city-vs-b-city/?month=2'),env);assert.equal(r.status,200);const body=await r.text();assert.match(body,/2 月气候/);assert.match(body,/21°C/);assert.match(body,/noindex,follow/);assert.match(body,/companion-launcher/);
 const reverse=await publishedFallback(new Request('https://nomads.example/compare/b-city-vs-a-city/?month=2'),env);assert.equal(reverse.status,308);assert.equal(reverse.headers.get('Location'),'https://nomads.example/compare/a-city-vs-b-city/?month=2');
 assert.equal(await publishedFallback(new Request('https://nomads.example/compare/a-city-vs-unknown/'),env),null);
});
test('domestic and month shortcuts render the same scoped rows before JavaScript during an outage',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../public/published-pages/rankings.json',import.meta.url),'utf8'));
 const url=new URL('https://nomads.example/?country=CN&month=10');
 const env={PREVIEW:'false',SITE_ORIGIN:url.origin,ASSETS:{async fetch(request){return new URL(request.url).pathname.endsWith('manifest.json')?Response.json({version:1,paths:['/']}):Response.json(catalog);}}};
 const response=await publishedFallback(new Request(url),env),body=await response.text();
 const slugs=[...body.matchAll(/<article class="ranking-row" data-city="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(slugs,rankCities(catalog,parseState(url)).slice(0,40).map(city=>city.slug));
 assert.ok(slugs.length>0&&slugs.every(slug=>catalog.find(city=>city.slug===slug).countryCode==='CN'));
 assert.match(body,/data-quick-filter="domestic" aria-pressed="true"/);
 assert.match(body,/class="rank-country-link" href="\/countries\/cn\/"/);
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
