import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {rankingPageFromData} from '../src/rank-pages.js';
import {shell} from '../src/render.js';

const startupPath=new URL('../public/ranking-startup.js',import.meta.url);
async function startupFixture({records={},search='',compact=false,denied=false}={}){
  const dataset={},storage=new Map(Object.entries(records)),events=new Map(),timers=[],status={hidden:false,textContent:'正在恢复选城偏好…'};
  const context={document:{documentElement:{dataset},currentScript:{dataset:{compact:String(compact)}},querySelector:selector=>selector==='[data-ranking-readiness]'?status:null},location:{search},localStorage:{getItem(key){if(denied)throw new Error('unavailable');return storage.get(key)??null;}},addEventListener:(name,listener)=>events.set(name,listener),setTimeout:(callback,delay)=>timers.push({callback,delay})};
  vm.runInNewContext(await readFile(startupPath,'utf8'),context);
  return {dataset,events,timers,status};
}
const startup=async options=>(await startupFixture(options)).dataset;
const preference=query=>JSON.stringify({version:1,query});

test('startup preserves the introduction on a first visit',async()=>{
  assert.deepEqual(await startup(),{rankingIntro:'expanded',rankingLayout:'cards'});
});
test('saved filters choose the compact heading before any ranking markup can paint',async()=>{
  assert.deepEqual(await startup({records:{'nomads-ranking-view-v1':preference('abroad=1&month=10&season=2026-10'),'nomads-ranking-layout-v1':'list'}}),{rankingIntro:'compact',rankingLayout:'list',rankingRestoring:'true'});
});
test('explicit URL keeps its server results visible and takes precedence over saved filters',async()=>{
  assert.deepEqual(await startup({search:'?country=CN',compact:true,records:{'nomads-ranking-view-v1':preference('country=JP')}}),{rankingIntro:'compact',rankingLayout:'cards'});
});
test('returning without filters keeps the compact heading without hiding usable server results',async()=>{
  assert.deepEqual(await startup({records:{'nomads-ranking-visited-v1':'true'}}),{rankingIntro:'compact',rankingLayout:'cards'});
});
test('journey month restoration also prevents default-city flashes',async()=>{
  const result=await startup({records:{'nomads-trip-month-v1':'11'}});
  assert.equal(result.rankingIntro,'compact');assert.equal(result.rankingRestoring,'true');
});
test('blocked or corrupt storage falls back to the public first-visit view',async()=>{
  assert.deepEqual(await startup({denied:true}),{rankingIntro:'expanded',rankingLayout:'cards'});
  assert.deepEqual(await startup({records:{'nomads-ranking-view-v1':'{bad','nomads-ranking-layout-v1':'unknown','nomads-trip-month-v1':'13'}}),{rankingIntro:'expanded',rankingLayout:'cards'});
});
test('ranking includes a blocking same-origin startup before its markup and named display buttons',()=>{
  const page=rankingPageFromData([],new URL('https://nomads.test/'));
  const html=shell({...page,env:{SITE_ORIGIN:'https://roamorrow.com/nomads'}});
  const script=html.match(/<script src="\/nomads\/ranking-startup\.js"[^>]*><\/script>/)?.[0];
  assert.ok(script);assert.doesNotMatch(script,/\b(?:async|defer|type)\b/);
  assert.ok(html.indexOf(script)<html.indexOf('id="ranking-root"'));
  assert.match(html,/href="\/nomads\/ranking-presentation\.css"/);
  for(const layout of ['cards','list'])assert.match(html,new RegExp('data-ranking-layout="'+layout+'"[^>]*aria-pressed="(?:true|false)"'));
});

test('an entry-module fetch failure reveals the public fallback independently of app.js',async()=>{
  const h=await startupFixture({records:{'nomads-ranking-view-v1':preference('country=CN')}});
  assert.equal(typeof h.events.get('error'),'function','startup must own recovery outside the app dependency graph');
  h.events.get('error')({target:{tagName:'SCRIPT',getAttribute:()=>'/nomads/app.js'}});
  assert.equal(h.dataset.rankingRestoring,undefined);
  assert.match(h.status.textContent,/默认排行|公共排行/);
});
test('a stalled entry module cannot mask public city links indefinitely',async()=>{
  const h=await startupFixture({records:{'nomads-trip-month-v1':'10'}});
  assert.equal(h.timers.length,1);
  assert.ok(h.timers[0].delay<=10000);
  h.timers[0].callback();
  assert.equal(h.dataset.rankingRestoring,undefined);
  assert.match(h.status.textContent,/刷新/);
});
test('the independent watchdog leaves a successfully restored ranking alone',async()=>{
  const h=await startupFixture({records:{'nomads-trip-month-v1':'10'}});
  assert.equal(h.timers.length,1);
  delete h.dataset.rankingRestoring;h.status.hidden=true;h.status.textContent='ready';
  h.timers[0].callback();assert.equal(h.status.hidden,true);assert.equal(h.status.textContent,'ready');
});
