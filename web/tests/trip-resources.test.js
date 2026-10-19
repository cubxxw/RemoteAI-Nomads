import test from 'node:test';
import assert from 'node:assert/strict';
import {entryResourceMarkup,workspaceResourceMarkup} from '../src/trip-resources.js';

test('short-stay checks point to the relevant official source and keep work permission separate',()=>{
  const thai=entryResourceMarkup('TH');
  assert.match(thai,/https:\/\/thaiembbeij.org\/th\/news\/updateofvisaexemption\//);
  assert.match(thai,/2026-09-02/);assert.match(thai,/30 天/);assert.match(thai,/工作许可/);
  assert.match(entryResourceMarkup('MY'),/www.imi.gov.my/);
  assert.equal(entryResourceMarkup('CN'),'');
  assert.equal(entryResourceMarkup('<script>'),'');
});
test('a concrete Lisbon workspace has operator rules, phone-booth evidence, scope and a checked date',()=>{
  const html=workspaceResourceMarkup('lisbon');
  assert.match(html,/Second Home Mercado/);assert.match(html,/08:00–22:00/);
  assert.match(html,/电话间/);assert.match(html,/2026-10-19/);
  assert.match(html,/secondhome.io\/faqs\//);assert.match(html,/日票/);
  assert.match(html,/空位|预约/);assert.match(html,/未实测/);
  assert.equal(workspaceResourceMarkup('chiang-rai'),'');
});
