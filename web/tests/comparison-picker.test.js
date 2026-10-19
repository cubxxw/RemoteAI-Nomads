import test from 'node:test';
import assert from 'node:assert/strict';
import {initContentPage} from '../public/modules/content-ui.js';

test('comparison picker keeps changed city cards, photos and the journey month inside its mount',()=>{
 const previous={document:globalThis.document,location:globalThis.location};
 const cities=[{slug:'chiang-mai',name:'清迈',photo:'/photos/chiang-mai.webp'},{slug:'penang',name:'槟城',photo:'/photos/penang.webp'}];
 const cards=[{image:{},querySelector(){return this.image;}},{image:{},querySelector(){return this.image;}}];
 const selects=cities.map((city,index)=>({value:city.slug,dataset:{pairSelect:String(index)},addEventListener(name,callback){this[name]=callback;},setAttribute(){}}));
 const text={textContent:''},picker={
  querySelectorAll(){return selects;},
  querySelector(selector){
   if(selector==='#compare-city-data')return {textContent:JSON.stringify(cities)};
   const side=selector.match(/^\[data-pair-city="(\d)"\]$/);if(side)return cards[Number(side[1])];
   if(selector==='[data-compare-form]')return {addEventListener(){}};
   return text;
  },
 };
 globalThis.location={href:'https://roamorrow.com/nomads/compare/?month=11'};
 globalThis.document={documentElement:{dataset:{nomadsBase:'/nomads'}},querySelector:selector=>selector==='[data-compare-index]'?picker:null};
 try{
  initContentPage();
  assert.equal(cards[0].href,'/nomads/cities/chiang-mai/?month=11');assert.equal(cards[0].image.src,'/nomads/photos/chiang-mai.webp');
  selects[0].value='penang';selects[0].change();
  assert.equal(cards[0].href,'/nomads/cities/penang/?month=11');assert.equal(cards[0].image.src,'/nomads/photos/penang.webp');
 }finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}
});
