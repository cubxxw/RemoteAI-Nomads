// Render reviewed editorial source into the existing approved-guide pipeline.
// This command never approves publication hashes or changes the remote database.
import assert from 'node:assert/strict';
import {readFile, writeFile, copyFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://roamorrow.com/nomads';
const DATE = '2026-10-23';
const groups = {start:'选好第一站', budget:'把月账算清楚', season:'按季节安排', permission:'停留与工作时间', compare:'比较与实用工具'};
const firstFour = ['november-nomad-destinations','monthly-budget-5000','beijing-time-remote-work','chinese-passport-long-stay'];
const safeJSON = value => JSON.stringify(value).replace(/</g, '\\u003c');
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text = html => html.replace(/<[^>]*>/g, '').replace(/&[a-z0-9#]+;/gi, '');
export const chineseLength = html => (text(html).match(/[\p{Script=Han}]/gu) || []).length;

export function validateEditorialArticles(articles) {
  const numbers = new Set(), slugs = new Set();
  for (const a of articles) {
    assert.ok(Number.isInteger(a.number) && a.number >= 5 && a.number <= 50, 'Invalid article number');
    assert.ok(!numbers.has(a.number) && !slugs.has(a.slug), 'Duplicate article number or slug');
    numbers.add(a.number); slugs.add(a.slug);
    assert.match(a.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (a.number === 6) assert.equal(a.slug, 'first-month');
    assert.ok(groups[a.category], 'Unknown editorial category');
    for (const key of ['title','summary','lede']) assert.ok(typeof a[key] === 'string' && a[key].trim(), 'Missing ' + key);
    if (a.updatedAt !== undefined) assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(a.updatedAt) && !Number.isNaN(Date.parse(a.updatedAt)) && new Date(a.updatedAt).toISOString().slice(0,10) === a.updatedAt, 'Invalid article update date: ' + a.slug);
    assert.ok(Array.isArray(a.citySlugs) && new Set(a.citySlugs).size === a.citySlugs.length);
    assert.ok(Array.isArray(a.relatedSlugs) && a.relatedSlugs.length >= 2 && new Set(a.relatedSlugs).size === a.relatedSlugs.length && !a.relatedSlugs.includes(a.slug));
    assert.ok(Array.isArray(a.sections) && a.sections.length >= 5);
    const ids = new Set(['sources','related']);
    for (const s of a.sections) {
      assert.match(s.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(!ids.has(s.id), 'Duplicate/reserved section id: ' + a.slug); ids.add(s.id);
      assert.ok(s.title && s.html);
      assert.ok(!/<\/?(?:script|style|iframe|form|input|button|h1|h2)\b|\bon\w+\s*=|javascript\s*:/i.test(s.html), 'Executable or structural body markup: ' + a.slug);
      for (const table of s.html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
        for (const row of table[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) assert.ok((row[1].match(/<t[dh]\b/gi) || []).length <= 2, 'Use at most two table columns: ' + a.slug);
      }
    }
    assert.ok(chineseLength(a.lede + a.sections.map(s=>s.html).join('')) >= 1000, 'Article needs substantive copy: ' + a.slug);
    assert.ok(Array.isArray(a.sources) && a.sources.length >= 2);
    assert.equal(new Set(a.sources.map(s=>s.id)).size, a.sources.length, 'Duplicate source id');
    for (const s of a.sources) {
      assert.match(s.id, /^[a-zA-Z0-9-]+$/);
      assert.match(s.url, /^https:\/\//);
      assert.ok(['read','reused','link-only'].includes(s.readStatus));
      assert.match(s.checkedOn, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(!Number.isNaN(Date.parse(s.checkedOn)), 'Invalid source date');
      assert.ok(s.title && s.scope && typeof s.note === 'string', 'Missing source scope: ' + a.slug);
    }
    assert.match(a.image?.file || '', /^[a-z0-9][a-z0-9-]*\.(?:webp|jpg|jpeg|png)$/);
    assert.ok(a.image.alt && a.image.captionHtml);
    if (a.image.width !== undefined || a.image.height !== undefined) assert.ok(Number.isInteger(a.image.width) && a.image.width > 0 && Number.isInteger(a.image.height) && a.image.height > 0, 'Invalid image dimensions');
    assert.match(a.image.captionHtml, /https:\/\//);
    assert.ok(!/<\/?(?:script|style|iframe|object|embed)\b|\bon\w+\s*=|javascript\s*:/i.test(a.image.captionHtml), 'Executable image credit');
  }
  assert.deepEqual([...numbers].sort((a,b)=>a-b), Array.from({length:46}, (_,i)=>i+5), 'All 46 remaining subjects are required');
  return articles;
}

export function renderEditorialArticle(a, catalog) {
  const updatedAt = a.updatedAt || DATE;
  const path = '/guides/' + a.slug + '/', canonical = SITE + path;
  const og = 'og-editorial-' + a.image.file;
  const contents = [...a.sections.map(s=>({id:s.id,title:s.title})), {id:'sources',title:'来源与阅读范围'}, {id:'related',title:'接着看'}];
  const links = contents.map(s=>`<a data-chapter-link href="#${s.id}">${esc(s.title)}</a>`).join('');
  const config = {topic:true,config:{kind:'topic',checkedOn:DATE,sources:Object.fromEntries(a.sources.map(s=>[s.id,s]))}};
  const structured = {'@context':'https://schema.org','@graph':[
    {'@type':'Article',headline:a.title,description:a.summary,dateModified:updatedAt,inLanguage:'zh-CN',mainEntityOfPage:canonical,author:{'@type':'Organization',name:'Roamorrow 编辑部',url:SITE+'/about/'}},
    {'@type':'BreadcrumbList',itemListElement:[{'@type':'ListItem',position:1,name:'旅居指南',item:SITE+'/guides/'},{'@type':'ListItem',position:2,name:a.title,item:canonical}]},
  ]};
  const related = a.relatedSlugs.map(slug=>{
    const other = catalog.find(e=>e.slug===slug);
    assert.ok(other, 'Related guide not found: ' + slug + ' in ' + a.slug);
    const href = other.kind === 'guide' ? slug + '.html' : SITE + other.path;
    return `<li><a href="${esc(href)}">${esc(other.title)}</a></li>`;
  }).join('');
  const sources = a.sources.map(s=>`<li id="source-${esc(s.id)}"><a href="${esc(s.url)}">${esc(s.title)}</a> · ${s.readStatus==='reused'?'沿用核读':s.readStatus==='link-only'?'链接登记':'本轮核读'} ${esc(s.checkedOn)}<p>${esc(s.scope)} ${esc(s.note)}</p></li>`).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>${esc(a.title)}</title><meta name="description" content="${esc(a.summary)}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:title" content="${esc(a.title)}"><meta property="og:description" content="${esc(a.summary)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${SITE}/assets/${og}"><meta name="twitter:card" content="summary_large_image"><link rel="stylesheet" href="preview.css"><link rel="icon" href="data:,"><script defer src="reader.js"></script><script type="application/ld+json">${safeJSON(structured)}</script><script type="application/json" id="guide-config">${safeJSON(config)}</script></head><body><a class="skip" href="#main">跳到正文</a><header class="site-head"><a class="brand" href="index.html">roamorrow</a><nav class="head-links"><a href="index.html">旅居指南</a><a href="${SITE}/">目的地</a></nav></header><main id="main" class="page" data-guide-topic="${a.slug}"><nav class="breadcrumbs" aria-label="面包屑"><a href="index.html">旅居指南</a><span>/</span><span>${groups[a.category]}</span></nav><section class="answer-hero"><h1>${esc(a.title)}</h1><p class="answer-scope">${groups[a.category]} · 第${a.number}篇</p><p>${esc(a.lede)}</p><div class="checked-row"><span>编辑更新：${updatedAt}</span><span>各项资料日期见来源区</span></div><div class="answer-actions">${a.sections.slice(0,3).map(s=>`<a href="#${s.id}">${esc(s.title)}</a>`).join('')}</div></section><div class="reader"><aside class="toc" aria-label="本页目录"><p class="toc-title">${groups[a.category]}</p>${links}</aside><details class="mobile-chapters" data-mobile-chapters><summary><span class="chapter-label">在这一页</span><span class="chapter-toggle"><span class="open-label">章节</span><span class="close-label">收起</span></span></summary><nav id="chapter-panel" class="chapter-panel topic-chapter-panel" data-chapter-panel aria-label="章节">${links}</nav></details><article class="article">${a.sections.map((s,i)=>`<section id="${s.id}" data-reader-section data-chapter-title="${esc(s.title)}"><h2>${esc(s.title)}</h2>${s.html}${i===1?`<figure><img src="assets/${a.image.file}" alt="${esc(a.image.alt)}"${a.image.width && a.image.height ? ` width="${a.image.width}" height="${a.image.height}"` : ''} loading="lazy"><figcaption>${a.image.captionHtml}</figcaption></figure>`:''}</section>`).join('')}<section id="sources" data-reader-section data-chapter-title="来源与阅读范围"><h2>来源与阅读范围</h2><ul class="source-list">${sources}</ul><details class="image-credits"><summary>配图许可</summary><p>本文配图与分享图使用同一张既有照片。${a.image.captionHtml}</p></details></section><section id="related" data-reader-section data-chapter-title="接着看"><h2>接着看</h2><ul>${related}</ul><p><a href="index.html">返回旅居指南，按问题找文章</a></p></section><div data-reader-end></div></article></div></main><footer class="site-foot"><p>roamorrow · 带上电脑，去住一个月。</p></footer></body></html>\n`;
}

export async function prepareEditorialSeries({root=ROOT,write=false}={}) {
  const files = ['start-budget.json','season-compare.json','permission-tools.json'];
  const articles = validateEditorialArticles((await Promise.all(files.map(async file=>JSON.parse(await readFile(resolve(root,'content/editorial-50',file),'utf8')).articles))).flat());
  const catalogPath=resolve(root,'data/article-catalog.json');
  const data=JSON.parse(await readFile(catalogPath,'utf8'));
  for (const [i,slug] of firstFour.entries()) Object.assign(data.entries.find(e=>e.slug===slug), {seriesNumber:i+1,seriesCategory:'start'});
  for (const a of articles) {
    const entry={slug:a.slug,kind:'guide',topic:true,path:'/guides/'+a.slug+'/',title:a.title,summary:a.summary,citySlugs:a.citySlugs,status:'published',updatedAt:a.updatedAt || DATE,assetPath:'/city-guides/'+a.slug+'.html',seriesNumber:a.number,seriesCategory:a.category};
    const index=data.entries.findIndex(e=>e.slug===a.slug);
    if(index<0)data.entries.push(entry);else {assert.ok(index>=0 && (a.slug==='first-month'||data.entries[index].seriesNumber===a.number),'Existing article collision: '+a.slug);data.entries[index]={...(a.slug==='first-month' && data.entries[index].bodyParagraphs ? {bodyParagraphs:data.entries[index].bodyParagraphs} : {}),...entry};}
  }
  for (const a of articles) {
    const html=renderEditorialArticle(a,data.entries), path=resolve(root,'content/city-guides',a.slug+'.html');
    if(write){await writeFile(path,html);await copyFile(resolve(root,'content/city-guides/assets',a.image.file),resolve(root,'content/city-guides/assets','og-editorial-'+a.image.file));}
    else assert.equal(await readFile(path,'utf8'),html,'Editorial source is stale: '+a.slug);
  }
  const rendered=JSON.stringify(data,null,2)+'\n';
  if(write)await writeFile(catalogPath,rendered);else assert.equal(await readFile(catalogPath,'utf8'),rendered,'Editorial catalog is stale');
  return articles;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const articles=await prepareEditorialSeries({write:process.argv.includes('--write')});
  console.log('Editorial series: '+articles.length+' remaining articles; publication hashes require separate review.');
}
