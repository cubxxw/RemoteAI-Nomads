import test from 'node:test';
import assert from 'node:assert/strict';
import edition from '../data/seasonal-2026-10.json' with {type:'json'};
import {cityText} from '../public/modules/city-copy.js';
import {seasonalCityNote,seasonalProfile} from '../src/seasonal-notes.js';

test('every researched city gets a dated observation and readable provenance without claiming a current quote',()=>{
  assert.equal(edition.cities.length,16);
  for(const city of edition.cities){
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
