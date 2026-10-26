import {createShare,cityShare,comparisonShare,personalShare,shareURL} from './share-model.js';
import {currentMonth} from './ranking.js';
import {openShare} from './share-ui.js';
import {sitePath,appPath} from './site-path.js';
const $=selector=>document.querySelector(selector);
const read=selector=>$(selector)?.textContent?.trim()||'';
const json=selector=>{try{return JSON.parse(read(selector));}catch{return null;}};
function personalCity(card){
 const total=read('[data-overview-total]'),days=$('#trip-days')?.value||'30',currency=$('#trip-currency')?.value||'CNY';
 if(!total||total==='—')throw Error('先填写方案，才有可以分享的已知开销。');
 return personalShare(card,{subtitle:'我的方案 / '+days+'天 / '+currency,summary:'按自己的住法估算，参考与填写分别标注。',facts:[{label:'已知开销小计',value:total,note:read('[data-overview-feedback]')}],items:[...document.querySelectorAll('[data-traveler-row]:not([hidden])')].map(row=>({title:row.querySelector('dt strong')?.textContent||'',detail:row.querySelector('dd')?.textContent||''})),caveats:[read('[data-overview-missing]')],linkNote:'图片与配文包含个人填写；公开链接只打开城市资料，不含个人报价或会议。'});
}
function personalComparison(card){
 const items=[...document.querySelectorAll('[data-personal-plan]')].map(row=>({title:row.querySelector('h3')?.textContent||'',detail:[row.querySelector('[data-personal-period]')?.textContent,row.querySelector('[data-personal-total]')?.textContent,row.querySelector('[data-personal-origin]')?.textContent,row.querySelector('[data-personal-missing]')?.textContent].filter(Boolean).join('；')}));
 if(!items.length||[...document.querySelectorAll('[data-personal-total]')].every(row=>row.textContent.trim()==='—'))throw Error('还没有可分享的个人方案。');return personalShare(card,{summary:'两份个人方案，金额只代表自己填写的安排。',items,caveats:[read('[data-personal-difference]'),'往返交通、押金、保险和签证需另计。'],linkNote:'图片与配文包含个人方案；公开链接只恢复两城与月份，不含个人金额。'});
}
export async function readShareContent(){
 const meta=json('#share-page-data')||{title:read('h1')||document.title.replace(/ · Roamorrow$/,''),summary:$('meta[name="description"]')?.content||''};
 const path=appPath(location.pathname),month=Number($('#city-month')?.value||$('#comparison-month')?.value||new URL(location.href).searchParams.get('month'))||currentMonth();
 // Published fallback HTML predates explicit share metadata. Query only its public read model.
 if(!meta.city&&$('#city-guide')){const response=await fetch(sitePath('/api/rankings'));if(!response.ok)throw Error('城市公开资料暂未载入，请重试。');const rows=await response.json(),city=rows.find(row=>row.slug===path.split('/')[2]);if(city){const card=cityShare(city,month,location.href);return {card,options:{personal:()=>personalCity(card)}};}}
 if(meta.city){const card=cityShare(meta.city,month,location.href);return {card,options:{personal:()=>personalCity(card)}};}
 if(meta.cities&&$('#comparison-month')){const card=comparisonShare(meta.cities,month,location.href);return {card,options:{personal:()=>personalComparison(card)}};}
 const guide=json('#guide-config');
 if(guide){const {guideShare}=await import('./share-guide-model.js');const card=guideShare(guide,meta,location.href),housing=$('[data-budget-form]')?.elements.namedItem('housingNative')?.value;return {card,options:guide.config?.kind==='topic'||housing===undefined||housing===''?{}:{personal:()=>guideShare(guide,meta,location.href,{includePersonal:true}),label:'包含我填写的房租'}};}
 const kind=path.startsWith('/guides/')?'guide':/^\/(countries|destinations)/.test(path)?'directory':'page';
 return {card:createShare({kind,...meta,url:shareURL(location.href,{kind}),caveats:kind==='directory'?['目录资料供查阅，价格、入境与工作许可仍需逐项核对。']:[],sources:meta.sources||[]}),options:{}};
}
export function initSharing(){
 let toolbar=$('.share-page-toolbar');
 if(!toolbar){toolbar=document.createElement('div');toolbar.className='share-page-toolbar';const button=document.createElement('button');button.type='button';button.className='site-share';button.dataset.sharePage='';button.textContent='分享';button.setAttribute('aria-haspopup','dialog');toolbar.append(button);$('main')?.prepend(toolbar);}
 if(!$('link[href$="/share.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href=sitePath('/share.css');document.head.append(link);}
 if($('#ranking-root')){if(toolbar)toolbar.hidden=true;}
 const sharePage=async button=>{
  try{const {card,options}=await readShareContent();openShare(card,button,options);}catch(error){document.dispatchEvent(new CustomEvent('nomads:notice',{detail:error.message||'分享暂不可用，请重试。'}));button.textContent='重试分享';}
 };
 document.addEventListener('click',event=>{
  const button=event.target.closest('[data-share-page]');if(button)sharePage(button);
 });
 // Upgrade the original approved guide's sharing action at runtime; its source bytes remain approved.
 document.querySelectorAll('[data-copy-budget]').forEach(button=>{button.textContent='分享预算';button.setAttribute('aria-haspopup','dialog');});
 document.addEventListener('click',event=>{const button=event.target.closest('[data-copy-budget]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();sharePage(button);},true);
 if(!$('#ranking-root')){
  const target=$('.city-heading-actions')||$('.comparison-options')||$('.content-intro')||$('main h1')?.parentElement;
  if(target&&toolbar){target.append(toolbar);toolbar.classList.add('share-inline');}
 }
 // A checklist is deliberately shared from its visible, explicit items only.
 const checklist=$('[data-guide]');if(checklist){const button=document.createElement('button');button.type='button';button.className='share-item-button';button.textContent='分享这份清单';checklist.append(button);button.addEventListener('click',()=>{
  const rows=[...checklist.querySelectorAll('input[data-guide-check]')];const make=progress=>createShare({kind:'checklist',title:read('h1')||'第一周落地清单',url:shareURL(location.href,{kind:'guide'}),items:rows.map(input=>({title:(progress?(input.checked?'已完成：':'待完成：'):'')+(input.closest('section')?.querySelector('h2')?.textContent.trim()||'清单项目'),detail:input.closest('section')?.querySelector('p')?.textContent.trim()||''})),private:progress,caveats:['先完成一个实际工作日，再决定是否住满一个月。'],linkNote:progress?'图片包含勾选进度；链接打开原清单，不同步个人完成记录。':''});
  openShare(make(false),button,{personal:()=>make(true),label:'包含我的勾选进度',personalNote:'勾选进度只进入图片与配文，不写入公开链接。'});
 });}
 document.querySelectorAll('[data-share-page],[data-copy-budget]').forEach(button=>{button.disabled=false;button.removeAttribute('aria-busy');button.setAttribute('aria-label',button.hasAttribute('data-copy-budget')?'分享预算':'分享这页');});
}
