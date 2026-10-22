import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {cityGuideResponse} from '../src/city-guide-pages.js';
const html='<!doctype html><html lang="zh-CN"><head><meta name="robots" content="index,follow"><link rel="canonical" href="https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/"><link rel="stylesheet" href="/nomads/guide-assets/guide.css"></head><main><h1>清迈旅居一个月要花多少钱</h1></main></html>';
const env={SITE_ORIGIN:'https://roamorrow.com/nomads',PREVIEW:'false',DB:{prepare(){throw Error('Guide must not query D1');}},ASSETS:{async fetch(r){assert.equal(new URL(r.url).pathname,'/city-guides/chiang-mai-monthly-budget.html');return new Response(html,{headers:{'Content-Type':'text/html','X-Robots-Tag':'noindex'}});}}};
test('published city guide is indexable and can load without D1',async()=>{
 const r=await worker.fetch(new Request('https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/'),env,{waitUntil(){}});
 assert.equal(r.status,200);assert.equal(r.headers.get('X-Robots-Tag'),'index, follow');const body=await r.text();assert.match(body,/content="index,follow"/);assert.doesNotMatch(body,/noindex/);assert.match(body,/清迈旅居/);assert.match(r.headers.get('Content-Security-Policy'),/style-src 'self' 'unsafe-inline'/);assert.doesNotMatch(r.headers.get('Content-Security-Policy'),/script-src[^;]*unsafe-inline/);
});
test('budget scenario query keeps canonical but does not index duplicate variants',async()=>{
 const r=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/?nights=7&currency=USD'),env);assert.equal(r.status,200);assert.match(await r.text(),/content="noindex,follow"/);assert.equal(r.headers.get('Cache-Control'),'no-store');
});
test('HEAD and preview do not invent a published body or index permission',async()=>{
 const head=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/',{method:'HEAD'}),env);assert.equal(head.status,200);assert.equal(await head.text(),'');
 const preview=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/'),{...env,PREVIEW:'true'});assert.match(await preview.text(),/noindex,follow/);
});
test('unknown guide falls through and a missing registered artifact returns honest 503',async()=>{
 assert.equal(await cityGuideResponse(new Request('https://roamorrow.com/guides/not-known/'),env),null);
 const r=await cityGuideResponse(new Request('https://roamorrow.com/guides/chiang-mai-monthly-budget/'),{...env,ASSETS:{async fetch(){return new Response('missing',{status:404});}}});assert.equal(r.status,503);
});

// Topic guides (2026-10-22) stay on the same database-independent artifact route.
import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publishedArticles} from '../src/article-catalog.js';
const SOURCES=resolve(dirname(fileURLToPath(import.meta.url)),'../content/city-guides');
const topicSlugs=['november-nomad-destinations','monthly-budget-5000','beijing-time-remote-work','chinese-passport-long-stay'];
test('all fifty series routes load the real approved HTML independently of D1',async()=>{
 const articles=publishedArticles().filter(a=>a.seriesNumber);
 assert.equal(articles.length,50);
 const assetEnv={SITE_ORIGIN:'https://roamorrow.com/nomads',PREVIEW:'false',DB:{prepare(){throw Error('Series articles must not query D1');}},ASSETS:{async fetch(r){
  const path=new URL(r.url).pathname;
  const article=articles.find(a=>a.assetPath===path);assert.ok(article,'Unexpected asset '+path);
  return new Response(await readFile(resolve(SOURCES,'../../public',path.slice(1)),'utf8'),{headers:{'Content-Type':'text/html'}});
 }}};
 for(const article of articles){
  const response=await worker.fetch(new Request('https://roamorrow.com/nomads'+article.path),assetEnv,{waitUntil(){}});
  assert.equal(response.status,200,article.slug);
  assert.equal(response.headers.get('X-Robots-Tag'),'index, follow');
  const body=await response.text();assert.ok(body.includes(article.title),article.slug);
  assert.ok(body.includes('<link rel="canonical" href="https://roamorrow.com/nomads'+article.path+'">'));
  assert.doesNotMatch(body,/noindex|\/Users\//);
 }
});
const topicHTML=slug=>'<!doctype html><html lang="zh-CN"><head><meta name="robots" content="index,follow"><link rel="canonical" href="https://roamorrow.com/nomads/guides/'+slug+'/"></head><main><h1>专题</h1></main></html>';
const topicEnv=slug=>({SITE_ORIGIN:'https://roamorrow.com/nomads',PREVIEW:'false',DB:{prepare(){throw Error('Topic guide must not query D1');}},ASSETS:{async fetch(r){assert.equal(new URL(r.url).pathname,'/city-guides/'+slug+'.html');return new Response(topicHTML(slug),{headers:{'Content-Type':'text/html','X-Robots-Tag':'noindex'}});}}});
test('topic guides render from approved artifacts without D1 and keep preview/query variants unindexable',async()=>{
 for(const slug of topicSlugs){
  const r=await worker.fetch(new Request('https://roamorrow.com/nomads/guides/'+slug+'/'),topicEnv(slug),{waitUntil(){}});
  assert.equal(r.status,200);assert.equal(r.headers.get('X-Robots-Tag'),'index, follow');assert.match(await r.text(),/content="index,follow"/);
  const query=await cityGuideResponse(new Request('https://roamorrow.com/guides/'+slug+'/?nights=7'),topicEnv(slug));
  assert.match(await query.text(),/content="noindex,follow"/);assert.equal(query.headers.get('Cache-Control'),'no-store');
  const preview=await cityGuideResponse(new Request('https://roamorrow.com/guides/'+slug+'/'),{...topicEnv(slug),PREVIEW:'true'});
  assert.match(await preview.text(),/noindex,follow/);
 }
 assert.equal(await cityGuideResponse(new Request('https://roamorrow.com/guides/not-a-topic/'),topicEnv('not-a-topic')),null);
});
test('sitemap lists every topic guide with its reviewed update date',async()=>{
 const db={prepare(){return{bind(){return this;},async all(){return{results:[]};},async first(){return null;}};}};
 const r=await worker.fetch(new Request('https://roamorrow.com/nomads/sitemap.xml'),{SITE_ORIGIN:'https://roamorrow.com/nomads',PREVIEW:'false',DB:db,ASSETS:null},{waitUntil(){}});
 assert.equal(r.status,200);const xml=await r.text();
 for(const slug of topicSlugs){
  assert.ok(xml.includes('<loc>https://roamorrow.com/nomads/guides/'+slug+'/</loc>'),'sitemap is missing '+slug);
  assert.ok(xml.includes('<loc>https://roamorrow.com/nomads/guides/'+slug+'/</loc><lastmod>2026-10-22</lastmod>'),'topic lastmod '+slug);
 }
 assert.ok(xml.includes('<loc>https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/</loc>'));
});
test('topic sources keep mobile chapter semantics, one H1, live contents anchors and dated sources without JavaScript',async()=>{
 for(const slug of topicSlugs){
  const html=await readFile(join(SOURCES,slug+'.html'),'utf8');
  assert.match(html,/<html lang="zh-CN">/);
  assert.match(html,/<meta name="viewport" content="width=device-width,initial-scale=1">/);
  assert.equal((html.match(/<h1[\s>]/g)||[]).length,1,'exactly one h1: '+slug);
  assert.match(html,/<aside class="toc" aria-label="本页目录">/);
  const details=html.match(/<details class="mobile-chapters" data-mobile-chapters><summary>[\s\S]*?<\/summary><nav id="chapter-panel" class="chapter-panel topic-chapter-panel" data-chapter-panel aria-label="章节">([\s\S]*?)<\/nav><\/details>/);
  assert.ok(details,'native details chapter menu: '+slug);
  const tocLinks=[...html.matchAll(/<a data-chapter-link href="#([a-z0-9-]+)"/g)].map(m=>m[1]);
  assert.ok(tocLinks.length>=6,'contents lists the sections: '+slug);
  for(const id of new Set(tocLinks)) assert.ok(html.includes('id="'+id+'" data-reader-section'),'contents anchor '+id+' has a section: '+slug);
  assert.equal(tocLinks.length,(html.match(/<section id="[a-z0-9-]+" data-reader-section/g)||[]).length*2,'desktop and mobile contents stay in sync: '+slug);
  assert.match(html,/<h2>来源与核读日期<\/h2>[\s\S]*?核读/);
  assert.ok(topicSlugs.filter(other=>other!==slug).every(other=>html.includes('href="'+other+'.html"')),'related four topics: '+slug);
  assert.ok(/href="(?:chiang-mai|hanoi|dali|penang|kuala-lumpur|pokhara|baku|lisbon|madrid|ubud)-monthly-budget\.html"/.test(html),'links existing city guides: '+slug);
  assert.equal((html.match(/noindex/g)||[]).length,1,'only the preview robots meta may mention noindex: '+slug);
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/g)) {
   const header = table[0].match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || '';
   assert.equal((header.match(/<th\b/g) || []).length, 2, 'topic table pairs a subject with conditions: '+slug);
  }
  assert.match(html,/<meta property="og:image" content="https:\/\/roamorrow.com\/nomads\/assets\/og-topic-/);
 }
});
