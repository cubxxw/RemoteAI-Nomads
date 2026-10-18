import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {ADVISORY_REVIEW_DATE,REVIEWED_ADVISORIES,travelAdvisory,recommendationEligible} from '../public/modules/recommendation-policy.js';
import {KEYS,PRESETS,parseState,rankCities,customScore,DEFAULT_WEIGHTS,stateParams} from '../public/modules/ranking.js';
import {PREFERENCE_KEY,restorePreference,savePreference} from '../public/modules/rank-controls.js';
import {executeNomadTool} from '../src/agent-tools.js';
import {cityAdvisoryMarkup} from '../src/travel-advisory.js';
import {comparisonFit,comparisonBody} from '../src/comparison-page.js';
import worker from '../src/worker.js';
import {publishedFallback} from '../src/published-fallback.js';
import {renderCountryPage} from '../src/content-pages.js';

const catalog=JSON.parse(await readFile(new URL('../public/published-pages/rankings.json',import.meta.url),'utf8'));
const blocked=['kabul','tehran','damascus','tripoli','khartoum','mogadishu','bamako'];
const state=query=>parseState(new URL('https://nomads.test/?'+query));
const onlyCost={safety:0,cost:100,climate:0,life:0,internet:0,community:0};
function environment(){
 const db=new DatabaseSync(new URL('../.data/release/published.sqlite',import.meta.url),{readOnly:true});
 const prepare=(sql,args=[])=>({bind(...values){return prepare(sql,values)},async all(){return {results:db.prepare(sql).all(...args)}},async first(){return db.prepare(sql).get(...args)||null}});
 return {db,env:{DB:{prepare},PREVIEW:'false',SITE_ORIGIN:'https://nomads.test'}};
}

test('reviewed advisories retain official provenance and distinguish publication from review dates',()=>{
 assert.equal(REVIEWED_ADVISORIES.length,7);
 for(const record of REVIEWED_ADVISORIES){
  assert.equal(record.checkedAt,ADVISORY_REVIEW_DATE);
  assert.match(new URL(record.url).hostname,/(?:^|\.)(?:mfa\.gov\.cn|china-embassy\.gov\.cn)$/);
  assert.equal(record.readScope,'opened_official_body');
  assert.ok(record.title&&record.reason);
 }
 assert.equal(travelAdvisory({countryCode:'SO',slug:'mogadishu'}).publishedAt,'2023-08-28');
 assert.equal(travelAdvisory({countryCode:'SD',slug:'khartoum'}).publishedAt,null);
});

test('regional alerts do not become nationwide exclusions or a safety guarantee for other areas',()=>{
 for(const c of [{countryCode:'LY',slug:'benghazi'},{countryCode:'LY',slug:'misrata'},{countryCode:'SD',slug:'port-sudan'}])assert.equal(travelAdvisory(c),null);
 assert.ok(travelAdvisory({country_id:'LY',slug:'tripoli'}));
 assert.ok(travelAdvisory({country_id:'SD',slug:'khartoum'}));
 assert.equal(recommendationEligible({...catalog.find(c=>c.slug==='paris'),scores:{safety:1}}),true);
});

test('all reviewed exclusions apply before every preset, month, incomplete switch and 100 percent cost',()=>{
 for(const weights of [...Object.values(PRESETS).map(p=>p.weights),onlyCost]){
  for(const month of [null,...Array.from({length:12},(_,i)=>i+1)]){
   for(const incomplete of [false,true]){
    const ranked=rankCities(catalog,{...state('abroad=1'),weights,month,incomplete});
    assert.ok(ranked.every(c=>!blocked.includes(c.slug)),JSON.stringify({weights,month,incomplete}));
   }
  }
 }
 const fabricated={...catalog.find(c=>c.slug==='kabul'),budget:1,baseScore:10.5,scores:Object.fromEntries(KEYS.map(key=>[key,10]))};
 assert.equal(rankCities([fabricated],{...state(''),weights:onlyCost,incomplete:true}).length,0);
});

test('catalog and original scores survive exclusions, with coverage distinct from recommendation counts',()=>{
 const before=structuredClone(catalog);
 const complete=catalog.filter(c=>KEYS.every(key=>Number.isFinite(c.scores[key])));
 assert.equal(complete.length,224);
 assert.equal(catalog.length,350);
 assert.equal(rankCities(catalog,state('')).length,223);
 for(const slug of blocked)assert.ok(catalog.find(c=>c.slug===slug));
 const kabul=catalog.find(c=>c.slug==='kabul');
 assert.equal(customScore(kabul,DEFAULT_WEIGHTS),kabul.baseScore);
 assert.deepEqual(catalog,before);
});

test('all three published 80 percent presets migrate in old links and local storage',()=>{
 for(const [query,key] of [['5,80,5,5,4,1','budget'],['5,5,4,5,80,1','internet'],['80,5,5,5,4,1','safe']]){
  const old='w='+query+'&abroad=1&month=1';
  const parsed=state(old);assert.deepEqual(parsed.weights,PRESETS[key].weights);
  let item=JSON.stringify({version:1,query:old});
  const local={getItem(){return item},setItem(k,v){assert.equal(k,PREFERENCE_KEY);item=v},removeItem(){item=null}};
  const restored=restorePreference(new URL('https://nomads.test/'),local);
  assert.deepEqual(restored.weights,PRESETS[key].weights);
  savePreference(restored,local);
  assert.equal(JSON.parse(item).query,stateParams(parsed).toString());
  assert.ok(!JSON.parse(item).query.includes('80'));
 }
 assert.equal(state('w=0,100,0,0,0,0').weights.cost,100);
 assert.equal(state('w=10,80,4,3,2,1').weights.cost,80);
});

test('city archive and comparison expose the official reason without selling low cost as suitability',()=>{
 const kabul=catalog.find(c=>c.slug==='kabul'),other=catalog.find(c=>c.slug==='ubud');
 const markup=cityAdvisoryMarkup(kabul);
 assert.match(markup,/暂不作为出发推荐/);assert.match(markup,/t20260126_11845066/);
 assert.match(markup,/发布 2026-01-26/);assert.match(markup,/核读 2026-10-18/);
 assert.equal(cityAdvisoryMarkup(other),'');
 assert.match(comparisonFit(kabul,other),/暂不作为出发推荐/);
 assert.match(comparisonBody(kabul,other,10),/t20260126_11845066/);
});

test('AI tools return the exclusion reason, preserve direct lookup and separate historical coverage',async()=>{
 const {db,env}=environment();
 try{
  const found=await executeNomadTool(env,'search_cities',{query:'kabul',preset:'budget'});
  assert.equal(found.data.matched,0);assert.equal(found.cities.length,0);
  assert.equal(found.data.excluded_for_travel_advisory[0].slug,'kabul');
  assert.match(found.data.excluded_for_travel_advisory[0].advisory.url,/mfa.gov.cn/);
  const direct=await executeNomadTool(env,'get_city',{city:'kabul',include_legacy:true});
  assert.equal(direct.data.slug,'kabul');assert.equal(direct.data.recommendation.eligible,false);
  assert.match(direct.warnings.join(' '),/暂勿前往/);
  const coverage=await executeNomadTool(env,'get_coverage',{});
  assert.equal(coverage.data.complete_scores,224);
  assert.equal(coverage.data.recommendable_complete_scores,223);
  assert.equal(coverage.data.excluded_for_travel_advisory,7);
  const method=await executeNomadTool(env,'get_method',{});
  assert.equal(method.data.preset_weights.budget.cost,50);
  assert.equal(method.data.recommendation_rule.before_scoring,true);
 }finally{db.close()}
});

test('database outage preserves the same exclusion and old preset migration on both ranking routes',async()=>{
 const env={PREVIEW:'false',SITE_ORIGIN:'https://nomads.test',ASSETS:{async fetch(request){return new URL(request.url).pathname.endsWith('manifest.json')?Response.json({version:1,paths:['/','/cities/']}):Response.json(catalog)}}};
 for(const path of ['/','/cities/'])for(const query of ['w=0,100,0,0,0,0&incomplete=1&limit=360','w=5,80,5,5,4,1&abroad=1&limit=360']){
  const url=new URL('https://nomads.test'+path+'?'+query);
  const response=await publishedFallback(new Request(url),env);
  assert.equal(response.status,200);assert.equal(response.headers.get('X-Data-Mode'),'published-snapshot');
  const html=await response.text(),slugs=[...html.matchAll(/<article class="ranking-row" data-city="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(slugs,rankCities(catalog,parseState(url)).map(c=>c.slug));
  assert.ok(slugs.every(slug=>!blocked.includes(slug)));
 }
});

test('public server rendering excludes high risk cities before hydration even without a seasonal parameter',async()=>{
 const {db,env}=environment();
 try{
  for(const query of ['w=0,100,0,0,0,0&incomplete=1&limit=360','w=5,80,5,5,4,1&abroad=1&month=1&limit=360']){
   const response=await worker.fetch(new Request('https://nomads.test/?'+query),env,{});
   assert.equal(response.status,200);const html=await response.text();
   assert.match(html,/rank-city-link/);
   for(const slug of blocked)assert.ok(!html.includes('class="rank-city-link" href="/cities/'+slug+'/"'));
  }
 }finally{db.close()}
});

test('country archives link to the official alert rather than advertising a blocked city as a starting point',()=>{
 const c={country_id:'AF',slug:'kabul',name_zh:'喀布尔',name_en:'Kabul',summary:'便宜的旅居起点',budget_amount:450};
 const page=renderCountryPage({id:'AF',name_zh:'阿富汗',name_en:'Afghanistan',region:'亚洲'},[c],[],[],[],()=>'',()=> '');
 assert.match(page.body,/历史城市资料/);assert.match(page.body,/暂不作为出发推荐/);
 assert.match(page.body,/t20260126_11845066/);assert.ok(!page.body.includes('便宜的旅居起点'));
 assert.ok(!page.body.includes('从这座城市开始'));
});
