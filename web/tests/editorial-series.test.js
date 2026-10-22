import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {prepareEditorialSeries,validateEditorialArticles,renderEditorialArticle,chineseLength} from '../scripts/prepare-editorial-series.mjs';
import {createArticleCatalog,publishedArticles,guideCardsHTML} from '../src/article-catalog.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sample=number=>({number,slug:number===6?'first-month':'sample-'+number,title:'试住 & 算账',summary:'算清订房前后两笔钱。',category:number<=10?'start':number<=20?'budget':number<=30?'season':number<=40?'permission':'compare',citySlugs:[],relatedSlugs:['monthly-budget-5000','beijing-time-remote-work'],lede:'先过一个工作日。',sections:Array.from({length:5},(_,i)=>({id:'part-'+i,title:'问题'+i,html:'<p>'+('这是预算假设，需要按日期和房型重新询价。'.repeat(18))+'</p>'})),sources:[{id:'one',title:'来源一',url:'https://example.com/one',checkedOn:'2026-10-22',readStatus:'read',scope:'正文',note:'范围一'},{id:'two',title:'来源二',url:'https://example.com/two',checkedOn:'2026-10-20',readStatus:'reused',scope:'原指南',note:'范围二'}],image:{file:'dali-north-gate.webp',alt:'大理城门',captionHtml:'署名与<a href="https://example.com/license">许可</a>'}});
const complete=()=>Array.from({length:46},(_,i)=>sample(i+5));

test('series preparation rejects missing subjects, duplicates and thin copy before output',()=>{
 assert.equal(validateEditorialArticles(complete()).length,46);
 assert.throws(()=>validateEditorialArticles(complete().slice(1)),/All 46/);
 const duplicate=complete();duplicate[1].number=5;assert.throws(()=>validateEditorialArticles(duplicate),/Duplicate/);
 const thin=complete();thin[0].sections[0].html='';assert.throws(()=>validateEditorialArticles(thin));
 const short=complete();short[0].sections=short[0].sections.map(s=>({...s,html:'<p>很短。</p>'}));assert.throws(()=>validateEditorialArticles(short),/substantive/);
});
test('source renderer guards executable fragments and wide tables while escaping metadata',()=>{
 for(const html of ['<script>alert(1)</script>','<p onclick="alert(1)">文</p>','<a href="javascript:alert(1)">文</a>','<table><tr><td>一</td><td>二</td><td>三</td></tr></table>']){
  const input=complete();input[0].sections[0].html=html;assert.throws(()=>validateEditorialArticles(input));
 }
 const a=sample(5);a.title='<script> & "标题"';
 const html=renderEditorialArticle(a,publishedArticles());
 assert.match(html,/<title>&lt;script&gt; &amp; &quot;标题&quot;<\/title>/);
 assert.match(html,/<details class="mobile-chapters"/);
 assert.match(html,/沿用核读 2026-10-20/);
 assert.match(html,/href="monthly-budget-5000.html"/);
 assert.match(html,/\\u003cscript>/);
});
test('series navigation groups numbered guides and rejects duplicate sequence numbers',()=>{
 const entry={...publishedArticles().find(e=>e.kind==='guide'),topic:true,seriesNumber:5,seriesCategory:'start'};
 const registry=createArticleCatalog({schemaVersion:1,entries:[entry]});
 assert.match(registry.guideCardsHTML(),/guide-series-start/);
 assert.throws(()=>createArticleCatalog({schemaVersion:1,entries:[entry,{...entry,slug:'other-guide',path:'/guides/other-guide/',assetPath:'/city-guides/other-guide.html'}]}),/Duplicate article series number/);
 assert.throws(()=>createArticleCatalog({schemaVersion:1,entries:[{...entry,seriesNumber:51}]}),/Invalid article series/);
});
test('a city keeps six article cards and exposes the remaining exact city links in native details',()=>{
 const base=publishedArticles().find(e=>e.kind==='guide');
 const entries=Array.from({length:9},(_,i)=>({...base,slug:'city-topic-'+i,path:'/guides/city-topic-'+i+'/',assetPath:'/city-guides/city-topic-'+i+'.html',citySlugs:['dali'],title:'标题'+i}));
 const registry=createArticleCatalog({schemaVersion:1,entries});
 const html=registry.relatedArticlesHTML('dali');
 assert.equal((html.match(/class="city-article-card"/g)||[]).length,6);
 assert.match(html,/<details class="city-article-more"><summary>还有3篇相关文章<\/summary>/);
 for(let i=0;i<9;i++)assert.match(html,new RegExp('/guides/city-topic-'+i+'/'));
 assert.equal(registry.relatedArticlesHTML('da'), '');
});
test('Pokhara keeps the old listing as dated history outside the current housing allowance sources',async()=>{
 const html=await readFile(resolve(root,'content/city-guides/pokhara-monthly-budget.html'),'utf8');
 const data=JSON.parse(html.match(/id="guide-config">([\s\S]*?)<\/script>/)[1]);
 assert.equal(data.config.sources['NP-EP-1242'].publishedAt,'2019-12-23');
 const place=data.places.find(p=>p.id==='lakeside-flat-1242');
 assert.deepEqual(place.sourceIds,['NP-EP-1242']);
 assert.match(place.name,/2019历史挂牌/);
 for(const tier of Object.values(data.config.tiers))assert.ok(!tier.housing.standard.sourceIds.includes('NP-EP-1242'));
 assert.match(html,/2019年旧挂牌不支持本期估价/);
 assert.doesNotMatch(html,/差(?:出)?近三倍/);
});
test('all fifty subjects have current rendered sources, distinct URLs and live source/chapter links',async()=>{
 const articles=await prepareEditorialSeries({root});
 const series=publishedArticles().filter(e=>e.seriesNumber).sort((a,b)=>a.seriesNumber-b.seriesNumber);
 assert.deepEqual(series.map(a=>a.seriesNumber),Array.from({length:50},(_,i)=>i+1));
 assert.equal(new Set(series.map(a=>a.path)).size,50);
 assert.equal(series.find(e=>e.seriesNumber===6).slug,'first-month');
 for(const category of ['start','budget','season','permission','compare'])assert.match(guideCardsHTML(),new RegExp('id="guide-series-'+category+'"'));
 const db=new DatabaseSync(resolve(root,'.data/release/published.sqlite'),{readOnly:true});
 try {for(const a of articles){
  const html=await readFile(resolve(root,'content/city-guides',a.slug+'.html'),'utf8');
  assert.ok(chineseLength(a.lede+a.sections.map(s=>s.html).join(''))>=1000,a.slug);
  assert.equal((html.match(/<h1[\s>]/g)||[]).length,1);
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  for(const m of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(m[1]),'Missing anchor '+m[1]+' in '+a.slug);
  for(const slug of a.citySlugs)assert.ok(db.prepare("SELECT 1 FROM cities WHERE slug=? AND publication_status='published'").get(slug),'Unknown published city: '+slug+' in '+a.slug);
 }} finally {db.close();}
});
test('the reviewed source JSON fingerprints match the explicit publication receipt',async()=>{
 const receipt=JSON.parse(await readFile(resolve(root,'content/city-guides/publication.json'),'utf8')).publication.series50Batch;
 assert.equal(receipt.approved,true);
 assert.equal(receipt.sourceFiles.length,3);
 for(const source of receipt.sourceFiles){
  assert.match(source.path,/^content\/editorial-50\/(?:start-budget|season-compare|permission-tools)\.json$/);
  const actual=createHash('sha256').update(await readFile(resolve(root,source.path))).digest('hex');
  assert.equal(actual,source.sha256,'Reviewed editorial source changed: '+source.path);
 }
});
