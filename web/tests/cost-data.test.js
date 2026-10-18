import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { readCityCosts, readFxRate, ESTAT_METHOD_SOURCES } from '../src/cost-data.js';
import { parseCsv, matchCostCity, syncCostCompass, extractEstatSingle, parseEcbRates, syncCosts, syncFx } from '../src/cost-sync.js';
import { readEstatWorkbook } from '../src/cost-xlsx.js';

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE countries(id TEXT PRIMARY KEY,iso2 TEXT UNIQUE);
    CREATE TABLE cities(id TEXT PRIMARY KEY,slug TEXT,name_en TEXT,country_id TEXT REFERENCES countries(id),budget_amount REAL);
    CREATE TABLE sources(id TEXT PRIMARY KEY,url TEXT UNIQUE,publisher TEXT,title TEXT,kind TEXT,license TEXT,accessed_at TEXT);
    INSERT INTO countries VALUES('JP','JP'),('TH','TH');
    INSERT INTO cities VALUES('tokyo','tokyo','Tokyo','JP',1300),('osaka','osaka','Osaka','JP',1000),('chiang-mai','chiang-mai','Chiang Mai','TH',700);`);
  db.exec(readFileSync(new URL('../migrations/0003_cost_sources.sql', import.meta.url), 'utf8'));
  const prepare = (sql, args = []) => ({ bind(...v) { return prepare(sql,v); },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } }; },
  });
  return { db, env: { DB: { prepare, batch: async statements => { const r=[]; for(const s of statements) r.push(await s.run()); return r; } } } };
}
const catalog = { license: { id: 'CC-BY-4.0' }, currency: 'USD', generated: '2026-10-14T00:00:00Z', observedTo: '2026-10-14',
  cities: [{ slug: 'chiang-mai', name: 'Chiang Mai', country: { code: 'TH' } }] };
const csvHeader = 'city_slug,city,country_code,country,category,field,item,unit,price_usd,min_usd,max_usd,observations,first_observed,last_observed,sources,page_url';
const validRow = 'chiang-mai,Chiang Mai,TH,Thailand,housing,housing_1br_center,1BR city-wide,month,446.81,446.81,446.81,1,2026-10-13,2026-10-13,Property listings,https://costcompass.net/living/cities/chiang-mai';
const sourceFetcher = csv => async url => new Response(String(url).endsWith('.csv') ? csv : JSON.stringify(catalog));

test('city matching requires country and one exact city identity, never a capital or region fallback', () => {
  const cities = [{ id:'a',slug:'lagos',name_en:'Lagos',iso2:'NG' },{ id:'b',slug:'lagos-algarve',name_en:'Lagos (Algarve)',iso2:'PT' }];
  assert.equal(matchCostCity(cities,{slug:'lagos',name:'Lagos',country:{code:'NG'}})?.id,'a');
  assert.equal(matchCostCity(cities,{slug:'lagos',name:'Lagos',country:{code:'PT'}}),null);
  assert.equal(matchCostCity([{slug:'ubud',name_en:'Ubud',iso2:'ID'}],{slug:'bali',name:'Bali',country:{code:'ID'}}),null);
  assert.equal(matchCostCity([{slug:'sao-paulo',name_en:'São Paulo',iso2:'BR'}],{slug:'sao-paulo',name:'Sao Paulo',country:{code:'BR'}})?.slug,'sao-paulo');
});

test('CSV parser preserves quoted commas, escaped quotes, and embedded newlines', () => {
  assert.deepEqual(parseCsv('a,b\r\n"milk, 1l","line1\nline2"\r\n"a""b",x'),[{a:'milk, 1l',b:'line1\nline2'},{a:'a"b',b:'x'}]);
  assert.throws(()=>parseCsv('a,b\n"unfinished'),/UNTERMINATED/);
  assert.throws(()=>parseCsv('a,b\n1,2,3'),/COLUMN_MISMATCH/);
});

test('imports real-unit samples idempotently; rejects partial monthly total fields and wrong-country rows', async () => {
  const {db,env}=fixture();
  const csv=[csvHeader,validRow,validRow.replace('housing_1br_center','monthly_total').replaceAll('446.81','55'),validRow.replace(',TH,',',JP,')].join('\n');
  const options={fetcher:sourceFetcher(csv),now:'2026-10-18T00:00:00Z'};
  const first=await syncCostCompass(env,options);
  assert.equal(first.inserted,1); assert.equal(first.rejected.length,2); assert.equal(first.monthly_totals_imported,0);
  assert.equal((await syncCostCompass(env,{...options,now:'2026-10-19T00:00:00Z'})).inserted,0);
  const result=await readCityCosts(env,'chiang-mai',{now:options.now});
  assert.equal(result.reference_total,null); assert.equal(result.observations[0].amount,446.81);
  assert.equal(result.observations[0].household_size,null);
  assert.ok(result.observations[0].quality_flags.includes('short_stay_not_verified'));
  assert.ok(result.coverage.missing_categories.includes('food'));
  assert.equal(db.prepare("SELECT budget_amount FROM cities WHERE id='chiang-mai'").get().budget_amount,700);
  assert.equal((await readCityCosts(env,'tokyo')).observations.length,0);
  db.close();
});

test('append-only corrections retain old samples while reads select latest observation', async () => {
  const {db,env}=fixture();
  await syncCostCompass(env,{fetcher:sourceFetcher(csvHeader+'\n'+validRow),now:'2026-10-18T00:00:00Z'});
  await syncCostCompass(env,{fetcher:sourceFetcher(csvHeader+'\n'+validRow.replaceAll('446.81','455').replaceAll('2026-10-13','2026-10-14')),now:'2026-10-19T00:00:00Z'});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cost_observations').get().n,2);
  assert.equal((await readCityCosts(env,'chiang-mai')).observations[0].amount,455);
  db.close();
});

test('FX cross conversion uses a common ECB publication date and reports stale instead of inventing current rates', async () => {
  const {db,env}=fixture();
  db.exec(`INSERT INTO sources VALUES('ecb','https://ecb.example','ECB','Reference rates','official',NULL,'2026-10-18');
    INSERT INTO fx_rates VALUES('a','EUR','USD',1.1253,'2026-10-16','ecb','2026-10-18');
    INSERT INTO fx_rates VALUES('b','EUR','CNY',7.524,'2026-10-16','ecb','2026-10-18');
    INSERT INTO fx_rates VALUES('c','EUR','CNY',7.6,'2026-10-17','ecb','2026-10-18');`);
  const rate=await readFxRate(env,'CNY','USD',{now:'2026-10-18T00:00:00Z'});
  assert.equal(rate.date,'2026-10-16'); assert.ok(Math.abs(rate.rate-1.1253/7.524)<1e-12); assert.equal(rate.stale,false);
  assert.equal((await readFxRate(env,'USD','CNY',{now:'2026-10-25T00:00:00Z'})).stale,true);
  assert.equal(await readFxRate(env,'JPY','CNY'),null);
  assert.equal((await readFxRate(env,'CNY','CNY')).rate,1);
  db.close();
});

test('ECB rejects future dates, malformed numeric rates, and missing CNY', () => {
  const xml=`<gesmes:name>European Central Bank</gesmes:name><Cube time='2026-10-16'><Cube currency='USD' rate='1.1253'/><Cube currency='JPY' rate='177.82'/><Cube currency='CNY' rate='7.5240'/></Cube>`;
  assert.equal(parseEcbRates(xml,'2026-10-18T00:00:00Z').length,3);
  assert.throws(()=>parseEcbRates(xml.replace('2026-10-16','2026-10-19'),'2026-10-18'),/DATE/);
  assert.throws(()=>parseEcbRates(xml.replace("rate='7.5240'","rate='0'"),'2026-10-18'),/RATES/);
});

const estatRows = [
  {A:'2025年',B:'単身世帯',C:'１世帯当たり１か月間の収入と支出'},
  {N:'単身世帯の実数',S:'勤労者世帯の実数'}, {L:'用途分類',M:'実数の単位'},
  {L:'集計世帯数',M:'世帯',N:'646'},
  {L:'消費支出',M:'円',N:'173042'}, {L:'食料',M:'円',N:'44659'}, {L:'住居',M:'円',N:'21667'},
  {L:'その他の消費支出1)',M:'円',N:'34611'}, {L:'食料',M:'円',N:'4662'},
];
test('e-Stat selects single-household amount column and ignores later duplicate gift subcategories', () => {
  const result=extractEstatSingle(estatRows,2025);
  assert.equal(result.sample_size,646); assert.equal(result.observations.find(o=>o.field==='food').amount,44659);
  assert.equal(result.observations.find(o=>o.field==='other').amount,34611);
  assert.throws(()=>extractEstatSingle(estatRows,2024),/WRONG_HOUSEHOLD/);
  assert.throws(()=>extractEstatSingle(estatRows.map(r=>r.N==='単身世帯の実数'?{N:'二人以上の世帯の実数'}:r),2025),/COLUMNS/);
});

function smallZip(files) {
  const chunks=[],directory=[];let offset=0;
  for(const [name,xml] of Object.entries(files)) {
    const data=Buffer.from(xml),compressed=deflateRawSync(data),nameBytes=Buffer.from(name),local=Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBytes.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBytes.length,28);central.writeUInt32LE(offset,42);
    chunks.push(local,nameBytes,compressed);directory.push(central,nameBytes);offset+=local.length+nameBytes.length+compressed.length;
  }
  const d=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(files).length,10);end.writeUInt32LE(d.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,d,end]);
}
test('public XLSX reader handles self-closing cells, Unicode rich text and ignores phonetic annotations', async()=>{
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const bytes=smallZip({'xl/sharedStrings.xml':`<sst xmlns="${ns}"><si><t>単身世帯の実数</t><rPh><t>タンシン</t></rPh></si></sst>`,
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetData><row r="1"><c r="A1"/><c r="N1" t="s"><v>0</v></c></row><row r="2"><c r="N2"><v>646</v></c></row></sheetData></worksheet>`});
  const rows=await readEstatWorkbook(bytes);
  assert.equal(rows[0].N,'単身世帯の実数');assert.equal(rows[0].A,'');assert.equal(rows[1].N,'646');
  await assert.rejects(()=>readEstatWorkbook(new Uint8Array([1,2,3])),/ZIP/);
});

test('national household references stay national and are never duplicated as a city sample',async()=>{
  const {db,env}=fixture();
  db.exec(`INSERT INTO sources VALUES('estat','https://estat.example','e-Stat','single households','official',NULL,'2026-10-18');
    INSERT INTO cost_observations(id,provider,country_id,scope,category,field,label,amount,currency,period,unit,household_size,sample_start,sample_end,sample_size,quality,quality_flags,detail,source_id,checked_at,payload_hash)
    VALUES('one','estat','JP','national','food','food','food',44659,'JPY','month','JPY/household/month',1,'2025-01-01','2025-12-31',646,'official_reference','["national_not_city"]','{}','estat','2026-10-18','hash');`);
  for(const city of ['tokyo','osaka']) {
    const result=await readCityCosts(env,city);
    assert.equal(result.coverage.city_observations,0);assert.equal(result.coverage.national_observations,1);
    assert.equal(result.observations[0].scope,'national');assert.equal(result.reference_total,null);
  }
  assert.equal((await readCityCosts(env,'chiang-mai')).observations.length,0);
  db.close();
});

test('national methodology excludes imputed rent and keeps total, categories, subsets and sample count distinct',async()=>{
  const {db,env}=fixture();
  const sourceInsert=db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?,?)');
  sourceInsert.run('estat:annual','https://estat.example/annual','e-Stat','Annual table','official',null,'2026-10-18');
  for(const s of ESTAT_METHOD_SOURCES)sourceInsert.run(s.id,s.url,s.publisher,s.title,s.kind,s.license,s.accessed_at);
  const observed={total_consumption:173042,food:44659,dining:9761,housing:21667,actual_rent_spend:17606,utilities:13333,
    household:5945,clothing:4664,healthcare:8690,transport_communication:19190,transport:4390,communication:6403,
    education:34,entertainment:20250,other:34611};
  const insert=db.prepare(`INSERT INTO cost_observations(id,provider,country_id,scope,category,field,label,amount,currency,period,unit,
    household_size,sample_start,sample_end,sample_size,quality,quality_flags,detail,source_id,checked_at,payload_hash)
    VALUES(?,'estat','JP','national',?,?,?,?,'JPY','month','JPY/单身家庭/月',1,'2025-01-01','2025-12-31',646,'official_reference','[]','{}','estat:annual','2026-10-18',?)`);
  for(const[field,amount]of Object.entries(observed))insert.run(field,field,field,field,amount,'hash:'+field);
  const rawBefore=db.prepare('SELECT id,amount,detail,payload_hash,sample_end,checked_at FROM cost_observations ORDER BY id').all();
  const result=await readCityCosts(env,'tokyo');const m=result.methodology;
  assert.equal(m.housing.actual_rent_paid_included,true);
  assert.equal(m.housing.owner_occupied_imputed_rent_included,false);
  assert.equal(m.housing.households_include_owner_occupiers,true);
  assert.equal(m.sample.reported_aggregate_households,646);
  assert.equal(m.sample.annual_unique_households,null);assert.equal(m.sample.population_households,null);
  assert.equal(m.hierarchy.subcategory_parents.dining,'food');assert.equal(m.hierarchy.subcategory_parents.actual_rent_spend,'housing');
  assert.equal(m.hierarchy.subcategory_parents.communication,'transport_communication');
  assert.equal(m.reconciliation.published_total,173042);assert.equal(m.reconciliation.major_categories_sum,173043);
  assert.equal(m.reconciliation.published_total_minus_major_sum,-1);assert.equal(m.reconciliation.nonhousing_consumption,151375);
  assert.equal(m.reconciliation.major_categories_present,10);assert.equal(m.reconciliation.major_categories_complete,true);
  assert.equal(result.observations.find(o=>o.field==='dining').detail.parent_field,'food');
  assert.equal(result.observations.find(o=>o.field==='dining').detail.aggregation_role,'subcategory');
  assert.equal(result.observations.find(o=>o.field==='total_consumption').detail.aggregation_role,'total');
  assert.ok(result.limitations.some(s=>s.includes('不计自有住房的归属家租')));
  assert.ok(result.sources.some(s=>s.id==='estat:methodology:qa'&&s.kind==='official'));
  assert.deepEqual(m.source_ids.sort(),ESTAT_METHOD_SOURCES.map(s=>s.id).sort());
  assert.deepEqual(db.prepare('SELECT id,amount,detail,payload_hash,sample_end,checked_at FROM cost_observations ORDER BY id').all(),rawBefore);
  assert.equal((await readCityCosts(env,'chiang-mai')).methodology,null);
  db.close();
});

test('source outage records a failed run and retains prior observations',async()=>{
  const {db,env}=fixture();
  await syncCostCompass(env,{fetcher:sourceFetcher(csvHeader+'\n'+validRow),now:'2026-10-18T00:00:00Z'});
  const r=await syncCosts(env,{fetcher:async()=>new Response('unavailable',{status:503})});
  assert.equal(r.costcompass.ok,false);assert.equal(r.estat.ok,false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cost_observations').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM cost_sync_runs WHERE status='failed'").get().n,2);
  db.close();
});

test('full-sized monthly sync stays below 50 D1 statements with bounded UTF-8 JSON parameters',async()=>{
  const {db,env}=fixture();
  const cities=Array.from({length:153},(_,i)=>({slug:'sample-'+i,name:'Sample '+i,country:{code:'TH'}}));
  const insert=db.prepare('INSERT INTO cities VALUES(?,?,?,?,?)');
  for(const c of cities)insert.run(c.slug,c.slug,c.name,'TH',700);
  // Existing canonical URL identity must survive bulk source registration.
  db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?,?)').run('canonical:first','https://costcompass.net/living/cities/sample-0','CostCompass','Already imported','dataset','CC-BY-4.0','2026-10-01');
  const csv=[csvHeader,...cities.flatMap(c=>Array.from({length:30},(_,i)=>[
    c.slug,c.name,'TH','Thailand','food','food_sample_'+i,'食品样本“'+i+'” / 1kg','item','5.25','5','6','2',
    '2026-10-13','2026-10-13','商店 A; Shop B','https://costcompass.net/living/cities/'+c.slug,
  ].join(',')))].join('\n');
  const sheetRows=[...estatRows.filter(r=>r.L!=='食料'||r.N==='44659')];
  const values=[],index=new Map();
  const xmlRows=sheetRows.map((r,i)=>'<row r="'+(i+1)+'">'+Object.entries(r).map(([col,val])=>{
    if(!index.has(val)){index.set(val,values.length);values.push(val);}
    return '<c r="'+col+(i+1)+'" t="s"><v>'+index.get(val)+'</v></c>';
  }).join('')+'</row>').join('');
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const workbook=smallZip({'xl/sharedStrings.xml':`<sst xmlns="${ns}">${values.map(v=>'<si><t>'+v+'</t></si>').join('')}</sst>`,
    'xl/worksheets/sheet1.xml':`<worksheet xmlns="${ns}"><sheetData>${xmlRows}</sheetData></worksheet>`});
  const ecb="<name>European Central Bank</name><Cube time='2026-10-16'><Cube currency='USD' rate='1.1253'/><Cube currency='CNY' rate='7.524'/><Cube currency='JPY' rate='177.82'/></Cube>";
  const options={now:'2026-10-18T00:00:00Z',fetcher:async url=>new Response(url.includes('prices.csv')?csv:url.includes('cities.json')?JSON.stringify({...catalog,cities}):url.includes('file-download')?workbook:url.includes('e-stat')?'<a href="/stat-search/file-download?statInfId=000040409815&fileKind=0">Excel</a>':ecb)};
  let calls=0,maxBytes=0;const original=env.DB.prepare;
  const wrapped=(sql,args=[])=>({bind(...v){return wrapped(sql,v)},
    async all(){check(sql,args);return original(sql).bind(...args).all()},
    async first(){check(sql,args);return original(sql).bind(...args).first()},
    async run(){check(sql,args);return original(sql).bind(...args).run()},
  });
  function check(sql,args){
    calls++;assert.ok(calls<50,'D1 statement limit includes statements within batches');
    assert.ok(Buffer.byteLength(sql)<100000);assert.ok(args.length<=100);
    for(const arg of args)if(typeof arg==='string'){const n=Buffer.byteLength(arg);maxBytes=Math.max(maxBytes,n);assert.ok(n<=90000,'UTF-8 parameter bytes');}
  }
  env.DB.prepare=wrapped;
  const first=await syncCosts(env,options),fx=await syncFx(env,options);
  assert.equal(first.costcompass.ok,true);assert.equal(first.estat.ok,true);
  assert.equal(first.costcompass.inserted,4590);assert.equal(fx.inserted,3);
  assert.ok(maxBytes>80000,'exercise real chunk boundary');assert.ok(calls<40);
  const saved=db.prepare("SELECT * FROM cost_observations WHERE city_id='sample-0' LIMIT 1").get();
  assert.equal(saved.source_id,'canonical:first');assert.equal(saved.amount,5.25);
  assert.ok(saved.label.startsWith('食品样本“'));assert.deepEqual(JSON.parse(saved.detail).original_publishers,['商店 A','Shop B']);
  assert.equal(JSON.parse(saved.quality_flags).length,0);assert.equal(saved.household_size,null);
  const sourceCount=db.prepare("SELECT COUNT(*) n FROM sources WHERE url='https://costcompass.net/living/cities/sample-0'").get().n;
  assert.equal(sourceCount,1);
  const correctedSource=db.prepare("SELECT title,accessed_at FROM sources WHERE id='canonical:first'").get();
  assert.equal(correctedSource.title,'CostCompass — Sample 0 公开单项报价样本');
  assert.equal(correctedSource.accessed_at,'2026-10-01');
  calls=0;
  const repeat=await syncCosts(env,options);const repeatFx=await syncFx(env,options);
  assert.equal(repeat.costcompass.inserted,0);assert.equal(repeat.estat.inserted,0);assert.equal(repeatFx.inserted,0);
  assert.ok(calls<40);assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  db.close();
});
