import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseState,rankCities,displayMonth} from '../public/modules/ranking.js';
import {rankingShare,cityShare} from '../public/modules/share-model.js';
import {rankingPageFromData} from '../src/rank-pages.js';
const runtime=await readFile(new URL('../public/modules/rank-ui.js',import.meta.url),'utf8');
const start=runtime.indexOf("const shareButton = document.querySelector('#share-ranking');");
const block=runtime.slice(start,runtime.indexOf("motion.addEventListener('change'",start));
const expectedURL='https://nomads.test/?region=%E6%AC%A7%E6%B4%B2&abroad=1&month=11&budget=6000&budgetCurrency=CNY&w=20%2C10%2C5%2C3%2C70%2C2';
function harness(){
 const handlers=new Map(),button={disabled:true,attrs:new Map([['aria-busy','true']]),addEventListener(type,fn){handlers.set(type,fn);},removeAttribute(name){this.attrs.delete(name);},setAttribute(name,value){this.attrs.set(name,value);}},state=parseState(new URL(expectedURL)),opened=[];
 Object.assign(state,{personalQuote:'private-test-quote',meeting:{date:'2027-01-02'},ceiling:32997});let copies=0,finished=0;
 vm.runInNewContext(block,{document:{querySelector:()=>button},root:{addEventListener(){}},state,data:[],rankCities,displayMonth,rankingShare,cityShare,location:{href:expectedURL},finishSearch(){finished++;},openShare(card,opener){opened.push({card,opener});},navigator:{clipboard:{writeText(){copies++;return new Promise(()=>{});}}}});
 return {button,state,opened,click:()=>handlers.get('click')(),get copies(){return copies;},get finished(){return finished;}};
}
test('server share stays disabled with an explanation until its state-bound handler is ready',()=>{const {body}=rankingPageFromData([],new URL('https://nomads.test/'));const button=body.match(/<button\b(?=[^>]*\bid="share-ranking")[^>]*>/)?.[0];assert.match(button,/disabled/);assert.match(button,/aria-busy="true"/);assert.match(button,/准备/);});
test('bound ranking opens the real current snapshot without waiting for or writing the clipboard',()=>{const h=harness();assert.equal(h.button.disabled,false);assert.equal(h.button.attrs.has('aria-busy'),false);h.click();assert.equal(h.opened[0].card.url,expectedURL);assert.equal(h.opened[0].opener,h.button);assert.equal(h.finished,1);assert.equal(h.copies,0);assert.doesNotMatch(JSON.stringify(h.opened[0].card),/private-test-quote|32997|2027-01-02/);});
test('the next share reads new state rather than reusing an earlier URL',()=>{const h=harness();h.click();h.state.budget=5000;h.click();assert.equal(new URL(h.opened[0].card.url).searchParams.get('budget'),'6000');assert.equal(new URL(h.opened[1].card.url).searchParams.get('budget'),'5000');});
