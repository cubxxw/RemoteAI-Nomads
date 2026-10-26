import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const {guideShare}=await import('../public/modules/share-guide-model.js').catch(()=>({}));
const html=await readFile(new URL('../content/city-guides/chiang-mai-monthly-budget.html',import.meta.url),'utf8');
const page=JSON.parse(html.match(/<script type="application\/json" id="guide-config">([\s\S]*?)<\/script>/)[1]);
test('guide public image recomputes the scenario without a private housing override',()=>{
 const article={title:'清迈住一个月',summary:'核对住法与费用。'};
 const clean=guideShare(page,article,'https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/?nights=31&currency=CNY');
 const privateURL='https://roamorrow.com/nomads/guides/chiang-mai-monthly-budget/?nights=31&currency=CNY&housing=9876543';
 const card=guideShare(page,article,privateURL);assert.deepEqual(card.facts,clean.facts);assert.equal(card.url.includes('9876543'),false);
 const personal=guideShare(page,article,privateURL,{includePersonal:true});assert.equal(personal.private,true);assert.notDeepEqual(personal.facts,clean.facts);assert.equal(personal.url.includes('housing'),false);assert.match(personal.linkNote,/公开链接/);
});
