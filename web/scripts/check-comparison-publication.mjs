import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function validateComparisonPublication(){
 const pub=JSON.parse(await readFile(resolve(ROOT,'content/comparisons/publication.json'),'utf8'));
 assert.equal(pub.approved,true,'Comparison publication review is required');
 assert.ok(pub.approvedOn&&pub.authority&&pub.sourceEdition);
 for(const name of ['data/comparison-articles.json','data/comparison-budgets.json','src/comparison-article.js','public/comparison-article.css']){
  assert.equal(sha(await readFile(resolve(ROOT,name))),pub.files[name],'Reviewed comparison source changed: '+name);
 }
 const data=JSON.parse(await readFile(resolve(ROOT,'data/comparison-articles.json'),'utf8'));
 const assets=new Set();
 for(const a of data.articles){
  assert.ok(a.title&&a.summary&&a.searchTitle&&a.updatedAt&&a.profileKeys.length===2);
  for(const id of a.sourceIds)assert.match(data.sources[id]?.url||'',/^https:\/\//);
  for(const section of a.sections)for(const id of section.links||[])assert.ok(a.sourceIds.includes(id),'Undeclared section source');
  for(const f of [...a.heroFigures,...a.sections.flatMap(s=>s.figures||[])]){
   assert.match(f.src,/^\/(?:comparison-assets|guide-assets\/images|images)\/[a-z0-9-]+\.(?:webp|jpe?g|png)$/);
   assert.match(f.sourceUrl,/^https:\/\//);assert.ok(f.width>0&&f.height>0);
   if(f.kind!=='quote')assert.match(f.licenseUrl||'',/^https:\/\//);
   assets.add('public'+f.src);
  }
  assets.add('public/comparison-assets/og-'+a.slug+'.jpg');
 }
 for(const name of assets){
  assert.equal(sha(await readFile(resolve(ROOT,name))),pub.assets[name],'Reviewed comparison image changed: '+name);
 }
 return {articles:data.articles.length,assets:assets.size,edition:pub.sourceEdition};
}
