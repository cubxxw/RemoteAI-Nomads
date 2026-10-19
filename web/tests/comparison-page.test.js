import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonBody, comparisonFit, compactMonths } from '../src/comparison-page.js';

const city=(name,overrides={})=>({slug:name,name,nameEn:name,country:'测试地区',photo:'/images/city-test.webp',budget:1000,scores:{safety:8,cost:8,climate:8,life:8,internet:8,community:8},months:Array.from({length:12},(_,index)=>({month:index+1,status:'unknown',meanC:null,rainMm:null})),visa:{label:'待核验',detail:'旧资料'},...overrides});

test('OSM density and an uncollected historical community label never receive a cross-source winner',()=>{
  const a=city('chiang-mai',{communityPlaces:{coworking:14,cafes:948,checkedAt:'2026-10-19'}}),b=city('chiang-rai',{scores:{safety:8,cost:8,climate:8,life:8,internet:8,community:0}});
  const html=comparisonBody(a,b,11),row=html.match(/data-comparison-metric="community"[\s\S]*?<\/tr>/)[0];
  assert.doesNotMatch(row,/comparison-winner|winner-label/);
  assert.match(row,/OSM/);assert.match(row,/历史社区标签/);assert.match(row,/地点待采集/);
  assert.doesNotMatch(comparisonFit(a,b,11),/游民氛围/);
});

test('comparison preserves missing weather and prices instead of inventing zero or a winner',()=>{
  const html=comparisonBody(city('a',{budget:null}),city('b'),1);
  const budget=html.match(/data-comparison-metric="budget"[\s\S]*?<\/tr>/)[0];
  assert.ok(!budget.includes('comparison-winner'));
  assert.match(budget,/<strong>—<\/strong>/);
  assert.match(html,/data-comparison-weather="0"><strong>—<\/strong><small>降雨待补/);
});

test('a lower historical budget and higher metric receive distinct comparison labels',()=>{
  const html=comparisonBody(city('a',{budget:900}),city('b',{scores:{safety:9,cost:8,climate:8,life:8,internet:8,community:8}}),1);
  assert.match(html,/低 \$100/);
  assert.match(html,/高 1\.0/);
  const life=html.match(/data-comparison-metric="life"[\s\S]*?<\/tr>/)[0];
  assert.match(life,/data-equal="true"/);
  assert.ok(!life.includes('comparison-winner'));
});

test('weather treats zero degrees and zero rainfall as observations',()=>{
  const a=city('a');a.months[0]={month:1,status:'unknown',meanC:0,rainMm:0};
  assert.match(comparisonBody(a,city('b'),1),/data-comparison-weather="0"><strong>0°C<\/strong><small>雨量 0 mm/);
});

test('city input is escaped and embedded comparison data cannot terminate its script',()=>{
  const html=comparisonBody(city('</script><img onerror="bad()">'),city('b'),1);
  assert.ok(!html.includes('</script><img'));
  assert.match(html,/&lt;\/script&gt;&lt;img/);
  assert.match(html,/\\u003c\/script>/);
});

test('identical or missing metrics do not produce a fabricated suitability advantage',()=>{
  assert.equal(comparisonFit(city('a'),city('b')),'先比较你的预算和出发月份，再做选择。');
  const a=city('a');a.months[0].status='recommended';
  assert.equal(comparisonFit(a,city('b')),'可优先看看 1 月的出发条件。');
});

test('recommended month ranges preserve gaps rather than suggesting the entire year',()=>{
 assert.equal(compactMonths([1,11,12]),'1、11–12 月');
 assert.equal(compactMonths([6,3,4,5,3]),'3–6 月');
 assert.equal(compactMonths([1,2,4,5,7]),'1–2、4–5、7 月');
 assert.equal(compactMonths(Array.from({length:12},(_,i)=>i+1)),'1–12 月');
 assert.equal(compactMonths([]),'—');
});
