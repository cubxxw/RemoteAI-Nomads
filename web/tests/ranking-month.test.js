import test from 'node:test';
import assert from 'node:assert/strict';
import {currentMonth, displayMonth, parseState, stateParams, rankCities} from '../public/modules/ranking.js';
import {quickFilters, toggleQuickFilter, restorePreference, savePreference} from '../public/modules/rank-controls.js';
import {rankingPageFromData} from '../src/rank-pages.js';

const url = query => new URL('https://nomads.test/' + (query ? '?' + query : ''));
const storage = () => {
  const values = new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
};
const dates = ['2026-10-31T15:59:59Z', '2026-10-31T16:00:00Z', '2026-12-31T16:00:00Z'].map(value=>new Date(value));

test('a fresh default follows Singapore month boundaries including the new year without persisting a fixed month',()=>{
  const state = parseState(url());
  assert.deepEqual(dates.map(date=>currentMonth(date)),[10,11,1]);
  assert.deepEqual(dates.map(date=>displayMonth(state,date)),[10,11,1]);
  const local=storage();savePreference(state,local);
  assert.equal(local.getItem('nomads-ranking-view-v1'),null);
});

test('the current-month shortcut survives URL and preference roundtrips as a rolling month',()=>{
  const state=parseState(url('abroad=1&month=10'));
  toggleQuickFilter(state,'month',dates[0]);
  assert.equal(stateParams(state).get('month'),'current');
  assert.equal(state.recommendedOnly,true);
  const shared=parseState(url(stateParams(state).toString()));
  assert.deepEqual(shared,state);
  assert.deepEqual(dates.map(date=>displayMonth(shared,date)),[10,11,1]);
  assert.ok(dates.every(date=>quickFilters(shared,date).find(filter=>filter.key==='month').selected));
  const local=storage();savePreference(state,local);
  assert.deepEqual(restorePreference(url(),local),state);
});

test('rolling recommendation filtering and scoring use the same effective month',()=>{
  const city={slug:'test',countryCode:'TH',name:'Test',nameEn:'Test',country:'Thailand',budget:900,
    scores:{safety:9,life:8,internet:8,community:8},visa:{code:'visa_free'},
    months:Array.from({length:12},(_,index)=>({month:index+1,status:index===10?'recommended':'unknown',meanC:22,highC:26,rainMm:30}))};
  const state=parseState(url('month=current&recommendedOnly=1'));
  assert.equal(rankCities([city],state,dates[0]).length,0);
  assert.equal(rankCities([city],state,dates[1])[0].scoreMonth,11);
  assert.equal(rankCities([city],state,dates[2]).length,0);
});

test('explicit month links and saved manual choices remain fixed across month and year boundaries',()=>{
  const local=storage(),manual=parseState(url('abroad=1&month=10'));
  savePreference(manual,local);
  const restored=restorePreference(url(),local);
  assert.deepEqual(dates.map(date=>displayMonth(restored,date)),[10,10,10]);
  assert.deepEqual(restorePreference(url('month=1'),local),parseState(url('month=1')));
  assert.equal(stateParams(restored).get('month'),'10');
  for(const invalid of ['0','13','NaN','11.5',''])assert.equal(parseState(url('month='+invalid)).month,null);
});

test('the ranking explains whether its actual month follows the calendar or an explicit choice',()=>{
  const automatic=rankingPageFromData([],url()).body;
  assert.match(automatic,/id="ranking-month-context"[^>]*>[^<]*本月/);
  const fixed=rankingPageFromData([],url('abroad=1&month=10')).body;
  assert.match(fixed,/按10月历史气候排序/);
  assert.match(fixed,/data-follow-current-month[^>]*>跟随本月/);
});
