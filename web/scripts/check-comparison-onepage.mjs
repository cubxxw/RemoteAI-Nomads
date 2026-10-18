import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {webkit} from '../.data/browser/node_modules/playwright/index.mjs';
const folder='.data/comparison-onepage';await mkdir(folder,{recursive:true});
const browser=await webkit.launch({headless:true});const report={engine:'WebKit',version:browser.version(),layouts:[],errors:[],interaction:{}};
try{
 const context=await browser.newContext({bypassCSP:true});const page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
 await page.goto('http://127.0.0.1:8787/');
 const data=await page.locator('#ranking-data').evaluate(el=>JSON.parse(el.textContent));
 const long=[...data].sort((a,b)=>b.nameEn.length-a.nameEn.length).slice(0,2);
 const missing=data.find(city=>Object.values(city.scores).some(value=>value===null)&&city.months.some(m=>m[1]===null));
 const paths=['/compare/chiang-mai-vs-penang/','/compare/lisbon-vs-tokyo/', '/compare/'+long.map(c=>c.slug).sort().join('-vs-')+'/', '/compare/'+['chiang-mai',missing.slug].sort().join('-vs-')+'/'];
 for(const path of paths){
  for(const [width,height] of [[1440,900],[1280,720],[1024,768],[768,900],[390,844],[320,740]]){
   await page.setViewportSize({width,height});const response=await page.goto('http://127.0.0.1:8787'+path);assert.equal(response.status(),200);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode().catch(()=>{})));});
   const result=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,table:box('.compare-matrix'),left:box('.comparison-city-0'),right:box('.comparison-city-1'),end:box('.comparison-evidence').bottom,rows:document.querySelectorAll('.compare-matrix tbody tr').length,broken:[...document.images].filter(img=>!img.complete||!img.naturalWidth).length};});
   assert.equal(result.overflow,false,path+' overflow '+width);assert.equal(result.broken,0);assert.equal(result.rows,10);
   if(width>=1101){assert.ok(result.left.right<result.table.left&&result.table.right<result.right.left,'cities do not flank matrix');assert.ok(Math.abs((result.table.left+result.table.right)/2-width/2)<1,'matrix not centered');assert.ok(result.end<=height,'main information not within one screen: '+path+' '+height+' end '+result.end);}
   let violations=[];
   if([1440,390].includes(width)){await page.addScriptTag({path:'.data/a11y/node_modules/axe-core/axe.min.js'});violations=await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));assert.equal(violations.length,0,path+' accessibility '+width);}
   if(path===paths[0]||width===1440)await page.screenshot({path:`${folder}/final-${path.split('/')[2]}-${width}.png`});
   report.layouts.push({path,...result,violations});
  }
 }
 await page.goto('http://127.0.0.1:8787/compare/chiang-mai-vs-penang/');
 await page.evaluate(()=>localStorage.setItem('nomads-compare',JSON.stringify([{slug:'chiang-mai',name:'清迈'},{slug:'penang',name:'槟城'}])));await page.reload();await page.waitForFunction(()=>document.querySelector('#compare-tray').hidden);report.interaction.redundantTrayHidden=true;
 const originalMonth=await page.locator('#comparison-month').inputValue();const changed=originalMonth==='1'?'7':'1';
 await page.locator('#comparison-month').selectOption(changed);assert.equal(new URL(page.url()).searchParams.get('month'),changed);const weather=await page.locator('[data-comparison-weather="0"]').innerText();await page.reload();assert.equal(await page.locator('#comparison-month').inputValue(),changed);assert.equal(await page.locator('[data-comparison-weather="0"]').innerText(),weather);report.interaction.monthURLAndReload=true;
 await page.locator('#comparison-month').selectOption('8');await page.goBack();assert.equal(await page.locator('#comparison-month').inputValue(),changed);report.interaction.browserBack=true;
 await page.locator('.comparison-evidence summary').click();assert.ok(await page.locator('.comparison-entry-details').isVisible());await page.addScriptTag({path:'.data/a11y/node_modules/axe-core/axe.min.js'});const expanded=await page.evaluate(async()=>(await axe.run(document)).violations.map(v=>v.id));assert.deepEqual(expanded,[]);report.interaction.expandedEvidence=true;
 await page.evaluate(()=>{window.__printed=0;window.print=()=>window.__printed++;});await page.getByRole('button',{name:'保存为一页，打开打印'}).click();assert.equal(await page.evaluate(()=>window.__printed),1);report.interaction.printOpens=true;
 await page.locator('.comparison-city-0 .comparison-change').click();assert.ok(new URL(page.url()).searchParams.has('b'));assert.equal(await page.locator('[data-pair-select="b"]').inputValue(),'penang');report.interaction.changeCityPreservesOther=true;
 assert.equal(new URL(page.url()).searchParams.get('month'),changed);await page.locator('[data-pair-select="a"]').selectOption('tokyo');await page.locator('[data-compare-form] button[type=submit]').click();await page.waitForURL('**/compare/penang-vs-tokyo/**');assert.equal(await page.locator('#comparison-month').inputValue(),changed);report.interaction.changeCityPreservesMonth=true;
 assert.deepEqual(report.errors,[]);
}finally{await browser.close();await writeFile(`${folder}/checks.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({layouts:report.layouts.length,errors:report.errors,interaction:report.interaction},null,2));
