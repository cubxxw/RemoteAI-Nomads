import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {renderAnnualSeasons} from '../public/modules/ranking-seasons.js';
import {loadRankings} from '../src/rank-pages.js';

test('a NASA-backed annual table names MERRA-2 rather than presenting it as ERA5',()=>{
  const html=renderAnnualSeasons({climateModels:['MERRA-2'],months:[{month:11,meanC:12,status:'recommended'}]},11);
  assert.match(html,/NASA POWER/);
  assert.match(html,/MERRA-2/);
  assert.doesNotMatch(html,/ERA5/);
  assert.match(html,/网格|山地/);
});

test('public ranking transport carries the actual climate model from stored observations',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'nomads-climate-provenance-'));
  const file=join(dir,'public.sqlite');
  await copyFile(new URL('../.data/release/published.sqlite',import.meta.url),file);
  const db=new DatabaseSync(file);
  try {
    const city=db.prepare('SELECT id FROM cities WHERE slug=?').get('la-paz');
    const source='climate-provenance-test';
    db.prepare('INSERT INTO sources (id,url,publisher,title,kind,license,accessed_at) VALUES (?,?,?,?,?,?,?)').run(source,'https://power.larc.nasa.gov/docs/methodology/meteorology/','NASA POWER','Test reanalysis reference','official','Public domain','2026-10-27');
    db.prepare('DELETE FROM city_climate_months WHERE city_id=?').run(city.id);
    db.prepare('INSERT OR REPLACE INTO city_climate_months (city_id,month,mean_c,high_c,rain_mm,sample_days,period_start,period_end,model,source_id,checked_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(city.id,11,12,19,30,90,'2023-01-01','2025-12-31','MERRA-2',source,'2026-10-27');
    const env={PREVIEW:'true',DB:{prepare(sql){const statement=db.prepare(sql);return {bind(...args){return {async all(){return {results:statement.all(...args)};}};}};}}};
    const rows=await loadRankings(env),item=rows.find(row=>row.slug==='la-paz');
    assert.deepEqual(item.climateModels,['MERRA-2']);
    assert.equal(item.months[10].meanC,12);
  }finally{db.close();await rm(dir,{recursive:true,force:true});}
});
