import test from 'node:test';
import assert from 'node:assert/strict';
import { parseState, DEFAULT_WEIGHTS } from '../public/modules/ranking.js';
import { UI_PRESETS, PREFERENCE_KEY, restorePreference, savePreference, activeFilters, viewLabel, commandItems } from '../public/modules/rank-controls.js';

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
  const state = parseState(new URL('https://nomads.test/'));assert.equal(viewLabel(state),'Metric Score');
  state.weights = UI_PRESETS.internet.weights;assert.equal(viewLabel(state).split(' · ')[0],'网络');
});
test('command search finds Chinese cities, visas and useful fallback actions', () => {
  const data = [{slug:'lisbon',name:'里斯本',nameEn:'Lisbon',country:'葡萄牙',photo:null}];
  assert.equal(commandItems(data,'里斯本')[0].kind,'city');assert.equal(commandItems(data,'Lisbon')[0].value,'lisbon');
  assert.ok(commandItems(data,'签证').some(item => item.kind === 'filter' && item.key === 'visa'));
  assert.ok(commandItems(data,'网速').some(item => item.kind === 'preset' && item.value === 'internet'));
  assert.equal(commandItems(data,'未录入地点').at(-1).kind,'search');
});
