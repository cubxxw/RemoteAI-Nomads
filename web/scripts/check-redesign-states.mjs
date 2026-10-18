import {webkit} from '../.data/browser/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await webkit.launch({headless:true});const report={states:[],storageDenied:false};
try{
 const context=await browser.newContext({bypassCSP:true});await context.addInitScript(()=>{if(navigator.clipboard)navigator.clipboard.writeText=async()=>{throw new Error('QA clipboard unavailable');};});const page=await context.newPage();
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const state of ['filter','weights','command','share','agent','map',...(width===390?['navigation']:[])]){
   await page.goto('http://127.0.0.1:8787/?qa=1');await page.waitForFunction(()=>window.__nomadsMetrics?.updates>0);
   if(state==='filter')await page.locator('#toggle-filters').click();
   if(state==='weights')await page.locator('#weights-toggle').click();
   if(state==='command'){await page.keyboard.press('Meta+k');await page.locator('#command-search').fill('签证');}
   if(state==='share')await page.locator('#share-ranking').click();
   if(state==='agent')await page.locator('[data-open-agent]').click();
   if(state==='map')await page.locator('#toggle-map').click();
   if(state==='navigation')await page.locator('#nav-toggle').click();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));});
   await page.addScriptTag({path:'.data/a11y/node_modules/axe-core/axe.min.js'});
   const violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   await page.screenshot({path:`.data/ux-redesign-2026-10-18/state-${state}-${width}.png`});
   report.states.push({state,width,overflow,violations});
  }
 }
 const blocked=await browser.newContext();await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Unavailable','SecurityError');}});});const p=await blocked.newPage();const errors=[];p.on('pageerror',error=>errors.push(error.message));await p.goto('http://127.0.0.1:8787/');await p.waitForFunction(()=>window.__nomadsMetrics?.updates>0);await p.locator('[data-preset="budget"]').click();assert.equal(await p.locator('#weight-cost').inputValue(),'55');assert.equal(errors.length,0);report.storageDenied=true;
}finally{await browser.close();await writeFile('.data/ux-redesign-2026-10-18/states.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));assert.ok(report.states.every(state=>!state.overflow&&!state.violations.length));
