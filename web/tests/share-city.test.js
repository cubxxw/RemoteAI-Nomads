import test from 'node:test';
import assert from 'node:assert/strict';
import {cityShare,createShare,shareText,personalShare,SHARE_FORMATS} from '../public/modules/share-model.js';
import {layoutShare,prepareShareLayout} from '../public/modules/share-render.js';
const city={slug:'pokhara',name:'博卡拉',nameEn:'Pokhara',country:'尼泊尔',countryCode:'NP',budget:450,budgetCurrency:'USD',budgetCheckedAt:'2026-10-17',why:'山城 · 湖边 · 慢生活 · 第四个标签',visa:{label:'落地签'},scores:{internet:8},months:[{month:10,meanC:21.48}]};
const ctx={font:'',measureText(value){return {width:[...value].reduce((sum,char)=>sum+(char.charCodeAt(0)>255?1:.6),0)*Number(this.font.match(/(\d+)px/)?.[1]||36)};}};
const url='https://roamorrow.com/nomads/cities/pokhara/?month=10';
test('city snapshots carry four dated facts, the chosen month and at most three existing tags',()=>{
 const card=cityShare(city,10,url);
 assert.equal(card.month,10);assert.deepEqual(card.tags,['山城','湖边','慢生活']);
 assert.equal(card.facts.length,4);assert.match(card.facts[0].value,/450/);assert.match(card.facts[0].note,/2026-10-17/);
 assert.equal(card.facts[1].value,'21°C');assert.match(card.facts[2].value,/落地签/);assert.match(card.facts[2].note,/旧|复核/);
 assert.equal(card.facts[3].value,'8 / 10');assert.match(card.facts[3].label,/旧/);
 assert.match(shareText(card),/实际短租另询价/);assert.equal(new URL(card.url).searchParams.get('month'),'10');
});
test('missing city data stays missing while an explicitly recorded zero score stays zero',()=>{
 const card=cityShare({...city,budget:null,visa:null,scores:{internet:0},months:[]},10,url);
 assert.deepEqual(card.facts.map(fact=>fact.value),['待补充','待补充','待补充','0 / 10']);
 assert.equal(cityShare({...city,scores:{internet:null}},10,url).facts[3].value,'待补充');
 assert.equal(cityShare({...city,scores:{internet:''}},10,url).facts[3].value,'待补充');
});
test('portrait city poster has aligned 2 by 2 values, a month eyebrow and a compact link footer',()=>{
 const card=cityShare(city,10,url);
 for(const photo of [true,false]){
  const {layout}=prepareShareLayout(ctx,card,SHARE_FORMATS[0],{photo,textOnly:!photo});
  assert.equal(layout.pages.length,1);const blocks=layout.pages[0].blocks;
  const values=blocks.filter(b=>b.role==='fact-value');assert.equal(values.length,4);
  assert.equal(values[0].y,values[1].y);assert.equal(values[2].y,values[3].y);
  assert.equal(values[0].x,values[2].x);assert.equal(values[1].x,values[3].x);assert.ok(values[2].y>values[0].y);
  assert.ok(blocks.some(b=>b.text==='10月 / 城市手记'));assert.equal(blocks.some(b=>b.type==='photo'),photo);
  assert.equal(blocks.filter(b=>b.type==='chip').length,3);
  assert.doesNotMatch(blocks.map(b=>b.text||'').join(''),/实际短租另询价|工作许可另查。/);
  const qr=blocks.find(b=>b.type==='qr'),rule=blocks.findLast(b=>b.type==='rule');
  assert.ok(qr);assert.ok(blocks.filter(b=>b.y>rule.y&&b.type==='text').every(b=>b.text.startsWith('roamorrow.com/')));
  assert.ok(blocks.every(b=>b.y+b.height<=layout.height));
 }
});
test('official travel advisories remain visible even when generic caveats move into the caption',()=>{
 const card=cityShare({...city,countryCode:'AF',slug:'kabul',name:'喀布尔'},10,url);
 const personal=personalShare(card,{caveats:['个人开销另计'],summary:'我的方案'});
 for(const input of [card,personal]){
  const blocks=layoutShare(ctx,input,SHARE_FORMATS[0]).pages.flatMap(p=>p.blocks);
  assert.match(blocks.map(b=>b.text||'').join(''),/官方暂勿前往提醒/);
  assert.match(shareText(input),/官方暂勿前往提醒/);
 }
});
test('a long visa value keeps both rows aligned without crossing the QR footer',()=>{
 const card=createShare({...cityShare(city,10,url),facts:[{label:'历史月花费',value:'US$450',note:'核对 2026-10-17'},{label:'10月历史均温',value:'21°C',note:'历史气候'},{label:'入境参考',value:'需要提前向使领馆申请并核对停留期',note:'旧标签待复核'},{label:'网络旧评分',value:'8 / 10',note:'需实测'}]});
 const blocks=layoutShare(ctx,card,SHARE_FORMATS[0],{photo:true}).pages[0].blocks;
 const values=blocks.filter(b=>b.role==='fact-value');assert.ok(values.length>=4);
 assert.equal(values.find(b=>b.text==='8 / 10').y,values[2].y);
 const qr=blocks.find(b=>b.type==='qr');assert.ok(values.every(b=>b.y+b.height<qr.y));
});
