import test from 'node:test';
import assert from 'node:assert/strict';
import {planMonth,withPlanMonth,readCityPlan,writeCityPlan,restoredValues} from '../public/modules/trip-state.js';
import {restorePreference} from '../public/modules/rank-controls.js';

const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const plan={version:1,month:12,days:30,currency:'CNY',values:{rent:{amount:3000,origin:'edited'},food:{amount:100,origin:'edited'},transport:{amount:300,origin:'reference'},mobile:{amount:0,origin:'edited'},other:{amount:null,origin:'missing',cleared:true}}};

test('explicit shared month wins over a local plan and invalid months cannot replace a valid default',()=>{
  assert.equal(planMonth(new URL('https://nomads.test/cities/chiang-mai/?month=11'),12,10),11);
  assert.equal(planMonth(new URL('https://nomads.test/cities/chiang-mai/'),12,10),12);
  for(const value of ['0','13','NaN','<script>'])assert.equal(planMonth(new URL('https://nomads.test/?month='+encodeURIComponent(value)),null,10),10);
});
test('month follows a city or country link without dropping its query or anchor',()=>{
  assert.equal(withPlanMonth('/cities/chiang-mai/#season',12),'/cities/chiang-mai/?month=12#season');
  assert.equal(withPlanMonth('/compare/?a=lisbon&b=porto',11),'/compare/?a=lisbon&b=porto&month=11');
  assert.equal(withPlanMonth('/countries/th/?q=清迈',12),'/countries/th/?q=%E6%B8%85%E8%BF%88&month=12');
  assert.equal(withPlanMonth('https://outside.example/',12),'https://outside.example/');
});
test('a per-city personal plan survives leaving the page, keeping blank, zero and provenance distinct',()=>{
  const store=storage();assert.equal(writeCityPlan(store,'chiang-mai',plan),true);
  const loaded=readCityPlan(store,'chiang-mai');
  assert.equal(loaded.month,12);assert.equal(loaded.days,30);assert.equal(loaded.currency,'CNY');
  assert.deepEqual(loaded.values,plan.values);assert.equal(readCityPlan(store,'penang'),null);
});
test('meeting date and hour survive with a personal plan, including midnight',()=>{
  const store=storage(),record={...plan,meeting:{date:'2027-07-15',hour:0}};
  assert.equal(writeCityPlan(store,'lisbon',record),true);
  assert.deepEqual(readCityPlan(store,'lisbon').meeting,record.meeting);
  assert.equal(writeCityPlan(store,'lisbon',{...record,meeting:{date:'2027-02-30',hour:25}}),false);
});
test('fresh default prices replace saved reference prices while explicit quotes and blanks survive',()=>{
  const defaults={rent:{amount:3500},food:{amount:120},transport:{amount:500},mobile:{amount:100},other:{amount:600}};
  assert.deepEqual(restoredValues(defaults,plan),{rent:{amount:3000,origin:'edited'},food:{amount:100,origin:'edited'},transport:{amount:500,origin:'reference'},mobile:{amount:0,origin:'edited'},other:{amount:null,origin:'missing',cleared:true}});
});
test('new reference coverage fills an originally unavailable field but never overwrites an explicit blank',()=>{
  const defaults={food:{amount:90},other:{amount:600}},saved={...plan,values:{...plan.values,food:{amount:null,origin:'missing'}}};
  assert.deepEqual(restoredValues(defaults,saved).food,{amount:90,origin:'reference'});
  assert.equal(restoredValues(defaults,saved).other.amount,null);
});
test('original foreign quotes keep their amount when exchange rates are updated',()=>{
  const store=storage(),saved={...plan,currency:'USD',values:{...plan.values,rent:{amount:6000,origin:'edited',quote:{amount:1000,currency:'USD'}}}};
  assert.equal(writeCityPlan(store,'lisbon',saved),true);
  const loaded=readCityPlan(store,'lisbon');
  assert.deepEqual(loaded.values.rent.quote,{amount:1000,currency:'USD'});
  assert.equal(restoredValues({},loaded,{USD:{rate:1/7}}).rent.amount,7000);
});
test('a total ceiling persists with original currency, including zero; invalid ceilings keep the previous plan intact',()=>{
 const store=storage(),record={...plan,ceiling:{amount:8000,quote:{amount:1000,currency:'USD'}}};
 assert.equal(writeCityPlan(store,'penang',record),true);
 assert.deepEqual(readCityPlan(store,'penang').ceiling,record.ceiling);
 assert.equal(writeCityPlan(store,'penang',{...plan,ceiling:{amount:-1}}),false);
 assert.deepEqual(readCityPlan(store,'penang').ceiling,record.ceiling);
 assert.equal(writeCityPlan(store,'penang',{...plan,ceiling:{amount:0}}),true);
 assert.equal(readCityPlan(store,'penang').ceiling.amount,0);
});
test('a return to ranking preserves personal weights and uses the journey month; explicit shared URLs still win',()=>{
  const store=storage();
  store.setItem('nomads-ranking-view-v1',JSON.stringify({version:1,query:'month=10&w=30,25,15,5,10,60'}));
  store.setItem('nomads-trip-month-v1','12');
  const returned=restorePreference(new URL('https://nomads.test/cities/'),store);
  assert.equal(returned.month,12);assert.equal(returned.weights.community,60);
  const shared=restorePreference(new URL('https://nomads.test/?month=11'),store);
  assert.equal(shared.month,11);assert.equal(shared.weights.community,15);
});
test('corrupt, oversized, invalid and unavailable storage never resurrect a false budget',()=>{
  const store=storage();
  for(const invalid of [{...plan,days:366},{...plan,month:13},{...plan,values:{...plan.values,rent:{amount:-1,origin:'edited'}}}])assert.equal(writeCityPlan(store,'chiang-mai',invalid),false);
  assert.equal(readCityPlan({getItem:()=>'{bad'},'chiang-mai'),null);
  assert.equal(readCityPlan({getItem:()=> 'x'.repeat(20000)},'chiang-mai'),null);
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.equal(readCityPlan(blocked,'chiang-mai'),null);assert.equal(writeCityPlan(blocked,'chiang-mai',plan),false);
});
