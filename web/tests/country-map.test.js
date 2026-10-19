import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {countryGroups, countryHref, renderCountryPreview} from '../public/modules/country-map.js';

const catalog = [
  {slug:'chiang-mai',name:'清迈',countryCode:'TH',lat:18.8,lon:99},
  {slug:'bangkok',name:'曼谷',countryCode:'TH',lat:null,lon:null},
  {slug:'singapore',name:'新加坡',countryCode:'SG',lat:1.3,lon:103.8},
  {slug:'tehran',name:'德黑兰',countryCode:'IR',lat:35.7,lon:51.4},
];
const countries = [{code:'TH',name:'泰国',nameEn:'Thailand'},{code:'SG',name:'新加坡',nameEn:'Singapore'},{code:'IR',name:'伊朗',nameEn:'Iran'},{code:'AQ',name:'南极洲',nameEn:'Antarctica'}];

test('country previews distinguish filtered cities from the full catalog, preserving missing locations', () => {
  const groups = countryGroups(countries,catalog,[{...catalog[0],rank:1,score:8.5}]);
  assert.equal(groups.get('TH').cities.length,2);
  assert.equal(groups.get('TH').visible.length,1);
  assert.equal(groups.get('SG').cities.length,1);
  assert.equal(groups.get('AQ').cities.length,0);
  const html = renderCountryPreview(groups.get('TH'),'chiang-mai');
  assert.match(html,/本次筛选 1 城/);
  assert.match(html,/已收录 2 城/);
  assert.match(html,/位置待补/);
  assert.match(html,/href="\/countries\/th\/"/);
  assert.match(html,/href="\/cities\/bangkok\/"/);
  assert.match(html,/data-map-locate="chiang-mai"/);
  assert.doesNotMatch(html,/data-map-locate="bangkok"/);
});

test('empty and excluded countries stay browsable without being presented as recommendations', () => {
  const groups = countryGroups(countries,catalog,[]);
  assert.match(renderCountryPreview(groups.get('AQ')),/城市资料待补充/);
  assert.match(renderCountryPreview(groups.get('SG')),/当前筛选没有匹配城市/);
  const html = renderCountryPreview(groups.get('IR'));
  assert.match(html,/暂勿前往/);
  assert.doesNotMatch(html,/推荐城市/);
  assert.equal(countryHref('SG'),'/countries/sg/');
  assert.equal(countryHref('../x'),null);
});

test('country and city text cannot inject markup into map previews', () => {
  const group = countryGroups([{...countries[0],name:'<img onerror=x>'}],[{...catalog[0],name:'</a><script>x</script>'}],[]).get('TH');
  const html = renderCountryPreview(group);
  assert.doesNotMatch(html,/<script>|<img onerror/);
  assert.match(html,/&lt;script&gt;/);
});

test('map geometry has directory identities, including ISO fallback and tiny-country entries', async () => {
  const world = JSON.parse(await readFile(new URL('../public/map/world.json',import.meta.url),'utf8'));
  assert.equal(world.countries.length,258);
  const byCode = new Map(world.countries.map(c=>[c.code,c]));
  for (const code of ['TH','JP','FR','NO','XK']) assert.ok(byCode.get(code).paths.length,code);
  assert.equal(byCode.get('SG').name,'新加坡');
  assert.equal(byCode.get('SG').paths.length,0);
  assert.ok(byCode.get('GF').paths.length,'French Guiana has its own catalog identity');
  const franceX = [...byCode.get('FR').paths.join(' ').matchAll(/([\d.-]+),([\d.-]+)/g)].map(match=>Number(match[1]));
  assert.ok(Math.min(...franceX)>450,'French Guiana must not be linked to mainland France');
  assert.ok(world.land.length>0,'Unmatched boundaries remain unlinked instead of guessing a country');
});
