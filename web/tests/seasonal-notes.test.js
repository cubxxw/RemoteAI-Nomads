import test from 'node:test';
import assert from 'node:assert/strict';
import edition from '../data/seasonal-2026-10.json' with {type:'json'};
import currentEdition from '../data/seasonal-2026-11.json' with {type:'json'};
import {cityText} from '../public/modules/city-copy.js';
import {seasonalCityNote,seasonalProfile} from '../src/seasonal-notes.js';

test('every researched city gets a dated observation and readable provenance without claiming a current quote',()=>{
  assert.equal(edition.cities.length,16);
  const replacements=new Set(currentEdition.cities.map(city=>city.slug));
  for(const city of edition.cities.filter(city=>!replacements.has(city.slug))){
    const body=seasonalCityNote(city.slug);
    assert.match(body,/2026年10月 · 旅居观察/);assert.match(body,/2026-10-18/);
    assert.ok(body.includes(cityText(city.summary)));
    assert.match(body,/不代表本月报价或房间测速/);
    assert.ok(body.includes('guides/seasonal-2026-10.md#'+city.slug));
    assert.ok(city.sources.some(source=>body.includes(source.url.replace(/&/g,'&amp;'))));
    assert.equal(seasonalProfile(city.slug),city);
  }
});
test('unresearched cities do not inherit another destination’s seasonal advice',()=>{
  assert.equal(seasonalProfile('not-in-this-edition'),null);
  assert.equal(seasonalCityNote('not-in-this-edition'),'');
});
test('a truncated Shenzhen social search is kept out of the readable source disclosure',()=>{
  const body=seasonalCityNote('shenzhen');
  assert.ok(!body.includes('6ace3fdd000000000b007948'));
  assert.match(body,/这段建议的来源/);
});
test('workspace conditions retain their direct operator and first-hand evidence in the disclosure',()=>{
  assert.match(seasonalCityNote('munich'),/https:\/\/en.werk1.com\/coworking-munich-werk1\//);
  assert.match(seasonalCityNote('fethiye'),/https:\/\/www.holdall.work\/destinations\/fethiye/);
});

test('new observations show their own month while unrevisited cities retain October dates',()=>{
 for(const city of currentEdition.cities){
  const body=seasonalCityNote(city.slug);
  assert.match(body,/2026年11月 · 旅居观察/);
  assert.ok(body.includes('核对 '+city.checked_at));
  assert.ok(body.includes(cityText(city.summary)));
  assert.ok(body.includes('guides/seasonal-2026-11.md#'+city.slug));
  assert.equal(seasonalProfile(city.slug),city);
 }
 assert.match(seasonalCityNote('munich'),/2026年10月/);
 assert.match(seasonalCityNote('munich'),/2026-10-18/);
 const chiangMai=currentEdition.cities.find(city=>city.slug==='chiang-mai');
 assert.equal(chiangMai.checked_at,'2026-11-14');
 assert.equal(chiangMai.sources.find(source=>source.url.includes('t20260902_12014754')).read_at,'2026-11-01');
 assert.equal(chiangMai.sources.find(source=>source.url.includes('newsndj_2026_english.pdf')).read_at,'2026-11-14');
});

test('a new policy or weather observation preserves the older operator and social evidence with its original date',()=>{
 const overlapping=edition.cities.filter(city=>currentEdition.cities.some(latest=>latest.slug===city.slug));
 assert.ok(overlapping.length>0);
 for(const city of overlapping){
  const body=seasonalCityNote(city.slug);
  assert.match(body,/2026年11月 · 旅居观察/);assert.match(body,/2026年10月 · 旅居观察/);
  assert.ok(body.includes(cityText(city.summary)));
  assert.ok(body.includes('核对 2026-10-18'));
  assert.ok(body.includes('guides/seasonal-2026-10.md#'+city.slug));
  for(const source of city.sources.filter(source=>! /search|blocked|unavailable|受限|检索/.test(source.read_scope||'')))assert.ok(body.includes(source.url.replace(/&/g,'&amp;')));
  const ids=[...body.matchAll(/id="(seasonal-note-title-[^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size);
 }
});
