import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, stateParams, DEFAULT_WEIGHTS } from '../public/modules/ranking.js';
import { UI_PRESETS, PREFERENCE_KEY, restorePreference, savePreference, activeFilters, viewLabel, commandItems, applyRankingFilter, quickFilters, toggleQuickFilter, additionalFilters } from '../public/modules/rank-controls.js';

const storage = () => {
  const values = new Map();
  return {getItem:key => values.get(key) ?? null,setItem:(key,value) => values.set(key,value),removeItem:key => values.delete(key)};
};
test('a shared URL overrides every saved local preference', () => {
  const local = storage(), saved = parseState(new URL('https://nomads.test/?region=亚洲&budget=1500&month=1'));
  savePreference(saved,local);
  assert.deepEqual(restorePreference(new URL('https://nomads.test/?region=欧洲'),local),parseState(new URL('https://nomads.test/?region=欧洲')));
  assert.deepEqual(restorePreference(new URL('https://nomads.test/?utm_source=friend'),local),parseState(new URL('https://nomads.test/')));
});
test('returning without an explicit URL restores preferences, but not pagination', () => {
  const local = storage(), state = parseState(new URL('https://nomads.test/?region=亚洲&month=1&limit=120&w=20,55,10,10,5,5'));
  assert.equal(savePreference(state,local),true);
  const restored = restorePreference(new URL('https://nomads.test/'),local);
  assert.equal(restored.region,'亚洲');assert.equal(restored.month,1);assert.equal(restored.limit,40);assert.equal(restored.weights.cost,55);
});
test('resetting to the default state removes the saved preference', () => {
  const local = storage();savePreference(parseState(new URL('https://nomads.test/?q=京都')),local);
  assert.ok(local.getItem(PREFERENCE_KEY));savePreference(parseState(new URL('https://nomads.test/')),local);assert.equal(local.getItem(PREFERENCE_KEY),null);
});
test('unavailable or corrupted browser storage cannot stop ranking', () => {
  const url = new URL('https://nomads.test/'), denied = { getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');} };
  assert.deepEqual(restorePreference(url,denied),parseState(url));assert.equal(savePreference(parseState(url),denied),false);
  const local = storage();local.setItem(PREFERENCE_KEY,'{broken');assert.deepEqual(restorePreference(url,local),parseState(url));
});
test('selected conditions expose the exact units and scope needed to remove them', () => {
  const state = parseState(new URL('https://nomads.test/?q=东京&region=亚洲&budget=1500&month=1&visa=visa_free&warm=1&incomplete=1'));
  assert.deepEqual(activeFilters(state).map(item => item.key),['q','region','budget','month','visa','warm','incomplete']);
  assert.match(activeFilters(state).find(item => item.key === 'budget').label,/\$1,500/);
  assert.match(activeFilters(state).find(item => item.key === 'visa').label,/大陆护照/);
});
test('network preset changes relative weights, and visa remains an entry filter', () => {
  assert.ok(UI_PRESETS.internet.weights.internet > UI_PRESETS.internet.weights.cost);
  assert.deepEqual(UI_PRESETS.visa.weights,DEFAULT_WEIGHTS);assert.equal(UI_PRESETS.visa.visa,'visa_free');assert.match(UI_PRESETS.visa.note,/待核验/);
});
test('view summary names leading priorities while preserving the default metric name', () => {
  const state = parseState(new URL('https://nomads.test/'));assert.equal(viewLabel(state),'综合推荐');
  state.weights = UI_PRESETS.internet.weights;assert.equal(viewLabel(state).split(' · ')[0],'网络');
});
test('command search finds Chinese cities, visas and useful fallback actions', () => {
  const data = [{slug:'lisbon',name:'里斯本',nameEn:'Lisbon',country:'葡萄牙',photo:null}];
  assert.equal(commandItems(data,'里斯本')[0].kind,'city');assert.equal(commandItems(data,'Lisbon')[0].value,'lisbon');
  assert.ok(commandItems(data,'签证').some(item => item.kind === 'filter' && item.key === 'visa'));
  assert.ok(commandItems(data,'网速').some(item => item.kind === 'preset' && item.value === 'internet'));
  assert.equal(commandItems(data,'未录入地点').at(-1).kind,'search');
});

test('a saved dated view stays visible and removable without duplicate month pills',()=>{
 const selected=parseState(new URL('https://nomads.test/?month=10&season=2026-10'));
 const conditions=activeFilters(selected);assert.equal(conditions.filter(c=>c.key==='season').length,1);assert.ok(!conditions.some(c=>c.key==='month'));
 const local=storage();savePreference(selected,local);assert.equal(restorePreference(new URL('https://nomads.test/'),local).season,'2026-10');
 selected.season='';assert.ok(activeFilters(selected).some(c=>c.key==='month'));
});

test('named numeric priorities actually dedicate sixty percent to their leading metric',()=>{
 for(const [name,key] of [['budget','cost'],['internet','internet'],['safe','safety']]){
  const weights=UI_PRESETS[name].weights,total=Object.values(weights).reduce((a,b)=>a+b,0);assert.equal(weights[key]/total,0.6);
 }
});

test('changing the month through a command keeps visible conditions and shared state consistent',()=>{
 const state=parseState(new URL('https://nomads.test/?month=10&season=2026-10'));
 const january=commandItems([],'1月').find(item=>item.kind==='filter'&&item.key==='month'&&item.value===1);
 applyRankingFilter(state,january.key,january.value);
 assert.deepEqual(activeFilters(state).map(item=>item.label),['1月出发']);
 assert.equal(stateParams(state).toString(),'month=1');
 assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(state))),state);
 const local=storage();savePreference(state,local);
 assert.deepEqual(restorePreference(new URL('https://nomads.test/'),local),state);
 applyRankingFilter(state,'month',10);
 assert.deepEqual(activeFilters(state).map(item=>item.label),['10月出发']);
});

test('clearing the selected month also removes its warmth and dated departure conditions',()=>{
 const state=parseState(new URL('https://nomads.test/?month=10&season=2026-10&warm=1'));
 applyRankingFilter(state,'month',null);
 assert.deepEqual(activeFilters(state),[]);
 assert.equal(stateParams(state).toString(),'');
});

test('changing another filter preserves an explicitly selected dated departure view',()=>{
 const state=parseState(new URL('https://nomads.test/?month=10&season=2026-10'));
 applyRankingFilter(state,'region','欧洲');
 assert.equal(stateParams(state).toString(),'region=%E6%AC%A7%E6%B4%B2&month=10&season=2026-10');
 assert.deepEqual(activeFilters(state).map(item=>item.label),['欧洲','10月出发建议']);
});
test('quick geography switches a real country constraint while retaining the chosen ranking',()=>{
 const state=parseState(new URL('https://nomads.test/?region=欧洲&visa=visa_free&w=5,80,5,5,4,1'));
 const weights={...state.weights};
 toggleQuickFilter(state,'domestic');assert.equal(state.country,'CN');assert.equal(state.region,'');assert.equal(state.visa,'');assert.deepEqual(state.weights,weights);
 const local=storage();savePreference(state,local);assert.deepEqual(restorePreference(new URL('https://nomads.test/'),local),state);
 assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(state))),state);
 assert.deepEqual(quickFilters(state).filter(f=>f.selected).map(f=>f.key),['domestic']);
 assert.deepEqual(additionalFilters(state),[]);
 toggleQuickFilter(state,'asia');assert.equal(state.country,'');assert.equal(state.region,'亚洲');
 toggleQuickFilter(state,'asia');assert.equal(state.region,'');
 toggleQuickFilter(state,'domestic');applyRankingFilter(state,'region','欧洲');assert.equal(state.country,'');
});
test('current-month shortcut composes with geography, follows Singapore month boundaries and can be removed',()=>{
 const state=parseState(new URL('https://nomads.test/?country=CN&month=1&warm=1'));
 const date=new Date('2026-10-31T16:01:00Z');
 toggleQuickFilter(state,'month',date);assert.equal(state.month,11);assert.equal(state.country,'CN');assert.equal(state.warm,false);
 assert.deepEqual(quickFilters(state,date).filter(f=>f.selected).map(f=>f.key),['domestic','month']);
 assert.deepEqual(additionalFilters(state,date),[]);
 toggleQuickFilter(state,'month',date);assert.equal(state.month,null);assert.equal(state.country,'CN');
});
test('abroad composes with Asia and month, switches cleanly from domestic and remains shareable',()=>{
 const state=parseState(new URL('https://nomads.test/?country=CN&month=10&w=5,80,5,5,4,1'));
 toggleQuickFilter(state,'abroad');assert.equal(state.abroad,true);assert.equal(state.country,'');assert.equal(state.month,10);assert.equal(state.weights.cost,60);
 toggleQuickFilter(state,'asia');assert.equal(state.abroad,true);assert.equal(state.region,'亚洲');
 assert.deepEqual(parseState(new URL('https://nomads.test/?'+stateParams(state))),state);
 const local=storage();savePreference(state,local);assert.deepEqual(restorePreference(new URL('https://nomads.test/'),local),state);
 assert.ok(commandItems([],'国外').some(item=>item.kind==='quick'&&item.value==='abroad'));
 assert.equal(additionalFilters(state,new Date('2026-10-18T00:00:00Z')).length,0);
 toggleQuickFilter(state,'abroad');assert.equal(state.abroad,false);assert.equal(state.region,'亚洲');
 toggleQuickFilter(state,'abroad');toggleQuickFilter(state,'domestic');assert.equal(state.country,'CN');assert.equal(state.abroad,false);
 toggleQuickFilter(state,'abroad');toggleQuickFilter(state,'global');assert.equal(state.abroad,false);assert.equal(state.region,'');assert.equal(state.country,'');
});
