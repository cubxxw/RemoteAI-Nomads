// Read-only audit of the public catalog and cached, public source responses.
// Live requests and raw response caching are intentionally separate from import.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validatePublicSeed} from './bootstrap-public.mjs';
import {parseCsv} from '../src/cost-sync.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));

export function auditChinaCatalog(seed) {
  validatePublicSeed(seed);
  const table=name=>{
    const value=seed.tables.find(t=>t.name===name);
    return value.rows.map(row=>Object.fromEntries(value.columns.map((key,i)=>[key,row[i]])));
  };
  const all=table('cities'),scores=new Map(table('city_scores').map(row=>[row.city_id,row]));
  const locations=new Map(table('city_locations').map(row=>[row.city_id,row]));
  const climates=table('city_climate_months'),costs=table('cost_observations');
  const metrics=['safety','cost','climate','life','internet','community'];
  const cities=all.filter(row=>row.country_id==='CN').map(city=>{
    const score=scores.get(city.id)||{},location=locations.get(city.id);
    const missing_metrics=metrics.filter(key=>score[key]===null||score[key]===undefined);
    const observations=costs.filter(row=>row.city_id===city.id);
    return {slug:city.slug,name:city.name_zh,reference_budget:city.budget_amount,complete_metrics:!missing_metrics.length,missing_metrics,
      located:Boolean(location),climate_months:climates.filter(row=>row.city_id===city.id).length,cost_observations:observations.length,
      cost_fields:[...new Set(observations.map(row=>row.field))]};
  });
  return {snapshot_date:seed.snapshot_date,global_cities:all.length,mainland_cities:cities.length,
    with_complete_metrics:cities.filter(row=>row.complete_metrics).length,with_cost_observations:cities.filter(row=>row.cost_observations).length,cities};
}

export function inspectCostCompass(catalog,prices) {
  assert.equal(catalog.license?.id,'CC-BY-4.0','Unexpected source license; review before reuse');
  const cities=catalog.cities.filter(row=>row.country?.code==='CN');
  const observations=parseCsv(prices).filter(row=>row.country_code==='CN');
  for(const city of cities)assert.equal(observations.filter(row=>row.city_slug===city.slug).length,city.measuredPrices,'Catalog and price files disagree: '+city.slug);
  return {generated_at:catalog.generated,license:catalog.license.id,mainland_cities:cities.map(row=>({slug:row.slug,name:row.name,observations:observations.filter(p=>p.city_slug===row.slug).length})),observations:observations.length,
    fields:[...new Set(observations.map(row=>row.field))],monthly_total_available:false};
}

export function inspectNasaMonthly(value) {
  assert.deepEqual(value.header?.sources,['MERRA2','POWER']);
  const parameters=value.properties?.parameter;
  assert.ok(parameters?.T2M&&parameters?.PRECTOTCORR,'NASA monthly fields missing');
  assert.equal(value.parameters.T2M.units,'C');
  assert.equal(value.parameters.PRECTOTCORR.units,'mm/day');
  const keys=Object.keys(parameters.T2M).filter(key=>/^\d{6}$/.test(key)&&Number(key.slice(4))>=1&&Number(key.slice(4))<=12);
  assert.ok(keys.length,'No real calendar months');
  return {source_model:'MERRA2 / POWER',source_period:{start:value.header.start,end:value.header.end},coordinate:value.geometry.coordinates,
    calendar_months:keys.length,annual_records_excluded:Object.keys(parameters.T2M).filter(key=>key.endsWith('13')).length,
    temperature_unit:'C',precipitation_unit:'mm/day',precipitation_requires_days_in_month:true,
    valid_temperature_months:keys.filter(key=>Number.isFinite(parameters.T2M[key])&&parameters.T2M[key]!==value.header.fill_value).length,
    replace_existing_era5:false};
}

// A single reviewed article template, kept out of production cost import.
export function inspectDaliFood(html) {
  const text=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,'').replace(/\s+/g,'');
  const period=text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日—(\d{1,2})日云南省大理州生活必需品市场运行情况/);
  assert.ok(period,'Unreviewed article title or time range');
  assert.ok(text.includes('大理州商务局'),'Original publisher missing');
  const published=text.match(/(\d{4}-\d{2}-\d{2})\d{2}:\d{2}:\d{2}/);
  assert.ok(published,'Publication date missing');
  const date=day=>`${period[1]}-${period[2].padStart(2,'0')}-${day.padStart(2,'0')}`;
  for(const day of [period[3],period[4]])assert.equal(new Date(date(day)).toISOString().slice(0,10),date(day),'Invalid sample date');
  assert.ok(date(period[3])<=date(period[4]),'Reversed sample period');
  const items=[['rice','大米','公斤'],['flour','面粉','公斤'],['eggs','鸡蛋平均零售价','公斤'],['pork','猪肉平均零售价','公斤'],
    ['milk','超市牛奶平均零售价','升'],['water','饮用水平均零售价','升'],['vegetables_supermarket','超市蔬菜平均零售价','公斤'],['vegetables_market','农贸市场蔬菜平均零售价','公斤']];
  return {publisher:'大理州商务局',publication_date:published[1],sample_start:date(period[3]),sample_end:date(period[4]),
    source_url:'https://cif.mofcom.gov.cn/cif/html/market_scanner/2026/6/1781505968329.html',
    geography:{name:'大理白族自治州',level:'prefecture',country:'CN'},city_id:null,license:'publisher_terms_not_an_open_data_license',
    observations:items.map(([field,label,unit])=>{
      const match=text.match(new RegExp(label+'([0-9]+(?:\\.[0-9]+)?)元/'+unit));
      assert.ok(match,'Missing or changed price/unit for '+field);
      return {field,amount:Number(match[1]),currency:'CNY',unit:unit==='升'?'liter':'kg'};
    }),monthly_total_available:false,imported:false};
}

async function main() {
  const args=process.argv.slice(2);
  for(let i=0;i<args.length;i++){
    if(['--source-cache','--output'].includes(args[i])){assert.ok(args[i+1]&&!args[i+1].startsWith('--'),'A path is required');i++;}
    else throw Error('Use --source-cache DIRECTORY and/or --output FILE. This command never writes D1.');
  }
  const option=name=>{const at=args.indexOf(name);return at<0?null:resolve(args[at+1]);};
  const bytes=await readFile(new URL('../data/public-catalog.json.gz',import.meta.url));
  const seed=JSON.parse(gunzipSync(bytes,{maxOutputLength:64*1024*1024}));
  const report={checked_at:new Date().toISOString(),catalog:auditChinaCatalog(seed),database_writes:0};
  const cache=option('--source-cache');
  if(cache){
    const json=async name=>JSON.parse(await readFile(resolve(cache,name),'utf8'));
    const catalog=await json('costcompass-cities.json');
    report.costcompass=inspectCostCompass(catalog,await readFile(resolve(cache,'costcompass-prices.csv'),'utf8'));
    report.nasa_dali=inspectNasaMonthly(await json('nasa-dali.json'));
    report.dali_prefecture_food=inspectDaliFood(await readFile(resolve(cache,'dali-weekly.html'),'utf8'));
    report.source_requests=await json('requests.json');
    // Verify each saved successful payload against the original fetch ledger.
    for(const request of report.source_requests.filter(row=>row.status===200&&!row.error)){
      assert.equal(createHash('sha256').update(await readFile(resolve(cache,request.file))).digest('hex'),request.sha256,'Cached source changed: '+request.id);
    }
    const entity=(await json('wikidata-anji.json')).entities.Q551437;
    assert.ok(entity.claims.P17.some(row=>row.rank!=='deprecated'&&row.mainsnak.datavalue?.value?.id==='Q148'));
    report.anji_identity={wikidata_id:entity.id,name:entity.labels['zh-hans'].value,country:'CN',
      coordinate_candidates:entity.claims.P625.filter(row=>row.rank!=='deprecated').map(row=>row.mainsnak.datavalue?.value),
      status:'reviewed_identity_candidate_not_imported'};
  }
  const output=option('--output');
  if(output){assert.ok(output.startsWith(resolve(ROOT,'.data')+'/'),'Audit output must stay inside web/.data');await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) await main();
