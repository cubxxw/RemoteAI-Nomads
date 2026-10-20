import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonBudget,comparisonArticle,renderComparisonArticle} from '../src/comparison-article.js';
import {readFile} from 'node:fs/promises';
test('comparison budget preserves quote scope, zero input and an unknown high-season total',()=>{
 const cm=comparisonBudget('chiang-mai'),pg=comparisonBudget('penang'),dn=comparisonBudget('da-nang');
 assert.equal(cm.totalNative,32400);assert.equal(pg.totalNative,6920);assert.equal(dn.totalNative,25300000);
 assert.deepEqual([cm.totalDisplay,pg.totalDisplay,dn.totalDisplay],[6479,11381,6527]);
 assert.equal(comparisonBudget('da-nang',{season:'peak'}).totalNative,null);
 const free=comparisonBudget('da-nang',{housingNative:0});assert.equal(free.items.find(x=>x.id==='housing').amountNative,0);assert.equal(free.items.find(x=>x.id==='housing').kind,'user');
});
test('curated comparisons render a readable article and exactly one H1 without promoting arbitrary pairs',async()=>{
 const cities=JSON.parse(await readFile(new URL('../public/published-pages/rankings.json',import.meta.url),'utf8'));
 for(const slug of ['chiang-mai-vs-penang','chiang-mai-vs-da-nang']){
  const [a,b]=slug.split('-vs-').map(s=>cities.find(c=>c.slug===s));const article=comparisonArticle(slug),html=renderComparisonArticle(article,a,b,12);
  assert.equal((html.match(/<h1>/g)||[]).length,1);assert.ok(html.includes('data-reader-section'));assert.ok(html.includes('class="editorial-budget"'));
  assert.match(html,/历史月参考/);assert.match(html,/<figure\b[^>]*editorial-quote/);assert.doesNotMatch(html,/\{\{|\/(?:Users\/|var\/folders\/)/);
 }
 assert.equal(comparisonArticle('kuala-lumpur-vs-tokyo'),null);
});
