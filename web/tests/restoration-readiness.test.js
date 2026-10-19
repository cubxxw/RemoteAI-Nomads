import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {initContentPage} from '../public/modules/content-ui.js';
import {initPersonalComparison} from '../public/modules/personal-plan-ui.js';
import {renderGuides} from '../src/content-pages.js';
import {personalComparisonMarkup} from '../src/personal-comparison-markup.js';
import {rankingPageFromData} from '../src/rank-pages.js';
import {stateParams} from '../public/modules/ranking.js';
import {restorePreference,savePreference,UI_PRESETS,applyRankingFilter,toggleQuickFilter} from '../public/modules/rank-controls.js';

// Only DOM/storage boundaries are adapted. SSR, initializers, normalization and
// budget helpers remain production code. This is not a replay of the R7 incident.
// Native summary has no disabled attribute; inert prevents clicks and focus:
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/summary
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inert
class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.attrs=new Map();this.dataset={};this.children=[];this.listeners=new Map();this.checked=false;}
  hasAttribute(name){return this.attrs.has(name);}
  getAttribute(name){return this.attrs.get(name)??null;}
  setAttribute(name,value=''){this.attrs.set(name,String(value));if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);}
  removeAttribute(name){const removed=this.attrs.delete(name);if(removed)this.onRemove?.(name);}
  get disabled(){return this.hasAttribute('disabled');} set disabled(v){v?this.setAttribute('disabled'):this.removeAttribute('disabled');}
  get inert(){return this.hasAttribute('inert');} set inert(v){v?this.setAttribute('inert'):this.removeAttribute('inert');}
  get open(){return this.hasAttribute('open');} set open(v){v?this.setAttribute('open'):this.removeAttribute('open');}
  get hidden(){return this.hasAttribute('hidden');} set hidden(v){v?this.setAttribute('hidden'):this.removeAttribute('hidden');}
  get href(){return this.getAttribute('href')||'';} set href(v){this.setAttribute('href',v);}
  get textContent(){return this.children.map(c=>typeof c==='string'?c:c.textContent).join('');} set textContent(v){this.children=[String(v)];}
  append(...nodes){for(const n of nodes){if(n instanceof Element)n.parentElement=this;this.children.push(n);}}
  replaceChildren(...nodes){this.children=[];this.append(...nodes);}
  matches(selector){const s=selector.trim();if(s.startsWith('#'))return this.getAttribute('id')===s.slice(1);if(s.startsWith('.'))return (this.getAttribute('class')||'').split(/\s+/).includes(s.slice(1));const a=s.match(/^\[([^=\]]+)(?:=["']?([^"'\]]*)["']?)?\]$/);if(a)return this.hasAttribute(a[1])&&(a[2]===undefined||this.getAttribute(a[1])===a[2]);return this.tagName===s.toUpperCase();}
  querySelectorAll(selector){const found=[];for(const c of this.children)if(c instanceof Element){if(selector.split(',').some(s=>c.matches(s)))found.push(c);found.push(...c.querySelectorAll(selector));}return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  contains(node){return node===this||this.children.some(c=>c instanceof Element&&c.contains(node));}
  closest(selector){for(let n=this;n;n=n.parentElement)if(selector.split(',').some(s=>n.matches(s)))return n;return null;}
  get blocked(){return this.inert||(['INPUT','BUTTON','SELECT'].includes(this.tagName)&&this.disabled)||!!this.parentElement?.blocked;}
  addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}
  dispatch(type,event={type,target:this,preventDefault(){this.defaultPrevented=true;}}){event.currentTarget=this;for(const fn of this.listeners.get(type)||[])fn(event);if(type==='click'&&this.parentElement)this.parentElement.dispatch(type,event);return event;}
  click(){if(this.blocked)return false;const e=this.dispatch('click');if(this.tagName==='SUMMARY'&&!e.defaultPrevented){this.parentElement.open=!this.parentElement.open;this.parentElement.dispatch('toggle');}return true;}
  setChecked(value){if(this.blocked)return false;this.checked=value;this.dispatch('change');return true;}
}

function parseHTML(html){
  const root=new Element('root'),stack=[root],voids=new Set(['INPUT','LINK','META','IMG','BR','HR']);
  for(const token of html.match(/<\/?[\w-]+\b[^>]*>|[^<]+/g)||[]){
    if(token.startsWith('</')){stack.pop();continue;}
    if(!token.startsWith('<')){stack.at(-1).append(token);continue;}
    const tag=token.match(/^<([\w-]+)/)[1],node=new Element(tag),attributes=token.slice(tag.length+1).replace(/\/?>$/,'');
    for(const m of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(m[1],m[2]??m[3]??m[4]??'');
    node.checked=node.hasAttribute('checked');stack.at(-1).append(node);
    if(!voids.has(node.tagName)&&!token.endsWith('/>'))stack.push(node);
  }
  return root;
}

const guideHTML=()=>renderGuides([{slug:'first-month',title:'第一周',summary:'住宿、工作、开销',body_json:'["住房","会议","开销"]',status:'published',updated_at:'2026-10-19'}],'first-month',{SITE_ORIGIN:'https://nomads.test'}).body;
const cities=[{slug:'chiang-mai',name:'清迈'},{slug:'chiang-rai',name:'清莱'}];
const rankCity={slug:'chiang-mai',name:'清迈',nameEn:'Chiang Mai',country:'泰国',countryCode:'TH',countryId:'TH',region:'亚洲',budget:850,budgetBasis:'历史参考',photo:null,why:'测试资料',scores:{safety:9,cost:8,climate:8,life:9,internet:10,community:8},months:Array.from({length:12},(_,i)=>({month:i+1,status:'unknown',meanC:24,highC:29,rainMm:100})),visa:{code:'visa_free',label:'免签',detail:'历史标签'}};
const rankRuntime=await readFile(new URL('../public/modules/rank-ui.js',import.meta.url),'utf8');
const appRuntime=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const rankBoundary=rankRuntime.match(/^document\.querySelector\('#map-reset'\)\.addEventListener[^\n]+$/m);
assert.ok(rankBoundary,'locate the actual final rank binding/boot block');
const rankBoot=rankRuntime.slice(rankBoundary.index+rankBoundary[0].length);
const actualFunction=name=>{const match=rankRuntime.match(new RegExp('function '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}'));assert.ok(match,'locate actual '+name);return match[0];};
const actualRankRejection=appRuntime.match(/import\("\/modules\/rank-ui\.js"\)\.catch\((error => \{[\s\S]*?\n  \})\);/)?.[1];
assert.ok(actualRankRejection,'locate actual ranking-import rejection callback');
const savedPlan=()=>({version:1,month:11,days:30,currency:'CNY',ceiling:{amount:8000},values:{rent:{amount:3000,origin:'edited'},food:{amount:100,origin:'edited'},transport:{amount:400,origin:'reference'},mobile:{amount:100,origin:'edited'},other:{amount:500,origin:'edited'}}});
function install(t,root,records,{readDenied=false,writeDenied=false,onRead=()=>{}}={}){
  const previous=new Map(['document','localStorage','addEventListener'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),events=new Map();
  globalThis.document={querySelector:s=>root.querySelector(s),querySelectorAll:s=>root.querySelectorAll(s),getElementById:id=>root.querySelector('#'+id),createElement:tag=>new Element(tag)};
  globalThis.localStorage={getItem(key){onRead();if(readDenied)throw new Error('storage read denied');return records.get(key)??null;},setItem(key,value){if(writeDenied)throw new Error('storage write denied');records.set(key,value);}};
  globalThis.addEventListener=(type,fn)=>events.set(type,fn);
  t.after(()=>{for(const [key,descriptor]of previous)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];});
  return events;
}
function guideFixture(t,options={}){
  const root=parseHTML(guideHTML()),guide=root.querySelector('[data-guide]'),checks=guide.querySelectorAll('[data-guide-check]'),clear=guide.querySelector('[data-guide-clear]'),progress=guide.querySelector('[data-guide-progress]');
  const records=new Map([['nomads:guide:first-month',options.corrupt?'{bad':'[1,2]']]);
  install(t,root,records,options);return{root,guide,checks,clear,progress,records};
}
function personalFixture(t,{empty=false,readDenied=false,onRead=()=>{}}={}){
  const root=parseHTML(personalComparisonMarkup(cities,11)),panel=root.querySelector('#personal-comparison'),records=new Map(empty?[]:cities.map(c=>['nomads-city-plan-v1:'+c.slug,JSON.stringify(savedPlan())]));
  const events=install(t,root,records,{readDenied,onRead}),h={root,panel,records,events,month:11};
  h.render=initPersonalComparison(cities,()=>h.month);return h;
}
function rankingFixture(t,{enforcePending=true}={}){
  const root=parseHTML(rankingPageFromData([rankCity],new URL('https://nomads.test/')).body);
  const controls=[...root.querySelectorAll('[data-quick-filter]'),...root.querySelectorAll('[data-preset]'),...['rank-search','toggle-filters','weights-toggle','view-sort','open-command','toggle-map','share-ranking'].map(id=>root.querySelector('#'+id)),...root.querySelectorAll('[data-reset-all]')];
  const records=new Map([['nomads-ranking-view-v1',JSON.stringify({version:1,query:'q=%E5%A4%A7%E7%90%86&month=11&w=20,60,5,5,5,5'})],['nomads-trip-month-v1','11']]);
  install(t,root,records);const phases=[],notifications=[],errors=[],location={origin:'https://nomads.test',pathname:'/',search:''};
  const pending=()=>{if(enforcePending)assert.ok(controls.every(c=>c.blocked),'ranking controls must remain gated through preference commit, render and desktop setup');};
  const history={replaceState(_state,_title,value){pending();phases.push('commit');const url=new URL(value,location.origin);location.search=url.search;},pushState(_state,_title,value){const url=new URL(value,location.origin);location.search=url.search;}};
  const state=restorePreference(new URL('https://nomads.test/'),globalThis.localStorage);
  const context={document:globalThis.document,root:root.querySelector('#ranking-root'),state,stateParams,savePreference,preferenceStorage:globalThis.localStorage,location,history,UI_PRESETS,applyRankingFilter,toggleQuickFilter,
    motion:{addEventListener(){}},matchMedia:()=>({matches:false}),render(){pending();phases.push('render');},setMapOpen(){pending();phases.push('desktop-map');},finishSearch(){},checkpoint(){},
    notify:value=>notifications.push(value),console:{error:(...args)=>errors.push(args)},setTimeout:()=>0,clearTimeout(){}};
  return{root,controls,records,phases,notifications,errors,context,runBoot(){vm.runInNewContext(actualFunction('commit')+'\n'+rankBoot,context,{filename:'actual-rank-boot.js'});}};
}

test('SSR guide checklist and reset are unavailable while a visible progress label explains restoration',()=>{
  const root=parseHTML(guideHTML()),checks=root.querySelectorAll('[data-guide-check]'),reset=root.querySelector('[data-guide-clear]');
  assert.ok(checks.every(c=>c.blocked),'early native checkbox activation must be gated');
  assert.equal(reset.blocked,true,'reset must not race the unread stored checklist');
  assert.match(root.querySelector('[data-guide-progress]').textContent,/恢复|准备/);
});

test('actual guide initialization restores, binds and updates progress before releasing any control',t=>{
  const h=guideFixture(t),released=[];for(const c of [...h.checks,h.clear])c.disabled=true;
  for(const c of [...h.checks,h.clear])c.onRemove=name=>{if(name==='disabled')released.push({checked:h.checks.map(x=>x.checked),progress:h.progress.textContent,bound:h.checks.every(x=>(x.listeners.get('change')||[]).length>0)&&(h.clear.listeners.get('click')||[]).length>0});};
  initContentPage();
  assert.equal(h.checks.every(c=>!c.blocked)&&!h.clear.blocked,true,'ready controls must actually be released');
  assert.equal(released.length,4);
  for(const state of released){assert.deepEqual(state.checked,[false,true,true]);assert.match(state.progress,/2\s*\/\s*3/);assert.equal(state.bound,true);}
});

test('an initialized real guide saves a single checked change and resets through its actual listeners',t=>{
  const h=guideFixture(t);initContentPage();assert.equal(h.checks[0].setChecked(true),true);
  assert.equal(h.records.get('nomads:guide:first-month'),'[0,1,2]');assert.match(h.progress.textContent,/3\s*\/\s*3/);
  h.clear.click();assert.equal(h.records.get('nomads:guide:first-month'),'[]');assert.match(h.progress.textContent,/0\s*\/\s*3/);
});

for(const denial of [{name:'read and write denied',readDenied:true,writeDenied:true},{name:'write denied',writeDenied:true}]){
  test('guide storage '+denial.name+' stays usable for this page without a false saved claim',t=>{
    const h=guideFixture(t,denial);initContentPage();
    assert.equal(h.checks[0].blocked,false);assert.equal(h.clear.blocked,false);h.checks[0].setChecked(true);
    assert.equal(h.checks[0].checked,true);assert.match(h.progress.textContent,/\/\s*3/);
    assert.match(h.guide.textContent,/本页|本次|暂存|未保存|无法保存|不能保存/,'storage failure must be visible rather than claiming durability');
    assert.doesNotMatch(h.guide.textContent,/已保存|清单保存在当前浏览器/);
    assert.equal(h.records.get('nomads:guide:first-month'),'[1,2]');
  });
}

test('corrupt guide storage cannot fabricate a checked item and does not prevent a fresh choice',t=>{
  const h=guideFixture(t,{corrupt:true});initContentPage();assert.deepEqual(h.checks.map(x=>x.checked),[false,false,false]);
  h.checks[0].setChecked(true);assert.equal(h.records.get('nomads:guide:first-month'),'[0]');
});

test('SSR personal details is inert and busy, with an accessible restoring status outside its inert subtree',()=>{
  const root=parseHTML(personalComparisonMarkup(cities,11)),panel=root.querySelector('#personal-comparison');
  assert.equal(panel.inert,true,'summary.disabled is not a native gate; the unread personal region must be inert');
  assert.equal(panel.getAttribute('aria-busy'),'true');
  const status=root.querySelectorAll('[role="status"]').find(n=>!panel.contains(n)&&!n.blocked&&!n.hidden&&/恢复|准备/.test(n.textContent));
  assert.ok(status,'an inert subtree cannot announce its own restoring status');
  panel.querySelector('summary').click();assert.equal(panel.open,false);
});

test('actual personal first render fills the real saved summary and initial open state before releasing inert',t=>{
  const h=personalFixture(t),released=[];h.panel.inert=true;h.panel.setAttribute('aria-busy','true');
  h.panel.onRemove=name=>{if(name==='inert')released.push({open:h.panel.open,totals:h.panel.querySelectorAll('[data-personal-total]').map(n=>n.textContent),difference:h.panel.querySelector('[data-personal-difference]').textContent});};
  h.render();
  assert.equal(h.panel.inert,false,'local data restoration must finish by releasing interaction');
  assert.notEqual(h.panel.getAttribute('aria-busy'),'true');assert.equal(released.length,1);
  assert.equal(released[0].open,true);assert.deepEqual(released[0].totals,['¥7,000','¥7,000']);assert.match(released[0].difference,/相差\s*¥0/);
});

test('after readiness real personal renders preserve user open/close across month changes and keep private quotes out of links',t=>{
  const h=personalFixture(t);h.render();const summary=h.panel.querySelector('summary');
  summary.click();assert.equal(h.panel.open,false);h.month=12;h.render();assert.equal(h.panel.open,false);
  assert.match(h.panel.querySelector('[data-personal-difference]').textContent,/月份不同/);
  for(const link of h.panel.querySelectorAll('[data-personal-edit]')){const url=new URL(link.href,'https://nomads.test');assert.equal(url.search,'?month=12');assert.equal(url.hash,'#budget');assert.doesNotMatch(url.href,/7000|8000|rent|ceiling/);}
  summary.click();h.render();assert.equal(h.panel.open,true);
});

for(const state of [{name:'missing',empty:true},{name:'denied',readDenied:true}]){
  test('personal storage '+state.name+' releases to a readable empty state without invented zero or a difference',t=>{
    const h=personalFixture(t,state);h.render();assert.equal(h.panel.inert,false);
    assert.notEqual(h.panel.getAttribute('aria-busy'),'true');assert.equal(h.panel.open,false);
    assert.deepEqual(h.panel.querySelectorAll('[data-personal-total]').map(n=>n.textContent),['—','—']);
    assert.ok(h.panel.querySelectorAll('[data-personal-ceiling]').every(n=>n.hidden));
    assert.doesNotMatch(h.panel.textContent,/¥0|相差\s*¥/);h.panel.querySelector('summary').click();assert.equal(h.panel.open,true);
  });
}

test('saved-plan counterexample: first render does not close an already open panel, so it alone cannot diagnose the R7 P2 click',t=>{
  const h=personalFixture(t);
  // Programmatically supplied boundary state, not a claim that an inert SSR
  // summary accepts clicks or that this ordering occurred in the persona run.
  h.panel.open=true;h.render();assert.equal(h.panel.open,true);
});

test('SSR ranking preference controls wait for saved-view restoration rather than accepting early unbound actions',()=>{
  const root=parseHTML(rankingPageFromData([rankCity],new URL('https://nomads.test/')).body);
  const controls=[...root.querySelectorAll('[data-quick-filter]'),...root.querySelectorAll('[data-preset]'),...['rank-search','toggle-filters','weights-toggle','view-sort','open-command','toggle-map','share-ranking'].map(id=>root.querySelector('#'+id)),...root.querySelectorAll('[data-reset-all]')];
  assert.ok(controls.every(control=>control&&control.blocked),'domestic/preset/search actions must not be offered before preference restoration and listener readiness');
  assert.ok(root.querySelectorAll('[role="status"]').some(node=>!node.blocked&&!node.hidden&&/恢复|准备/.test(node.textContent)),'a visible preparation state must explain why ranking controls are unavailable');
  assert.equal(root.querySelector('.rank-city-link').blocked,false,'public city rows must remain usable while controls prepare');
  assert.ok(root.querySelectorAll('a').some(node=>node.href==='/about/'&&!node.blocked),'public method links must not be trapped inside a whole-page inert gate');
});

test('actual rank boot releases only controls after real saved-view commit, first render and desktop setup',t=>{
  const h=rankingFixture(t);h.runBoot();
  assert.deepEqual(h.phases,['commit','render','desktop-map']);
  assert.equal(h.controls.every(c=>!c.blocked),true,'actual boot completion must release the preparing controls');
  assert.equal(h.context.state.q,'大理');assert.equal(h.context.state.month,11);
  assert.match(h.context.location.search,/q=%E5%A4%A7%E7%90%86/);
  assert.equal(h.root.querySelector('.rank-city-link').blocked,false);
});

test('actual ranking import failure disables controls with clear feedback while leaving public rows and sources available',t=>{
  const h=rankingFixture(t),failure=new TypeError('controlled module-load failure');
  vm.runInNewContext('('+actualRankRejection+')(failure);',{...h.context,failure},{filename:'actual-ranking-rejection.js'});
  assert.equal(h.errors[0]?.[1],failure,'preserve the original exception for diagnosis');
  assert.equal(h.controls.every(c=>c.disabled),true,'failed controls must be explicitly disabled rather than silently active');
  assert.equal(h.controls.some(c=>c.closest('[inert]')),false,'clear loading inertness so unavailable controls and feedback are exposed');
  assert.match(h.notifications.join(' '),/未载入|不可用|刷新/);
  assert.equal(h.root.querySelector('.rank-city-link').blocked,false);
  assert.ok(h.root.querySelectorAll('a').some(node=>node.href==='/about/'&&!node.blocked));
});

test('rank counterexample: an accepted domestic action after binding survives the real budget-preset handler',t=>{
  const h=rankingFixture(t,{enforcePending:false});
  const clickStart=rankRuntime.indexOf("root.addEventListener('click', event => {"),clickEnd=rankRuntime.indexOf("filterToggle.addEventListener('click'",clickStart);
  assert.ok(clickStart>=0&&clickEnd>clickStart);
  vm.runInNewContext(actualFunction('change')+'\n'+actualFunction('applyPreset')+'\n'+rankRuntime.slice(clickStart,clickEnd),h.context,{filename:'actual-ranking-filter-handlers.js'});
  h.runBoot();
  h.root.querySelector('[data-quick-filter="domestic"]').click();
  assert.equal(h.context.state.country,'CN');
  h.root.querySelector('[data-preset="budget"]').click();
  assert.equal(h.context.state.country,'CN','budget selection must not be mistaken for a late saved-view restoration');
  assert.equal(h.context.state.q,'大理');assert.match(h.context.location.search,/country=CN/);
});
