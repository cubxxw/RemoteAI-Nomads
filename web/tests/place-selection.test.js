import test from 'node:test';
import assert from 'node:assert/strict';
import {selectPlaceCities} from '../scripts/place-selection.mjs';
const catalog = [{slug:'hanoi',lat:21,lon:105},{slug:'dali',lat:25,lon:100},{slug:'unknown',lat:null,lon:null}];
test('default collection fills gaps while an explicit refresh includes old snapshots', () => {
  assert.deepEqual(selectPlaceCities(catalog,{hanoi:{}}).map(c=>c.slug),['dali']);
  assert.deepEqual(selectPlaceCities(catalog,{hanoi:{}},{selected:['hanoi'],refresh:true}).map(c=>c.slug),['hanoi']);
});
test('refresh cannot silently collect the world or ignore mistyped/missing-coordinate cities', () => {
  assert.throws(()=>selectPlaceCities(catalog,{}, {refresh:true}),/requires/);
  assert.throws(()=>selectPlaceCities(catalog,{}, {selected:['typo']}),/Unknown/);
  assert.throws(()=>selectPlaceCities(catalog,{}, {selected:['unknown']}),/coordinates/);
});
