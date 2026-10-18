import {travelAdvisory} from '../public/modules/recommendation-policy.js';
import {agentMarkup} from './agent-markup.js';
import {icon} from '../public/modules/icons.js';
export {icon};
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=v=>v===null||v===undefined?'待补录':'$'+Number(v).toLocaleString('en-US',{maximumFractionDigits:0});
export function canonicalPair(a,b){return [...new Set([a,b])].sort().join('-vs-');}
export function filters(url){
 const q=(url.searchParams.get('q')||'').trim().slice(0,100);
 const rawMonth=Number(url.searchParams.get('month'));const month=Number.isInteger(rawMonth)&&rawMonth>=1&&rawMonth<=12?rawMonth:null;
 const region=['亚洲','欧洲','非洲','美洲','大洋洲'].includes(url.searchParams.get('region'))?url.searchParams.get('region'):'';
 const rawBudget=Number(url.searchParams.get('budget'));const budget=[1000,1500,2000,3000].includes(rawBudget)?rawBudget:null;
 const page=Math.min(500,Math.max(1,parseInt(url.searchParams.get('page'),10)||1));
 return {q,month,region,budget,page};
}
export function link(url,label,cls=''){return `<a class="${cls}" href="${esc(url)}">${esc(label)}</a>`;}
export function external(url,label){return /^https?:\/\//.test(url||'')?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:esc(label);}
export const monthsText=rows=>{const m=rows.filter(x=>x.suitability==='recommended').map(x=>x.month);return m.length?m.join('、')+' 月':'月份待核验';};
export function photo(c,cls='',loading='lazy'){return c.photo_url?`<img class="${cls}" src="${esc(c.photo_url)}" alt="${esc(c.name_zh)}城市风景" loading="${loading}" decoding="async" width="900" height="650">`:`<div class="photo-placeholder ${cls}"><span>${esc(c.name_en)}</span><small>城市资料</small></div>`;}
export function card(c){return `<article class="city-card">
 <div class="card-photo"><a href="/cities/${esc(c.slug)}/" aria-label="了解${esc(c.name_zh)}">${photo(c)}</a><button class="save" data-save="${esc(c.slug)}" data-name="${esc(c.name_zh)}" aria-label="收藏${esc(c.name_zh)}" aria-pressed="false">${icon('heart')}</button></div>
 <div class="card-place"><div><h3><a href="/cities/${esc(c.slug)}/">${esc(c.name_zh)}</a></h3><span>${esc(c.name_en)} · ${esc(c.country_name)}</span></div><span class="region-label">${esc(c.region)}</span></div>
 <p class="card-summary">${esc(travelAdvisory(c)?.reason || c.summary)}</p><div class="card-bottom"><div><strong>${money(c.budget_amount)}</strong><span>${c.budget_amount?' / 月估算':'月成本'}</span></div><button class="compare-add" data-compare="${esc(c.slug)}" data-name="${esc(c.name_zh)}" aria-label="将${esc(c.name_zh)}加入对比" aria-pressed="false">${icon('plus')}<span>对比</span></button></div>
 </article>`;}
export function searchForm(f={},compact=false){return `<form action="/cities/" method="get" class="search-form ${compact?'compact':''}">
 <label class="search-query"><span>想去哪里</span><input name="q" type="search" value="${esc(f.q||'')}" placeholder="搜索城市或国家" aria-label="搜索城市或国家"></label>
 <label><span>出发月份</span><select name="month" aria-label="出发月份"><option value="">不限月份</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${f.month===i+1?'selected':''}>${i+1} 月</option>`).join('')}</select></label>
 <label><span>每月预算</span><select name="budget" aria-label="每月预算"><option value="">不限预算</option>${[1000,1500,2000,3000].map(n=>`<option value="${n}" ${f.budget===n?'selected':''}>$${n.toLocaleString()} 以内</option>`).join('')}</select></label>
 ${compact?`<label><span>地区</span><select name="region" aria-label="地区"><option value="">所有地区</option>${['亚洲','欧洲','非洲','美洲','大洋洲'].map(r=>`<option ${f.region===r?'selected':''}>${r}</option>`).join('')}</select></label>`:''}<button class="button" type="submit">找一个地方 <span aria-hidden="true">⌕</span></button></form>`;}
export function shell({title,description,body,path='/',env={},indexable=false,jsonld,active='cities'}){
 const origin=(env.SITE_ORIGIN||'http://127.0.0.1:8787').replace(/\/$/,'');const noindex=env.PREVIEW!=='false'||!indexable;
 const navActive=path==='/about/'?'about':active;
 const structured=jsonld?`<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g,'\\u003c')}</script>`:'';
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · RemoteAI Nomads</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${noindex?'noindex,follow':'index,follow'}"><link rel="canonical" href="${esc(origin+path)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(origin+path)}"><meta name="theme-color" content="#FAFAFA"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/rankings.css"><link rel="stylesheet" href="/agent.css"><link rel="stylesheet" href="/system.css">${structured}<script src="/app.js" type="module"></script></head><body>
 <a class="skip" href="#main">跳到正文</a><header class="site-header"><div class="nav-inner"><a class="brand" href="/" aria-label="RemoteAI Nomads 首页"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 25V11l8-5 8 5v14M12 6v19M20 15l8-5v15M3 25h26" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>RemoteAI <b>Nomads</b></span></a><button type="button" class="nav-toggle" id="nav-toggle" aria-controls="site-navigation" aria-expanded="false">${icon('menu')}<span>菜单</span></button><nav class="site-navigation" id="site-navigation" aria-label="主导航"><a tabindex="0" href="/" ${navActive==='cities'?'aria-current="page"':''}>城市排行</a><a tabindex="0" href="/compare/" ${navActive==='compare'?'aria-current="page"':''}>城市对比</a><a tabindex="0" href="/guides/" ${navActive==='guides'?'aria-current="page"':''}>出发指南</a><a tabindex="0" href="/about/" ${navActive==='about'?'aria-current="page"':''}>数据与方法</a><a class="nav-source" href="https://github.com/cubxxw/RemoteAI-Nomads" target="_blank" rel="noopener noreferrer" aria-label="GitHub 项目源码（新窗口）">${icon('github')}<span>GitHub</span></a></nav></div></header>
 <main id="main">${body}</main>
 <footer class="site-footer"><a class="footer-brand" href="/">RemoteAI Nomads</a><div class="footer-links"><a href="/countries/">国家与地区目录</a><a href="/about/">方法与来源</a><a href="https://github.com/cubxxw/RemoteAI-Nomads" target="_blank" rel="noopener noreferrer">源码与反馈 ↗</a><span>数据快照 2026.10.17${env.PREVIEW!=='false'?' · 本地预览':''}</span></div></footer>
 ${agentMarkup()}<aside id="compare-tray" class="compare-tray" aria-label="已选城市" hidden><div class="compare-tray-status"><strong>城市对比</strong><span id="compare-count" aria-live="polite"></span></div><div id="compare-selected"></div><a id="compare-go" class="button" href="/compare/">查看对比</a><button id="compare-clear" class="text-button" aria-label="清空对比城市">清空</button></aside><div id="toast" class="toast" role="status" aria-live="polite"></div></body></html>`;
}
