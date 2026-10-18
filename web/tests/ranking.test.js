import test from 'node:test';import assert from 'node:assert/strict';
import {packRankingData,unpackRankingData,KEYS,DEFAULT_WEIGHTS,validWeights,customScore,referenceCostScore,rankCities,parseState,stateParams,renderRow} from '../public/modules/ranking.js';
const city=(id,metrics={})=>({slug:id,name:id,nameEn:id,country:'Thailand',countryCode:'TH',region:'亚洲',budget:1000,budgetBasis:'estimate',why:'A city',photo:null,baseScore:8.6,scores:{safety:9,cost:9,climate:4,life:9,internet:10,community:10,...metrics},visa:{code:'visa_free',label:'免签',detail:'legacy'},months:Array.from({length:12},(_,i)=>({month:i+1,status:i===0?'recommended':'unknown',meanC:22}))});
test('default calculation preserves original Metric Score exactly',()=>{assert.equal(customScore(city('a'),DEFAULT_WEIGHTS),8.6);});
test('custom score reflects weighted values, never original order',()=>{const a={...city('a',{cost:10}),budget:2400},b={...city('b',{cost:1}),budget:300};const s=parseState(new URL('http://test/'));s.weights={safety:0,cost:100,climate:0,life:0,internet:0,community:0};assert.deepEqual(rankCities([a,b],s).map(c=>c.slug),['b','a']);assert.equal(customScore(b,s.weights),10.5);});
test('missing required metric excludes city instead of making it zero',()=>{const c=city('missing',{safety:null});assert.equal(customScore(c,DEFAULT_WEIGHTS),null);const s=parseState(new URL('http://test/'));assert.equal(rankCities([c],s).length,0);s.incomplete=true;assert.equal(rankCities([c],s)[0].score,null);});
test('zero-weight metric can be missing; community 0 is valid',()=>{const c=city('quiet',{climate:null,community:0});assert.ok(customScore(c,{...DEFAULT_WEIGHTS,climate:0})>0);});
test('visa never changes score but filters the result',()=>{const a=city('a'),b={...city('b'),visa:{code:'visa_required',label:'需签证'}};assert.equal(customScore(a,DEFAULT_WEIGHTS),customScore(b,DEFAULT_WEIGHTS));const s=parseState(new URL('http://test/?visa=visa_free'));assert.equal(rankCities([a,b],s).length,1);});
test('URL roundtrip preserves six weights, filters, warm condition and limit',()=>{const url=new URL('http://test/?w=65,10,10,10,5,5&region=亚洲&budget=1500&month=1&visa=visa_free&warm=1&q=清迈&limit=80&incomplete=1');const a=parseState(url),b=parseState(new URL('http://test/?'+stateParams(a)));assert.deepEqual(a,b);});
test('bad URL values are bounded and all-zero weights restore defaults',()=>{const s=parseState(new URL('http://test/?w=-1,Infinity,1000,nope,0,0&month=45&budget=-1&limit=10000'));assert.equal(s.weights.safety,0);assert.equal(s.weights.climate,100);assert.equal(s.month,null);assert.equal(s.budget,null);assert.equal(s.limit,40);assert.deepEqual(validWeights(Object.fromEntries(KEYS.map(k=>[k,0]))),DEFAULT_WEIGHTS);});
test('winter excludes unknown or cold weather instead of guessing warmth',()=>{const s=parseState(new URL('http://test/?month=1&warm=1'));const a=city('warm'),b=city('cold'),c=city('missing');b.months[0].meanC=5;c.months[0].meanC=null;assert.deepEqual(rankCities([a,b,c],s).map(c=>c.slug),['warm']);});
test('budget does not admit missing values and ties are deterministic',()=>{const s=parseState(new URL('http://test/?budget=1000'));const a=city('a'),b=city('b'),c={...city('c'),budget:null};assert.deepEqual(rankCities([b,c,a],s).map(c=>c.slug),['a','b']);});
test('imported city strings are escaped and flags are semantic',()=>{const s=parseState(new URL('http://test/')),c={...city('x'),name:'<img onerror="alert(1)">'};const html=renderRow({...c,rank:1,score:8.6},s);assert.ok(!html.includes('<img onerror'));assert.match(html,/role="img" aria-label="Thailand旗帜"/);});
test('multi-word search normalizes the query without requiring mutation of the input value',()=>{const s=parseState(new URL('http://test/'));s.q=' New York ';assert.equal(rankCities([city('New York'),city('York')],s).length,1);assert.equal(s.q,' New York ');});

test('compact month transport retains unknowns, zero temperatures and precipitation',()=>{const c=city('a');c.months=c.months.map((m,i)=>({...m,meanC:i===0?0:null,highC:20,rainMm:0}));assert.deepEqual(unpackRankingData(packRankingData([c])),[c]);});

test('the dated departure view excludes reviewed travel concerns without changing source scores',()=>{
 const ordinary=city('base'),japan={...city('fukuoka'),countryCode:'JP'},taipei={...city('taipei'),visa:{code:'unavailable',label:'条件待核'}},visaRequired={...city('munich'),countryCode:'DE',visa:{code:'visa_required',label:'需签证'}};
 const data=[ordinary,japan,taipei,visaRequired];for(const item of data)item.months[9].status='recommended';
 const raw=JSON.parse(JSON.stringify(data));
 const regular=parseState(new URL('https://nomads.test/?month=10'));assert.equal(rankCities(data,regular).length,4);
 const selected=parseState(new URL('https://nomads.test/?month=10&season=2026-10'));
 assert.deepEqual(rankCities(data,selected).map(c=>c.slug),['base','munich']);
 assert.deepEqual(data,raw);assert.equal(customScore(japan,DEFAULT_WEIGHTS),8.6);
 assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(selected))),selected);
});
test('dated advice cannot silently apply to another month or an unreviewed period',()=>{
 for(const url of ['?month=11&season=2026-10','?season=2026-10','?month=10&season=2026-11']) {
  const state=parseState(new URL('https://nomads.test/'+url));assert.equal(state.season,'');assert.equal(stateParams(state).has('season'),false);
 }
});

test('personalized cost follows the reference amount continuously and missing amounts remain unknown',()=>{
 assert.equal(referenceCostScore(300),10);assert.equal(referenceCostScore(600),7.5);assert.equal(referenceCostScore(1200),5);
 for(const value of [null,undefined,0,-10,NaN,Infinity,'450'])assert.equal(referenceCostScore(value),null);
 const weights={safety:5,cost:80,climate:5,life:5,internet:4,community:1};
 const cheap={...city('cheap',{safety:5,cost:8,climate:5,life:5,internet:5,community:5}),budget:450};
 const expensive={...city('expensive',{safety:10,cost:10,climate:10,life:10,internet:10,community:10}),budget:1500};
 assert.ok(customScore(cheap,weights)>customScore(expensive,weights));
 assert.equal(customScore({...cheap,budget:null},weights),null);
 assert.equal(customScore({...cheap,budget:null},DEFAULT_WEIGHTS),cheap.baseScore);
});
test('rounding for display never falls back to the old Metric Score to order different custom values',()=>{
 const weights={safety:0,cost:100,climate:0,life:0,internet:0,community:0};
 const cheap={...city('cheap'),budget:700,baseScore:1},dearer={...city('dearer'),budget:705,baseScore:10};
 assert.equal(customScore(cheap,weights),customScore(dearer,weights));
 const state={...parseState(new URL('https://nomads.test/')),weights};
 assert.equal(rankCities([dearer,cheap],state)[0].slug,'cheap');
});
test('domestic scope uses country identity and survives a shared URL',()=>{
 const china={...city('xiamen'),countryCode:'CN',country:'中国'},foreign={...city('china-town'),name:'中国城',countryCode:'TH'};
 const state=parseState(new URL('https://nomads.test/?country=cn&month=1'));
 assert.equal(state.country,'CN');assert.deepEqual(rankCities([foreign,china],state).map(c=>c.slug),['xiamen']);
 assert.equal(stateParams(state).get('country'),'CN');
 assert.equal(parseState(new URL('https://nomads.test/?country=<script>')).country,'');
 const html=renderRow({...china,rank:1,score:8.6},state);
 assert.match(html,/class="rank-country-link" href="\/countries\/cn\/"/);
 assert.match(html,/class="rank-city-link" href="\/cities\/xiamen\/"/);
});
test('abroad excludes mainland and Hong Kong, Macao and Taiwan entries without losing the selected region',()=>{
 const catalog=['CN','HK','MO','TW','JP','TH','DE'].map(code=>({...city(code),countryCode:code,region:code==='DE'?'欧洲':'亚洲'}));
 const state=parseState(new URL('https://nomads.test/?abroad=1&region=亚洲'));
 assert.deepEqual(rankCities(catalog,state).map(c=>c.countryCode),['JP','TH']);
 assert.equal(stateParams(state).get('abroad'),'1');
});

test('stable preset links resolve shared weights and conditions while explicit filters override defaults',()=>{
 const budget=parseState(new URL('https://nomads.test/?preset=budget'));assert.equal(budget.weights.cost,50);assert.equal(budget.weights.safety,25);
 const visa=parseState(new URL('https://nomads.test/?preset=visa'));assert.equal(visa.visa,'visa_free');
 const winter=parseState(new URL('https://nomads.test/?preset=winter'));assert.equal(winter.month,1);assert.equal(winter.warm,true);
 const override=parseState(new URL('https://nomads.test/?preset=winter&month=2&warm=0&w=0,100,0,0,0,0'));assert.equal(override.month,2);assert.equal(override.warm,false);assert.equal(override.weights.cost,100);
 assert.equal(parseState(new URL('https://nomads.test/?preset=visa&visa=')).visa,'');
 for(const key of ['unknown','constructor','__proto__'])assert.deepEqual(parseState(new URL('https://nomads.test/?preset='+key)).weights,DEFAULT_WEIGHTS);
});
