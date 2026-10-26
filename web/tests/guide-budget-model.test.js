import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculateBudget,readScenario,writeScenario,formatMoney} from '../content/city-guides/budget-model.mjs';
const configFor = slug => JSON.parse(readFileSync(new URL('../content/city-guides/'+slug+'-monthly-budget.html',import.meta.url),'utf8').match(/<script type="application\/json" id="guide-config">([\s\S]*?)<\/script>/)[1]).config;

test('native currency additions retain their labels, shared scenarios and unavailable conversions',()=>{
 for(const currency of ['AED','NZD','GEL']){
 const c=structuredClone(configFor('dali'));
 // Synthetic amounts exercise currency handling independently of editorial price data.
 c.nativeCurrency=currency; c.defaultScenario.currency=currency;
 c.fx={base:currency,rates:{CNY:2},date:'2026-10-26'};
 const native=calculateBudget(c);
 assert.equal(native.currency,currency);
 assert.equal(native.totalDisplay,native.totalNative);
 assert.equal(formatMoney(1250,currency),'1,250 '+currency);
 assert.equal(readScenario(writeScenario({...c.defaultScenario,housingNative:0}),c).currency,currency);
 assert.equal(calculateBudget(c,{currency:'CNY'}).totalDisplay,native.totalNative*2);
 const noFx=calculateBudget(c,{currency:'USD'});
 assert.equal(noFx.totalNative,native.totalNative); assert.equal(noFx.totalDisplay,null);
 }
});

test('new city plans keep whole work passes and block unknown monthly contracts',()=>{
 const bangkok=configFor('bangkok');
 assert.equal(calculateBudget(bangkok).totalNative,52000);
 assert.equal(calculateBudget(bangkok,{work:'occasional'}).items.find(i=>i.id==='work').amountNative,1682.04);
 assert.equal(calculateBudget(bangkok,{nights:31}).items.find(i=>i.id==='work').amountNative,10700);
 for(const [slug,total] of [['kunming',7000],['abu-dhabi',20350]]){
  const c=configFor(slug),room=calculateBudget(c),monthly=calculateBudget(c,{work:'cowork'});
  assert.equal(room.totalNative,total);
  assert.equal(monthly.totalNative,null); assert.equal(monthly.knownSubtotalNative,total);
  assert.ok(monthly.missing.includes('work'));
 }
 for(const slug of ['kunming','bangkok','abu-dhabi']){
  const html=readFileSync(new URL('../content/city-guides/'+slug+'-monthly-budget.html',import.meta.url),'utf8');
  const page=JSON.parse(html.match(/<script type="application\/json" id="guide-config">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(page.defaultResult,calculateBudget(page.config));
  assert.equal(calculateBudget(page.config,{season:'peak'}).totalNative,null);
 }
});

test('Kuala Lumpur reserves the whole room, utilities and the taxed daytime coworking pass',()=>{
 const c=configFor('kuala-lumpur');
 const result=calculateBudget(c);
 assert.equal(result.totalNative,5314.4); assert.equal(result.totalDisplay,8697);
 assert.equal(result.items.find(x=>x.id==='housing').kind,'allowance');
 assert.equal(result.items.find(x=>x.id==='housing').amountNative,3000);
 assert.equal(result.items.find(x=>x.id==='utilities').amountNative,200);
 assert.equal(result.items.find(x=>x.id==='work').amountNative,464.4);
 assert.equal(result.depositNative,null); assert.match(result.depositNote,/2,000/);
 const short=calculateBudget(c,{nights:1});
 const long=calculateBudget(c,{nights:31});
 assert.equal(short.items.find(x=>x.id==='work').amountNative,464.4);
 assert.equal(long.items.find(x=>x.id==='work').amountNative,928.8);
 assert.match(short.warnings.join(' '),/非30晚/);
});

test('Dali has a room-work default; unpriced coworking cannot silently count as free',()=>{
 const c=configFor('dali');
 assert.equal(c.defaultScenario.work,'room');
 assert.equal(calculateBudget(c).totalNative,5700);
 assert.equal(calculateBudget(c).totalDisplay,5700);
 for(const work of ['occasional','cowork']){
  const r=calculateBudget(c,{work});
  assert.equal(r.totalNative,null); assert.equal(r.totalDisplay,null);
  assert.equal(r.knownSubtotalNative,5700); assert.deepEqual(r.missing,['work']);
 }
 assert.equal(calculateBudget(c,{nights:365}).items.find(x=>x.id==='work').amountNative,0);
});

test('both new cities block unpriced peak housing and preserve zero user quotes through shared URLs',()=>{
 for(const slug of ['kuala-lumpur','dali']){
  const c=configFor(slug);
  const peak=calculateBudget(c,{season:'peak'});
  assert.equal(peak.totalNative,null); assert.ok(peak.missing.includes('housing'));
  const s={tier:'economy',nights:31,season:'peak',work:'room',currency:'USD',housingNative:0};
  const roundtrip=readScenario(writeScenario(s),c);
  assert.deepEqual(roundtrip,s);
  const housing=calculateBudget(c,roundtrip).items.find(x=>x.id==='housing');
  assert.equal(housing.amountNative,0); assert.equal(housing.kind,'user');
  assert.equal(housing.checkedOn,null); assert.deepEqual(housing.sourceIds,[]);
  for(const value of ['',-1,'free',Infinity])assert.equal(Object.hasOwn(calculateBudget(c,{housingNative:value}).scenario,'housingNative'),false);
  assert.equal(calculateBudget(c,{nights:0}).scenario.nights,30);
  const missing=structuredClone(c); delete missing.fx.rates.USD;
  const noFx=calculateBudget(missing,{currency:'USD'});
  assert.notEqual(noFx.totalNative,null); assert.equal(noFx.totalDisplay,null);
 }
});
