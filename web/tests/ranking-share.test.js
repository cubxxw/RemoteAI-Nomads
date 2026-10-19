import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseState,stateParams} from '../public/modules/ranking.js';
import {rankingPageFromData} from '../src/rank-pages.js';

const runtime=await readFile(new URL('../public/modules/rank-ui.js',import.meta.url),'utf8');
const boundary=runtime.match(/^document\.querySelector\('#map-reset'\)\.addEventListener[^\n]+$/m);
assert.ok(boundary,'locate the real share block after the map-reset binding');
const end=runtime.indexOf("motion.addEventListener('change'",boundary.index);
assert.ok(end>boundary.index,'locate the end of the real share block');
const shareBlock=runtime.slice(boundary.index+boundary[0].length,end);
const expectedURL='https://nomads.test/?region=%E6%AC%A7%E6%B4%B2&abroad=1&month=11&budget=6000&budgetCurrency=CNY&w=20%2C10%2C5%2C3%2C70%2C2';
const nextURL='https://nomads.test/?region=%E6%AC%A7%E6%B4%B2&abroad=1&month=11&budget=5000&budgetCurrency=CNY&w=20%2C10%2C5%2C3%2C70%2C2';
const flush=()=>new Promise(resolve=>setImmediate(resolve));

// Node has no DOM or system clipboard. Adapt only those boundaries; execute
// the production handler and its real stateParams, with controllable promises.
function harness({preparing=false,clipboardThrows=false,queuedClose=false}={}){
  const metrics={shows:0,selections:0,focuses:0},copies=[],elements=new Map();
  let document;
  class Element{
    constructor(){this.attributes=new Map();this.listeners=new Map();this.parts=new Map();this.open=false;this.disabled=false;this.isConnected=true;this.textContent='';}
    setAttribute(name,value){this.attributes.set(name,String(value));if(name==='disabled')this.disabled=true;}
    getAttribute(name){return this.attributes.get(name)??null;}
    removeAttribute(name){this.attributes.delete(name);if(name==='disabled')this.disabled=false;}
    addEventListener(type,listener){const list=this.listeners.get(type)||[];list.push(listener);this.listeners.set(type,list);}
    dispatch(type){return (this.listeners.get(type)||[]).map(listener=>listener({type,target:this,currentTarget:this,preventDefault(){}}));}
    querySelector(selector){return this.parts.get(selector)||null;}
    showModal(){this.open=true;metrics.shows++;}
    close(){if(!this.open)return;this.open=false;if(queuedClose)setImmediate(()=>this.dispatch('close'));else this.dispatch('close');}
    focus(){document.activeElement=this;metrics.focuses++;}
    select(){document.activeElement=this;metrics.selections++;}
  }
  const button=new Element();
  button.setAttribute('aria-label',preparing?'正在准备分享':'分享当前视角');
  if(preparing){button.disabled=true;button.setAttribute('aria-busy','true');}
  elements.set('#share-ranking',button);
  document={
    activeElement:button,
    querySelector:selector=>elements.get(selector)||null,
    getElementById:id=>elements.get('#'+id)||null,
    createElement(tag){
      assert.equal(tag,'dialog','the real share block creates its native dialog');
      const dialog=new Element(),input=new Element(),link=new Element(),status=new Element();
      for(const selector of ['input','#share-url'])dialog.parts.set(selector,input);
      dialog.parts.set('#share-open',link);dialog.parts.set('[role="status"]',status);
      return dialog;
    },
    body:{append:element=>elements.set('#'+element.id,element)},
  };
  const state=parseState(new URL(expectedURL));
  Object.assign(state,{ceiling:32997,meeting:{date:'2027-01-02',hour:17},values:{rent:{amount:32997}},personalQuote:'private-test-quote'});
  const navigator={clipboard:{writeText(value){
    if(clipboardThrows)throw new Error('clipboard unavailable');
    return new Promise((resolve,reject)=>copies.push({value,resolve,reject}));
  }}};
  vm.runInNewContext(shareBlock,{document,navigator,state,stateParams,location:{origin:'https://nomads.test',pathname:'/'},finishSearch(){},console,setTimeout,clearTimeout},{filename:'rank-ui-share-inline.js'});
  assert.equal((button.listeners.get('click')||[]).length,1,'the actual handler is bound once');
  return {button,state,copies,metrics,document,click:()=>{if(!button.disabled)button.dispatch('click');},get dialog(){return elements.get('#share-dialog');}};
}

function visibleShare(h,url=expectedURL){
  assert.equal(h.dialog?.open,true,'manual share dialog must be visible without waiting for the clipboard');
  assert.equal(h.dialog.querySelector('input').value,url);
  assert.equal(h.dialog.querySelector('#share-open').href,url);
  return h.dialog;
}

test('server-rendered share is disabled and announces preparation until its handler is ready',()=>{
  const {body}=rankingPageFromData([],new URL('https://nomads.test/'));
  const button=body.match(/<button\b(?=[^>]*\bid="share-ranking")[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button,'render the actual share button');
  assert.match(button,/\bdisabled(?:[\s=>])/,'an unbound share button must not accept an early activation');
  assert.match(button,/\baria-busy="true"/);
  const name=button.match(/\baria-label="([^"]*)"/)?.[1];
  assert.match(name,/准备/,'its accessible name explains that sharing is not ready');
});

test('binding the actual share handler enables the preparing button and restores its accessible name',()=>{
  const h=harness({preparing:true});
  assert.equal(h.button.disabled,false);
  assert.equal(h.button.getAttribute('aria-busy'),null);
  assert.equal(h.button.getAttribute('aria-label'),'分享当前视角');
});

test('pending clipboard leaves the exact public URL and open link immediately available',()=>{
  const h=harness();h.click();
  visibleShare(h);
  assert.equal(h.copies[0].value,expectedURL);
  const params=new URL(h.dialog.querySelector('input').value).searchParams;
  for(const name of ['ceiling','meeting','values','personalQuote'])assert.equal(params.has(name),false);
  assert.doesNotMatch(h.dialog.querySelector('input').value,/32997|private-test-quote/);
});

test('clipboard success confirms copying without opening or focusing the dialog a second time',async()=>{
  const h=harness();h.click();h.copies[0].resolve();await flush();
  const dialog=visibleShare(h);
  assert.match(dialog.querySelector('[role="status"]').textContent,/已复制/);
  const before={...h.metrics};await flush();
  assert.deepEqual(h.metrics,before);
  assert.equal(h.metrics.shows,1);
});

test('clipboard rejection preserves manual copying and the same open-link URL',async()=>{
  const h=harness();h.click();h.copies[0].reject(new Error('permission denied'));await flush();
  const dialog=visibleShare(h);
  assert.match(dialog.querySelector('[role="status"]').textContent,/手动复制/);
  assert.equal(h.metrics.shows,1);
});

test('an unavailable clipboard still leaves the public share dialog usable',async()=>{
  const h=harness({clipboardThrows:true});h.click();await flush();
  assert.match(visibleShare(h).querySelector('[role="status"]').textContent,/手动复制/);
});

test('duplicate activation while the dialog is open does not start another clipboard write or reset selection',()=>{
  const h=harness();h.click();h.click();
  assert.equal(h.copies.length,1,'one visible share session starts at most one automatic copy');
  visibleShare(h);
  assert.equal(h.metrics.shows,1);
  assert.equal(h.metrics.selections,1);
});

test('closing before clipboard completion prevents reopening and late focus changes',async()=>{
  const h=harness();h.click();
  const dialog=visibleShare(h);dialog.close();
  assert.equal(h.document.activeElement,h.button,'closing returns focus to the share opener');
  const before={...h.metrics};h.copies[0].resolve();await flush();
  assert.equal(dialog.open,false);
  assert.equal(h.document.activeElement,h.button);
  assert.deepEqual(h.metrics,before);
});

test('an older clipboard completion cannot replace the newer share session hint, URL or focus',async()=>{
  const h=harness();h.click();visibleShare(h).close();
  h.state.budget=5000;h.click();
  const dialog=visibleShare(h,nextURL),status=dialog.querySelector('[role="status"]');
  const hint=status.textContent,before={...h.metrics},focused=h.document.activeElement;
  h.copies[0].resolve();await flush();
  assert.equal(status.textContent,hint,'the old URL finishing must not claim the new URL was copied');
  visibleShare(h,nextURL);
  assert.equal(h.document.activeElement,focused);
  assert.deepEqual(h.metrics,before);
  h.copies[1].resolve();await flush();
  assert.match(status.textContent,/已复制/);
  visibleShare(h,nextURL);
});

test('a queued close from the previous session cannot steal focus from the reopened dialog',async()=>{
  const h=harness({queuedClose:true});h.click();visibleShare(h).close();
  h.state.budget=5000;h.click();
  visibleShare(h,nextURL);
  const focused=h.document.activeElement,before={...h.metrics};await flush();
  assert.equal(h.document.activeElement,focused);
  assert.deepEqual(h.metrics,before,'the earlier queued close must not refocus the old opener');
});

test('a queued close from the previous session cannot invalidate the newly opened copy feedback',async()=>{
  const h=harness({queuedClose:true});h.click();visibleShare(h).close();
  h.state.budget=5000;h.click();
  const dialog=visibleShare(h,nextURL),focused=h.document.activeElement;
  await flush();
  h.copies[1].resolve();await flush();
  assert.match(dialog.querySelector('[role="status"]').textContent,/已复制/);
  const hint=dialog.querySelector('[role="status"]').textContent;
  h.copies[0].resolve();await flush();
  assert.equal(dialog.querySelector('[role="status"]').textContent,hint);
  visibleShare(h,nextURL);
  assert.equal(h.document.activeElement,focused);
});
