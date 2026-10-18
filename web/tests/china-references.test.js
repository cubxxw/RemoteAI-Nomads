import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readCityCosts} from '../src/cost-data.js';
import {regionalCoverage} from '../src/regional-data.js';
import {regionalReferenceSection,cityCostModel} from '../src/city-page.js';
import {parseState,rankCities,renderRankingList} from '../public/modules/ranking.js';
import {loadRankings} from '../src/rank-pages.js';
import {executeNomadTool} from '../src/agent-tools.js';

function fixture(){
 const seed=JSON.parse(gunzipSync(readFileSync(new URL('../data/public-catalog.json.gz',import.meta.url))));
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const item of seed.schema)db.exec(item.sql);
 for(const table of seed.tables){const stmt=db.prepare('INSERT INTO '+table.name+' ('+table.columns.join(',')+') VALUES ('+table.columns.map(()=>'?').join(',')+')');for(const row of table.rows)stmt.run(...row);}
 const prepare=(sql,args=[])=>({bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};}});
 return {db,env:{DB:{prepare},PREVIEW:'false'}};
}
test('domestic discovery exposes unscored Dali after scored cities without assigning a zero',async()=>{
 const {db,env}=fixture();try{
  const data=await loadRankings(env),state=parseState(new URL('https://nomads.example/?country=CN'));
  const cities=rankCities(data,state),dali=cities.find(c=>c.slug==='dali');
  assert.ok(dali);assert.equal(dali.score,null);assert.equal(dali.rank,null);
  assert.ok(cities.slice(0,5).every(c=>c.score!==null));
  const html=renderRankingList(cities,state);assert.equal((html.match(/class="rank-unrated-heading"/g)||[]).length,1);
  assert.match(html,/继续了解国内目的地/);
  assert.ok(rankCities(data,parseState(new URL('https://nomads.example/?q=大理'))).some(c=>c.slug==='dali'));
  assert.ok(!rankCities(data,parseState(new URL('https://nomads.example/?country=CN&budget=1'))).some(c=>c.slug==='dali'));
 }finally{db.close();}
});
test('regional references retain prefecture/city scope, item/annual units, and sample/publication/read dates',async()=>{
 const {db,env}=fixture();try{
  const costs=await readCityCosts(env,'city:dali',{now:'2026-10-18'});
  assert.equal(costs.coverage.city_observations,0);assert.equal(costs.coverage.national_observations,0);assert.equal(costs.coverage.regional_observations,10);
  const rice=costs.observations.find(o=>o.field==='rice');assert.equal(rice.amount,6.45);assert.equal(rice.unit,'kg');assert.equal(rice.scope,'regional');assert.equal(rice.city_id,null);assert.equal(rice.area_level,'prefecture');assert.equal(rice.sample_end,'2026-06-07');assert.equal(rice.published_at,'2026-06-15');assert.equal(rice.stale,true);
  const annual=costs.observations.find(o=>o.field==='resident_consumption_all');assert.equal(annual.amount,30809);assert.equal(annual.period,'year');assert.equal(annual.unit,'person/year');assert.equal(annual.area_level,'city');assert.equal(annual.detail.can_sum_as_monthly_budget,false);
  assert.equal(costs.reference_total,null);assert.ok(costs.coverage.missing_categories.includes('housing'));
  assert.equal((await readCityCosts(env,'city:kunming')).coverage.regional_observations,0);
 }finally{db.close();}
});
test('city rendering cannot turn annual statistics or wholesale units into adoptable monthly rent',async()=>{
 const {db,env}=fixture();try{
  const costs=await readCityCosts(env,'city:dali'),html=regionalReferenceSection(cityCostModel(costs));
  assert.match(html,/大理白族自治州/);assert.match(html,/大理市/);assert.match(html,/2026-06-01 — 2026-06-07/);assert.match(html,/人 \/ 年/);assert.match(html,/历史价格/);
  assert.ok(!html.includes('data-budget-fill'));assert.match(html,/¥6.45/);
 }finally{db.close();}
});
test('Agent can discover regional coverage and cite Dali samples without claiming complete housing coverage',async()=>{
 const {db,env}=fixture();try{
  assert.equal((await regionalCoverage(env,'CN')).filter(r=>r.slug==='dali').length,2);
  const result=await executeNomadTool(env,'get_costs',{city:'dali',scope:'regional',currency:'CNY'});
  assert.equal(result.data.observation_count,10);assert.equal(result.data.housing_evidence.price_floor_proven,false);
  assert.ok(result.sources.some(s=>s.url.includes('mofcom.gov.cn')));assert.ok(result.sources.some(s=>s.url.endsWith('.pdf')));
  const country=await executeNomadTool(env,'get_costs',{country:'CN'});
  assert.ok(country.data.regional_reference_destinations.some(r=>r.slug==='dali'));
 }finally{db.close();}
});
test('new CN destinations have licensed photos and observations but no invented score or budget',async()=>{
 const {db,env}=fixture();try{
  const cities=rankCities(await loadRankings(env),parseState(new URL('https://nomads.example/?country=CN')));
  for(const slug of ['beijing','guangzhou']){
   const city=cities.find(c=>c.slug===slug);assert.ok(city);assert.equal(city.budget,null);assert.equal(city.score,null);assert.match(city.photo,new RegExp('city-'+slug+'\\.webp$'));
   const costs=await readCityCosts(env,'city:'+slug);assert.equal(costs.coverage.city_observations,5);
  }
 }finally{db.close();}
});
