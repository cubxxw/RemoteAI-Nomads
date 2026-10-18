import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {webkit} from '../.data/browser/node_modules/playwright/index.mjs';
const browser=await webkit.launch({headless:true});const report=[];
try{const page=await browser.newPage({viewport:{width:390,height:844}});
 for(const [query,code] of [['韩国','KR'],['英国','GB'],['美国','US'],['South Korea','KR'],['UK','GB'],['US','US'],['USA','US'],['UAE','AE'],['Vietnam','VN'],['Czech Republic','CZ']]){
  await page.goto('http://127.0.0.1:8787/countries/');await page.locator('[data-country-search]').fill(query);
  const codes=await page.locator('[data-country-row]:visible').evaluateAll(rows=>rows.map(row=>row.dataset.code));assert.deepEqual(codes,query==='美国'?['US','UM']:[code],query+' directory');
  await page.goto('http://127.0.0.1:8787/?q='+encodeURIComponent(query));await page.waitForFunction(()=>window.__nomadsMetrics?.updates>0);assert.ok(await page.locator('.ranking-row').count()>0,query+' ranking');
  const countryCodes=await page.locator('.ranking-row').evaluateAll(rows=>{const raw=JSON.parse(document.querySelector('#ranking-data').textContent);return [...new Set(rows.map(row=>raw.find(city=>city.slug===row.dataset.city).countryCode))];});assert.deepEqual(countryCodes,[code],query+' ranking country');
  await page.keyboard.press('Meta+k');await page.locator('#command-search').fill(query);const candidates=await page.locator('#command-results a').count();assert.ok(candidates>0,query+' command');await page.keyboard.press('Escape');report.push({query,code,directory:codes,ranking:countryCodes,candidates});
 }
}finally{await browser.close();await writeFile('.data/ux-redesign-2026-10-18/country-search.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({queries:report.length,surfaces:3,passed:true}));
