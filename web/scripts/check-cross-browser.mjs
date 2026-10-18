// Optional local QA dependencies live under .data/browser and .data/a11y.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {webkit} from '../.data/browser/node_modules/playwright/index.mjs';
const browser=await webkit.launch({headless:true});
try{
 const context=await browser.newContext({bypassCSP:true});const page=await context.newPage();
 const suite=new Function('return ('+(await readFile('scripts/browser-check.js','utf8')).trim().replace(/;$/,'')+')')();
 const report={engine:'WebKit',version:browser.version(),regression:await suite(page),accessibility:[]};
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:8787/');
  await page.locator('[data-open-agent]').click();await page.locator('#nomad-agent').waitFor({state:'visible'});
  await page.locator('#agent-question').fill('跨引擎草稿');await page.keyboard.press('Shift+Enter');await page.keyboard.type('第二行');
  const draft=await page.locator('#agent-question').inputValue();assert.equal(draft,'跨引擎草稿\n第二行');
  await page.keyboard.press('Escape');await page.locator('#nomad-agent').waitFor({state:'hidden'});assert.ok(await page.locator('[data-open-agent]').evaluate(el=>el===document.activeElement));
  await page.locator('[data-open-agent]').click();await page.locator('#nomad-agent').waitFor({state:'visible'});assert.equal(await page.locator('#agent-question').inputValue(),draft);
  await page.addScriptTag({path:'.data/a11y/node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(async()=>(await axe.run(document.querySelector('#nomad-agent'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','best-practice']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)})));
  report.accessibility.push({width,violations});assert.equal(violations.length,0);await page.keyboard.press('Escape');
 }
 await context.close();const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await touch.newPage();await p.goto('http://127.0.0.1:8787/');await p.waitForFunction(()=>window.__nomadsMetrics?.updates>0);await p.locator('[data-preset="budget"]').tap();await p.locator('#weights-toggle').tap();assert.equal(await p.locator('#weight-cost').inputValue(),'55');await p.locator('[data-close-weights]').last().tap();await p.locator('#toggle-filters').tap();await p.locator('[data-filter-input="budget"]').selectOption('1500');await p.locator('[data-close-filters]').last().tap();assert.ok((await p.locator('#active-ranking-filters').innerText()).includes('1,500'));assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.emulated_touch=true;
 await touch.close();await writeFile('.data/cross-browser-validation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
