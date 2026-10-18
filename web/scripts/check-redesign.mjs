import {readFile,writeFile} from 'node:fs/promises';
import {webkit} from '../.data/browser/node_modules/playwright/index.mjs';
const browser=await webkit.launch({headless:true});
try{const context=await browser.newContext({bypassCSP:true});const page=await context.newPage();const suite=new Function('return ('+(await readFile('scripts/browser-check.js','utf8')).trim().replace(/;$/,'')+')')();const report={engine:'WebKit',version:browser.version(),...await suite(page)};await writeFile('.data/ux-redesign-2026-10-18/interactions.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}finally{await browser.close();}
