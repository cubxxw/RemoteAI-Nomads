// Reviewed, bounded import. Produces an additive SQL patch; never runs remote D1 itself.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inspectDaliFood} from './audit-china-coverage.mjs';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const sha=value=>createHash('sha256').update(value).digest('hex');
const q=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
const put=(table,row)=>`INSERT OR IGNORE INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.values(row).map(q).join(',')});`;
export async function chinaReferencePlan({cache=resolve(ROOT,'.data/china-source-probe')}={}) {
  const ledger=JSON.parse(await readFile(resolve(cache,'requests.json'),'utf8'));
  async function checked(id) {
    const request=ledger.find(r=>r.id===id);
    assert.ok(request?.status===200&&!request.error,'A completed source fetch is required: '+id);
    assert.match(request.file,/^[a-z0-9-]+\.[a-z]+$/);
    const bytes=await readFile(resolve(cache,request.file));
    assert.equal(sha(bytes),request.sha256,'Cached payload changed: '+id);
    return {request,bytes};
  }
  const foodRaw=await checked('dali-weekly'),food=inspectDaliFood(foodRaw.bytes.toString());
  const anjiRaw=await checked('wikidata-anji'),entity=JSON.parse(anjiRaw.bytes).entities.Q551437;
  assert.ok(entity.claims.P17.some(c=>c.rank!=='deprecated'&&c.mainsnak.datavalue?.value?.id==='Q148'));
  const coordinates=entity.claims.P625.filter(c=>c.rank!=='deprecated').map(c=>c.mainsnak.datavalue?.value).filter(Boolean);
  assert.equal(coordinates.length,1,'Ambiguous Anji coordinates');
  const coord=coordinates[0];assert.equal(coord.globe,'http://www.wikidata.org/entity/Q2');
  assert.ok(coord.latitude>30&&coord.latitude<31&&coord.longitude>119&&coord.longitude<120,'Anji county bounds mismatch');
  const date=foodRaw.request.checked_at.slice(0,10),sourceId='mofcom:dali:20260601';
  const sources=[{id:sourceId,url:food.source_url,publisher:food.publisher,title:'大理州生活必需品监测 · 2026-06-01至06-07',kind:'official',license:'公开报告；按原发布者条款引用，未声明CC开放许可',accessed_at:date},
    {id:'wikidata:Q551437',url:anjiRaw.request.url,publisher:'Wikidata',title:'安吉县 Q551437 · 县级身份与坐标',kind:'dataset',license:'CC0（结构化数据）',accessed_at:anjiRaw.request.checked_at.slice(0,10)}];
  const areas=[{id:'CN:532900',country_id:'CN',parent_id:null,name_zh:'大理白族自治州',level:'prefecture',source_id:sourceId,checked_at:foodRaw.request.checked_at},
    {id:'CN:330523',country_id:'CN',parent_id:null,name_zh:'安吉县',level:'county',source_id:'wikidata:Q551437',checked_at:anjiRaw.request.checked_at}];
  const names={rice:'大米',flour:'面粉',eggs:'鸡蛋',pork:'猪肉',milk:'超市牛奶',water:'饮用水',vegetables_supermarket:'超市蔬菜',vegetables_market:'农贸市场蔬菜'};
  const observations=food.observations.map(o=>({id:'cn-ref:'+sha(JSON.stringify([foodRaw.request.sha256,o])).slice(0,24),area_id:'CN:532900',provider:'mofcom',category:'food',field:o.field,label:names[o.field],
    amount:o.amount,currency:o.currency,unit:o.unit,period:'item',population_scope:'大理州监测样本，含祥云与洱源；非大理市全体商户',market_type:o.field==='vegetables_market'?'wet_market_retail':o.field==='vegetables_supermarket'||o.field==='milk'?'supermarket_retail':'retail_monitoring',
    sample_start:food.sample_start,sample_end:food.sample_end,published_at:food.publication_date,source_id:sourceId,source_locator:'生活必需品市场运行情况 · '+names[o.field],checked_at:foodRaw.request.checked_at,payload_hash:sha(JSON.stringify([foodRaw.request.sha256,o]))}));
  // This extraction was reviewed against PDF page 28, printed page 15; it is not a monthly budget.
  const yearbook=JSON.parse(await readFile(resolve(ROOT,'data/china-yearbook-reference.json'),'utf8'));
  assert.equal(yearbook.statistics_year,2024);assert.equal(yearbook.pdf_page,28);assert.equal(yearbook.printed_page,15);
  assert.equal(yearbook.extraction_method,'reviewed_table_transcription');assert.equal(yearbook.unit,'CNY/person/year');
  assert.equal(yearbook.all_residents,30809);assert.equal(yearbook.urban_permanent_residents,33682);
  const yearbookId='dali:yearbook:2024';
  sources.push({id:yearbookId,url:'https://www.yndali.gov.cn/dlsrmzf/c106688/2022493694320480256/5sEBHBLG.pdf',publisher:'大理市统计局',title:'大理市统计年鉴2024 · 居民消费支出',kind:'official',license:'官方公开年鉴；引用原表并保留来源，未声明CC开放许可',accessed_at:date});
  areas.push({id:'CN:532901',country_id:'CN',parent_id:'CN:532900',name_zh:'大理市',level:'city',source_id:yearbookId,checked_at:foodRaw.request.checked_at});
  for(const [field,label,amount,population]of [['resident_consumption_all','全体居民人均消费支出',30809,'大理市全体居民'],['resident_consumption_urban','城镇常住居民人均消费支出',33682,'大理市城镇常住居民']]){
    const hash=sha(JSON.stringify([yearbook,field,amount]));
    observations.push({id:'cn-ref:'+hash.slice(0,24),area_id:'CN:532901',provider:'dali-statistics',category:'resident_consumption',field,label,amount,currency:'CNY',unit:'person/year',period:'year',population_scope:population,market_type:'resident_statistics',sample_start:'2024-01-01',sample_end:'2024-12-31',published_at:null,source_id:yearbookId,source_locator:'PDF第28页；书内第15页；2024年列；2025年编辑，未标具体出版日',checked_at:foodRaw.request.checked_at,payload_hash:hash});
  }
  let sql=sources.map(s=>put('sources',s)).join('\n')+'\n';
  // Existing source URLs may already have another canonical ID: resolve by URL in foreign keys.
  const sourceRef=id=>`(SELECT id FROM sources WHERE url=${q(sources.find(s=>s.id===id).url)})`;
  for(const area of areas)sql+=put('geo_areas',area).replace(q(area.source_id),sourceRef(area.source_id))+'\n';
  for(const [slug,area,relation]of [['dali','CN:532900','regional_context'],['dali','CN:532901','identity'],['anji','CN:330523','identity']])
    sql+=`INSERT OR IGNORE INTO city_geo_areas(city_id,area_id,relation) SELECT id,${q(area)},${q(relation)} FROM cities WHERE slug=${q(slug)} AND country_id='CN';\n`;
  for(const row of observations)sql+=put('regional_reference_observations',row).replace(q(row.source_id),sourceRef(row.source_id))+'\n';
  sql+=`INSERT OR IGNORE INTO city_locations(city_id,latitude,longitude,timezone,geonames_id,match_method,source_id,checked_at) SELECT id,${q(coord.latitude)},${q(coord.longitude)},'Asia/Shanghai',1818043,'country+Wikidata county identity; county centroid',${sourceRef('wikidata:Q551437')},${q(anjiRaw.request.checked_at)} FROM cities WHERE slug='anji' AND country_id='CN';\n`;
  return {sql,summary:{regional_observations:observations.length,areas:areas.length,locations_if_missing:['anji'],city_budgets_changed:0,scores_changed:0,sources:sources.map(({id,url})=>({id,url})),food_sample_end:food.sample_end,statistics_year:2024}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const plan=await chinaReferencePlan();const out=resolve(ROOT,'.data/deploy/china-20261018');await mkdir(out,{recursive:true});
  await writeFile(resolve(out,'regional-patch.sql'),plan.sql,{mode:0o600});
  await writeFile(resolve(out,'regional-plan.json'),JSON.stringify(plan.summary,null,2)+'\n');
  console.log(JSON.stringify(plan.summary));
}
