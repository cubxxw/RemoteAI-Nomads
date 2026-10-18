// Browser evidence for the results-first redesign. Uses the project's optional QA runtime.
import { mkdir, writeFile } from 'node:fs/promises';
import { webkit } from '../.data/browser/node_modules/playwright/index.mjs';

const directory = '.data/ux-redesign-2026-10-18';
const phase = process.argv.includes('--baseline') ? 'before' : 'after';
await mkdir(directory, { recursive: true });
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ bypassCSP: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
const routes = ['/', '/cities/chiang-mai/', '/cities/tokyo/', '/compare/', '/compare/chiang-mai-vs-penang/', '/countries/', '/countries/vn/', '/countries/np/', '/countries/aq/', '/guides/', '/guides/first-month/', '/about/', '/not-a-real-place/'];
const report = { phase, engine: 'WebKit', version: browser.version(), routes: [], errors };
try {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of routes) {
      const response = await page.goto('http://127.0.0.1:8787' + path);
      await page.locator('h1').waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].filter(image => image.getBoundingClientRect().top < innerHeight).map(image => image.decode().catch(() => {})));
      });
      const metrics = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector)?.getBoundingClientRect().toJSON() || null;
        return {
          title: document.title,
          overflow: document.documentElement.scrollWidth > innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          firstRow: rect('.ranking-row'),
          h1: { text: document.querySelector('h1').textContent, size: getComputedStyle(document.querySelector('h1')).fontSize, weight: getComputedStyle(document.querySelector('h1')).fontWeight },
          header: rect('.nav-inner'), footer: rect('footer'), main: rect('main'),
          visibleBrokenImages: [...document.images].filter(image => image.getBoundingClientRect().top < innerHeight && (!image.complete || !image.naturalWidth)).map(image => image.src),
          canonical: document.querySelector('link[rel=canonical]')?.href,
          robots: document.querySelector('meta[name=robots]')?.content,
        };
      });
      let violations = [];
      if (phase === 'after' && [390,1440].includes(width)) {
        await page.addScriptTag({ path: '.data/a11y/node_modules/axe-core/axe.min.js' });
        violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type:'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } })).violations.map(item => ({id:item.id, impact:item.impact, nodes:item.nodes.map(node => ({target:node.target, summary:node.failureSummary}))})));
      }
      const name = (path === '/' ? 'ranking' : path.replace(/^\//,'').replace(/\/$/,'').replaceAll('/','-'));
      if ([390,1440].includes(width)) await page.screenshot({path:`${directory}/${phase}-${name}-${width}.png`});
      report.routes.push({ path, width, status: response.status(), ...metrics, violations });
    }
  }
} finally {
  await browser.close();
  await writeFile(`${directory}/${phase}-layout.json`, JSON.stringify(report,null,2));
}
const failures=report.routes.filter(row=>row.overflow||row.visibleBrokenImages.length||row.violations.length);
console.log(JSON.stringify({phase,pages:report.routes.length,errors,failures:failures.map(row=>({path:row.path,width:row.width,overflow:row.overflow,images:row.visibleBrokenImages,violations:row.violations}))},null,2));
if(phase==='after' && (failures.length||errors.length))process.exitCode=1;
