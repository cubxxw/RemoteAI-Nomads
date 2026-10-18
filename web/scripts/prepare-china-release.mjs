// Prepare a reviewable additive production patch and a matching public snapshot.
import assert from 'node:assert/strict';
import {DatabaseSync,backup} from 'node:sqlite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chinaReferencePlan} from './import-china-references.mjs';
import {syncCostCompass,parseCsv} from '../src/cost-sync.js';

const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'.data/deploy/china-20261018');
await mkdir(out,{recursive:true});
const sourceOption=process.argv.find(arg=>arg.startsWith('--source='))?.slice(9);
const original=new DatabaseSync(resolve(root,sourceOption||'.data/release/published.sqlite'),{readOnly:true});
const target=resolve(out,'after.sqlite');
await backup(original,target);
const db=new DatabaseSync(target);db.exec('PRAGMA foreign_keys=ON');
if(!db.prepare("SELECT name FROM sqlite_master WHERE name='geo_areas'").get())db.exec(await readFile(resolve(root,'migrations/0005_regional_references.sql'),'utf8'));
const plan=await chinaReferencePlan();db.exec(plan.sql);
const catalog=JSON.parse(await readFile(resolve(root,'.data/china-source-probe/costcompass-cities.json'),'utf8'));
catalog.cities=catalog.cities.filter(c=>c.country.code==='CN');
const checked='2026-10-18',catalogId='costcompass:china-catalog';
db.prepare('INSERT OR IGNORE INTO sources(id,url,publisher,title,kind,license,accessed_at) VALUES(?,?,?,?,?,?,?)').run(catalogId,'https://costcompass.net/data/cities.json','CostCompass','中国大陆城市目录与城市级坐标','dataset','CC-BY-4.0',checked);
const sourceId=db.prepare('SELECT id FROM sources WHERE url=?').get('https://costcompass.net/data/cities.json').id;
for(const photo of JSON.parse(await readFile(resolve(root,'data/china-destinations.json'),'utf8'))){
  const remote=catalog.cities.find(c=>c.slug===photo.slug);assert.ok(remote);
  const wiki=photo.wiki_coordinates[0];assert.ok(Math.abs(wiki.lat-remote.latitude)<0.1&&Math.abs(wiki.lon-remote.longitude)<0.1,'City photo identity mismatch');
  const id='city:'+photo.slug;
  db.prepare(`INSERT OR IGNORE INTO cities(id,country_id,slug,name_zh,name_en,region,summary,caveat,budget_basis,publication_status,checked_at,photo_url,photo_credit,photo_source)
    VALUES(?,'CN',?,?,?,'亚洲',?,'按具体房型与租期核对价格；单项报价不构成月总预算。','暂无同口径完整月预算','published',?,?,?,?)`).run(id,photo.slug,photo.name_zh,photo.name_en,'城市住房与日常消费样本可查；按你的住法组合预算。',checked,photo.photo_url,photo.photo_credit,photo.photo_source);
  db.prepare(`INSERT OR IGNORE INTO city_locations(city_id,latitude,longitude,timezone,match_method,source_id,checked_at) VALUES(?,?,?,'Asia/Shanghai','CostCompass CN exact-city identity',?,?)`).run(id,remote.latitude,remote.longitude,sourceId,checked);
  db.prepare(`INSERT OR IGNORE INTO city_entry_conditions(city_id,passport,entry_type,label,detail,evidence_level,checked_at,source_id) VALUES(?,'CN','domestic','境内','中国大陆目的地；具体证件与住宿登记按个人情况办理。','country_identity',?,?)`).run(id,checked,sourceId);
}
const prepare=(sql,args=[])=>({bind(...values){return prepare(sql,values);},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:Number(db.prepare(sql).run(...args).changes)}};}});
const csv=await readFile(resolve(root,'.data/china-source-probe/costcompass-prices.csv'),'utf8');
// Preserve the original source bytes; the existing importer country-matches and keeps each unit.
const costs=await syncCostCompass({DB:{prepare}},{now:'2026-10-18T15:09:00Z',fetcher:async url=>new Response(String(url).endsWith('.csv')?csv:JSON.stringify(catalog))});
assert.equal(costs.cities_with_prices,4);assert.equal(costs.observations,20);
const q=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+v.replaceAll("'","''")+"'";
const tables=['sources','cities','city_locations','city_entry_conditions','cost_observations','geo_areas','city_geo_areas','regional_reference_observations'];
let sql='';const changes={};
for(const table of tables){
 const existing=original.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
 const info=db.prepare('PRAGMA table_info('+table+')').all(),keys=info.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
 const identity=r=>JSON.stringify(keys.map(k=>r[k]));
 const before=new Map(existing?original.prepare('SELECT * FROM '+table).all().map(r=>[identity(r),r]):[]);
 const added=db.prepare('SELECT * FROM '+table).all().filter(r=>!before.has(identity(r)));
 for(const row of added)sql+='INSERT OR IGNORE INTO '+table+' ('+Object.keys(row).join(',')+') VALUES ('+Object.values(row).map(q).join(',')+');\n';
 changes[table]=added.length;
}
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
assert.equal(JSON.stringify(original.prepare('SELECT * FROM city_scores ORDER BY city_id').all()),JSON.stringify(db.prepare('SELECT * FROM city_scores ORDER BY city_id').all()),'Scores must remain unchanged');
const beforeBudgets=original.prepare('SELECT id,budget_amount,budget_currency FROM cities ORDER BY id').all();
for(const row of beforeBudgets)assert.deepEqual(db.prepare('SELECT id,budget_amount,budget_currency FROM cities WHERE id=?').get(row.id),row);
const publication=JSON.parse(await readFile(resolve(root,'.data/release/publication.json'),'utf8'));
for(const table of tables)publication.rows[table]=db.prepare('SELECT count(*) n FROM '+table).get().n;
publication.snapshot_date=checked;delete publication.public_seed_sha256;
await writeFile(resolve(out,'publication.json'),JSON.stringify(publication,null,2)+'\n');
await writeFile(resolve(out,'china-patch.sql'),sql,{mode:0o600});
const summary={additions:changes,cities:db.prepare("SELECT count(*) n FROM cities WHERE country_id='CN'").get().n,regional:plan.summary,prices:costs.observations,original_budgets_unchanged:true,original_scores_unchanged:true};
await writeFile(resolve(out,'plan.json'),JSON.stringify(summary,null,2)+'\n');
db.close();original.close();console.log(JSON.stringify(summary,null,2));
