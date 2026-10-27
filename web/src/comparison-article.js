import data from '../data/comparison-articles.json' with {type:'json'};
import budgets from '../data/comparison-budgets.json' with {type:'json'};
import {calculateBudget} from '../content/city-guides/budget-model.mjs';
import {articleBySlug} from './article-catalog.js';
import {comparisonBody} from './comparison-page.js';
import {esc} from './render.js';

const aliases={cm:'chiang-mai',pg:'penang',dn:'da-nang'};
const numberFormat=new Intl.NumberFormat('en-US',{maximumFractionDigits:0});
const format=n=>numberFormat.format(Number(n));
const titleMarkup=value=>esc(value).replace(/住一个月|冬天看雨|春天看空气/g,word=>`<span class="editorial-nowrap">${word}</span>`);
export function comparisonBudget(key,overrides={}) {
 const profile=budgets.profiles[key];
 if(!profile)throw Error('Missing comparison budget: '+key);
 return calculateBudget(profile.config,{...profile.scenario,...overrides});
}
export function comparisonArticle(key) {
 const entry=data.articles.find(a=>a.slug===key),catalog=articleBySlug(key);
 if(!entry||!catalog||data.publication.approved!==true)return null;
 if(entry.title!==catalog.title||entry.updatedAt!==catalog.updatedAt)throw Error('Comparison article catalog drift: '+key);
 return entry;
}
function text(value) {
 return esc(value.replace(/\{\{(cm|pg|dn)\.total\}\}/g,(_,alias)=>{
  const result=comparisonBudget(aliases[alias]);
  if(result.totalDisplay===null)throw Error('Unknown comparison total cannot be written as a number');
  return format(result.totalDisplay)+'元';
 }));
}
const sourceLinks=ids=>ids?.length?`<div class="editorial-links">${ids.map(id=>{
 const s=data.sources[id];if(!s||!/^https:\/\//.test(s.url))throw Error('Invalid comparison source: '+id);
 return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`;
}).join('')}</div>`:'';
function figure(f) {
 if(!/^\/(?:comparison-assets|guide-assets\/images|images)\/[a-z0-9-]+\.(?:webp|jpe?g|png)$/.test(f.src))throw Error('Invalid comparison image');
 return `<figure class="editorial-figure${f.kind==='quote'?' editorial-quote':''}"><a href="${esc(f.src)}" target="_blank" rel="noopener" aria-label="打开图片：${esc(f.alt)}"><img src="${esc(f.src)}" alt="${esc(f.alt)}" loading="lazy" decoding="async" width="${f.width}" height="${f.height}"></a><figcaption><span>${esc(f.caption)}</span><span>${esc(f.credit)} <a href="${esc(f.sourceUrl)}" target="_blank" rel="noopener noreferrer">${f.kind==='quote'?'报价原页':'图片来源'}</a>${f.licenseUrl?` · <a href="${esc(f.licenseUrl)}" target="_blank" rel="noopener noreferrer">使用许可</a>`:''}</span></figcaption></figure>`;
}
function budgetTable(article) {
 const profiles=article.profileKeys.map(key=>budgets.profiles[key]),results=article.profileKeys.map(key=>comparisonBudget(key));
 const ids=['housing','work','food','transport','utilities','essentials','activities','buffer'];
 const labels={housing:'整间房费',work:'共享办公月票',food:'餐饮与饮料',transport:'市内交通',utilities:'水电预留',essentials:'通信、洗衣与日用品',activities:'周末活动',buffer:'周末或机动预留'};
 return `<div class="editorial-table-wrap" tabindex="0" role="region" aria-label="两城30晚预算分项"><table class="editorial-budget"><caption>单人承担整间房、30晚；参考价与生活预留分开列</caption><thead><tr><th scope="col">项目</th>${profiles.map(p=>`<th scope="col">${esc(p.label)}<small>原币 · 约合人民币</small></th>`).join('')}</tr></thead><tbody>${ids.filter(id=>results.some(r=>r.items.some(x=>x.id===id))).map(id=>`<tr><th scope="row">${labels[id]}</th>${results.map((r,i)=>{
  const row=r.items.find(x=>x.id===id);
  return `<td>${row?`<strong>${row.amountNative===null?'待询价':format(row.amountNative)+' '+esc(profiles[i].nativeLabel)}</strong><span>${row.amountDisplay===null?'换算待补':'约 '+format(row.amountDisplay)+' 元'}</span><small>${row.kind==='reference'?'公开价参照，日期与含费另核':'规划预留'}</small>`:'<span>并入机动预留</span>'}</td>`;
 }).join('')}</tr>`).join('')}<tr class="editorial-total"><th scope="row">合计</th>${results.map((r,i)=>`<td><strong>${format(r.totalNative)} ${esc(profiles[i].nativeLabel)}</strong><span>约 ${format(r.totalDisplay)} 元</span></td>`).join('')}</tr></tbody></table></div><p class="editorial-small">各行取整可能与总额相加略有差额。总额先按原币相加，再统一换算。2026-10-20参考汇率：1元≈${budgets.profiles['chiang-mai'].config.fx.rates.THB.toFixed(4)}泰铢、${budgets.profiles['penang'].config.fx.rates.MYR.toFixed(4)}令吉、${budgets.profiles['da-nang'].config.fx.rates.VND.toFixed(2)}越盾。<a href="https://www.exchangerate-api.com">Rates By Exchange Rate API</a>。押金、机票、签证、保险及未确认税费另备。</p>`;
}
function climateTable(article) {
 return `<div class="editorial-table-wrap" tabindex="0" role="region" aria-label="历史月份气温与降雨"><table class="editorial-climate"><caption>2023–2025年ERA5三年样本，均温与月均雨量；不是天气预报</caption><thead><tr><th scope="col">月份</th>${article.profileKeys.map(k=>`<th scope="col">${esc(budgets.profiles[k].label)}<small>均温 / 雨量</small></th>`).join('')}</tr></thead><tbody>${Array.from({length:12},(_,i)=>`<tr><th scope="row">${i+1}月</th>${article.profileKeys.map(k=>{const r=budgets.profiles[k].climate[i];return `<td>${r?.meanC==null?'待补':r.meanC.toFixed(1)+'℃'} · ${r?.rainMm==null?'待补':Math.round(r.rainMm)+'mm'}</td>`;}).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function renderComparisonArticle(article,a,b,month) {
 const chapters=[...article.sections.map(s=>[s.id,s.title]),['questions','还常问到这些'],['sources','来源与图片'],['comparison-tool','历史资料逐项对照']];
 const links=chapters.map(([id,title])=>`<a href="#${esc(id)}" data-chapter-link>${esc(title)}</a>`).join('');
 const para=paragraphs=>paragraphs?.map(p=>`<p>${text(p)}</p>`).join('')||'';
 const cards=article.profileKeys.map(k=>{const p=budgets.profiles[k],r=comparisonBudget(k);if(r.totalDisplay===null)throw Error('Article answer requires complete plan');return `<div class="editorial-answer"><span>${esc(p.label)} · 单人30晚预算计划</span><strong data-comparison-budget="${esc(k)}">${format(r.totalDisplay)}<small> 元</small></strong><span>${format(r.totalNative)} ${esc(p.nativeLabel)}</span><small>${k==='chiang-mai'?'凉季庭院房＋工位月票':k==='penang'?'Studio预留＋工位月票':'一卧公寓＋日间工位月票'}</small></div>`;}).join('');
 const sources=article.sourceIds.map(id=>{const s=data.sources[id];return `<li id="source-${id.toLowerCase()}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(s.checkedOn)}</small><p>${esc(s.note)}</p></li>`;}).join('');
 return `<link rel="stylesheet" href="/comparison-article.css"><article class="comparison-editorial"><header class="editorial-hero"><nav class="editorial-breadcrumbs" aria-label="面包屑"><a href="/">游民指南</a><span>/</span><a href="/compare/">城市对比</a><span>/</span><span>${esc(a.name)}与${esc(b.name)}</span></nav><p class="editorial-kicker">住一个月，怎么选城市</p><h1>${titleMarkup(article.title)}</h1><p class="editorial-deck">${esc(article.answer)}</p><div class="editorial-answers">${cards}</div><p class="editorial-scope">${esc(article.budgetNote)}</p><p class="editorial-small">更新于 <time datetime="${article.updatedAt}">${article.updatedAt}</time> · 价格核对 2026-10-21 · 汇率日 2026-10-20</p></header><nav class="editorial-mobile" data-mobile-chapters aria-label="文章目录"><button type="button" aria-expanded="false" aria-controls="editorial-chapters">这一页 <strong data-current-chapter>${esc(chapters[0][1])}</strong><span>章节</span></button><div id="editorial-chapters" data-chapter-panel hidden>${links}</div></nav><div class="editorial-photos">${article.heroFigures.map(figure).join('')}</div><div class="editorial-layout"><aside class="editorial-toc"><p>在这一篇</p><nav aria-label="文章章节">${links}</nav><div class="editorial-city-links">${article.citySlugs.map((slug,i)=>`<a href="/cities/${esc(slug)}/">${esc([a,b][i].name)}城市资料 ↗</a>`).join('')}</div></aside><div class="editorial-body">${article.sections.map(s=>`<section id="${esc(s.id)}" data-reader-section data-chapter-title="${esc(s.title)}"><h2>${esc(s.title)}</h2>${para(s.paragraphs)}${s.budgetTable?budgetTable(article):''}${para(s.after)}${s.climate?climateTable(article):''}${s.figures?.map(figure).join('')||''}${sourceLinks(s.links)}</section>`).join('')}<section id="questions" data-reader-section data-chapter-title="还常问到这些"><h2>还常问到这些</h2><div class="editorial-faq">${article.faq.map(([q,answer])=>`<details><summary>${esc(q)}</summary><p>${esc(answer)}</p></details>`).join('')}</div></section><section id="sources" data-reader-section data-chapter-title="来源与图片"><h2>来源与图片</h2><p>作者：<a href="/about/">Roamorrow 编辑部</a>。本文链接不收取返佣。价格与条件来自运营方公开页面，生活额度是规划预留。旅居者经历按原作者署名，不代表本站实住或现场测速。</p><p>照片和报价截图旁均有来源。已有城市照片沿用原授权并转码，显示时可能随容器裁切。报价截图保留真实页面内容，仅转成WebP，点击可查看大图。社交平台配图和用户头像没有转载。</p><ul class="editorial-sources">${sources}</ul></section></div></div><section id="comparison-tool" data-reader-section data-chapter-title="历史资料逐项对照"><h2>历史资料逐项对照</h2><p>下面保留本站旧指标工具，方便切换月份。这里的历史月花费不是本文上方的独住预算，网络分数也不是实测Mbps。费用决策请用前面的房型与报价条件。</p>${comparisonBody(a,b,month,{embedded:true})}</section><div data-reader-end></div></article><script src="/guide-assets/reader.js" defer></script>`;
}
