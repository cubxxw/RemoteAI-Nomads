import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
const source=await readFile(new URL('../content/city-guides/reader.js',import.meta.url),'utf8');

function reader(nativeDetails) {
  const documentHandlers={}, linkHandlers={}, menuHandlers={}, buttonHandlers={};
  const attributes=new Map([['aria-expanded','false']]);
  const controller={focused:false,focus(){this.focused=true;},setAttribute(k,v){attributes.set(k,v);},getAttribute(k){return attributes.get(k);},addEventListener(k,v){buttonHandlers[k]=v;}};
  const panel={hidden:false};
  const link={hash:'#chapter',setAttribute(){},removeAttribute(){},addEventListener(k,v){linkHandlers[k]=v;}};
  const section={id:'chapter',dataset:{chapterTitle:'Chapter'},getBoundingClientRect(){return{top:100};},scrollIntoView(){},focus(){}};
  const menu={tagName:nativeDetails?'DETAILS':'DIV',open:false,classList:{toggle(){}},contains(target){return[menu,controller,panel,link].includes(target);},querySelector(selector){return selector==='button'?(nativeDetails?null:controller):selector==='summary'?(nativeDetails?controller:null):selector==='[data-chapter-panel]'?panel:null;},addEventListener(k,v){menuHandlers[k]=v;}};
  const document={documentElement:{scrollHeight:2000},querySelectorAll(selector){return selector==='[data-reader-section]'?[section]:selector==='[data-chapter-link]'?[link]:[];},querySelector(selector){return selector==='[data-mobile-chapters]'?menu:null;},getElementById(id){return id==='chapter'?section:null;},addEventListener(k,v){documentHandlers[k]=v;}};
  const location={hash:''};
  const context={document,window:{matchMedia(){return{matches:true};},addEventListener(){}},location,history:{pushState(_state,_title,hash){location.hash=hash;}},innerHeight:844,innerWidth:390,scrollY:0,requestAnimationFrame(fn){fn();},IntersectionObserver:class{observe(){}disconnect(){}}};
  runInNewContext(source,context);
  function open(){if(nativeDetails)menu.open=true;else buttonHandlers.click();}
  function isOpen(){return nativeDetails?menu.open:attributes.get('aria-expanded')==='true';}
  return{open,isOpen,controller,linkHandlers,documentHandlers,location};
}
for(const native of [true,false]) {
  test(`${native?'native details':'legacy button'} chapters close after selection, Escape and outside click`,()=>{
    const r=reader(native);
    r.open();assert.equal(r.isOpen(),true);
    r.linkHandlers.click({preventDefault(){}});
    assert.equal(r.location.hash,'#chapter');assert.equal(r.isOpen(),false);
    r.open();r.documentHandlers.keydown({key:'Escape',preventDefault(){}});
    assert.equal(r.isOpen(),false);assert.equal(r.controller.focused,true);
    r.open();r.documentHandlers.click({target:{}});assert.equal(r.isOpen(),false);
  });
}
