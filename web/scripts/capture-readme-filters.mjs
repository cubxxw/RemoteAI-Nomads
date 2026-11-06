import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {currentMonth} from '../public/modules/ranking.js';

// Capture public demo data in a fresh browser, never a maintainer's saved view.
const url=new URL(process.argv[2] || 'http://127.0.0.1:8787/');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.protocol==='http:',
  'Use a local public-demo URL, without credentials or private production data.');
assert.ok(!url.username&&!url.password&&!url.search&&!url.hash,'Use the clean local ranking URL.');
const destination=new URL('../../docs/images/ranking-filters.png',import.meta.url);
await mkdir(new URL('.',destination),{recursive:true});
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {});
try {
  const context=await browser.newContext({viewport:{width:1440,height:1040},deviceScaleFactor:1,
    locale:'zh-CN',timezoneId:'Asia/Singapore',reducedMotion:'reduce'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===url.origin ? route.continue() : route.abort());
  // Collapse the introductory artwork so the image focuses on the controls.
  await context.addInitScript(()=>localStorage.setItem('nomads-ranking-visited-v1','true'));
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url.href);
  await page.waitForFunction(()=>window.__nomadsMetrics?.updates>0);
  await page.getByRole('button',{name:'列表',exact:true}).click();
  await page.locator('.ranking-toolbar').scrollIntoViewIfNeeded();
  await page.locator('#toggle-filters').click();
  await page.locator('#rank-filter-popover').waitFor({state:'visible'});
  await page.evaluate(async()=>{
    await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('.ranking-row img')].slice(0,6).map(img=>img.decode().catch(()=>{})));
  });
  assert.match(await page.locator('#ranking-month-context').textContent(),new RegExp(`按${currentMonth()}月历史气候排序.*跟随本月`));
  assert.equal(await page.locator('#filter-month').inputValue(),'');
  assert.equal(await page.locator('#recommended-only').isChecked(),false);
  assert.ok(await page.locator('.ranking-row').count()>0,'The public demo must contain ranked cities.');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  // Always overwrite this same path; README keeps one current screenshot.
  await page.screenshot({path:fileURLToPath(destination)});
  console.log(`Replaced ${fileURLToPath(destination)} (${currentMonth()}月, public local demo).`);
} finally {
  await browser.close();
}
