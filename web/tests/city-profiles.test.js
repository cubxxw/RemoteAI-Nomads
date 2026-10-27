import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../public/', import.meta.url);
const cities = JSON.parse(readFileSync(new URL('published-pages/rankings.json', root), 'utf8'));
const editorial = JSON.parse(readFileSync(new URL('../scripts/city-profile-editorial.json', import.meta.url), 'utf8'));
const profiles = cities.map(city => ({ city, profile: JSON.parse(readFileSync(new URL(`city-profiles/${city.slug}.json`, root), 'utf8')) }));

test('every published city has a separate, identity-preserving profile', () => {
  assert.equal(profiles.length, 350);
  assert.equal(readdirSync(new URL('city-profiles/', root)).filter(name => name.endsWith('.json')).length, cities.length);
  for (const { city, profile } of profiles) {
    assert.equal(profile.schemaVersion, 1, city.slug);
    for (const field of ['slug', 'name', 'nameEn']) assert.equal(profile[field], city[field], `${city.slug}.${field}`);
    for (const field of ['geography', 'statistics', 'landmarks', 'culture', 'tags', 'sources']) assert.ok(Array.isArray(profile[field]), `${city.slug}.${field}`);
    assert.ok(profile.tagline.trim(), city.slug);
    assert.ok(profile.geography.some(row => row.label === '国家 / 地区' && row.value === (editorial.countryDisplayNames[city.countryCode] || city.country)), city.slug);
    assert.ok(profile.landmarks.length <= 2, city.slug);
  }
});

test('facts retain provenance, scope and the boundaries of existing measurements', () => {
  for (const { city, profile } of profiles) {
    assert.ok(profile.sources.length > 0, city.slug);
    for (const source of profile.sources) {
      assert.equal(new URL(source.url).protocol, 'https:');
      assert.match(source.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(source.title.trim());
    }
    for (const row of profile.statistics) {
      assert.ok(row.label && row.value, city.slug);
      if (/人口|面积|GDP|生产总值/i.test(row.label)) {
        assert.match(row.note, /(?:19|20)\d{2}/, `${city.slug}: numeric fact needs a year`);
        assert.match(row.note, /市域|市区|都会区|行政区|城市|全市|都市区|县域/, `${city.slug}: numeric fact needs scope`);
      }
    }
    const text = JSON.stringify(profile);
    assert.doesNotMatch(text, /待补|待完善|AI 生成|AI创作|成本指标较高/);
    assert.doesNotMatch(text, /"label":"(?:本月气温|本月降雨|月预算|网速)"/, 'monthly observations belong to the live city data');
    if (city.lat == null || city.lon == null) {
      assert.ok(!profile.geography.some(row => row.label === '地理坐标'), `${city.slug}: do not invent missing catalog coordinates`);
    }
  }
});

test('the two focal profiles carry named local identity and primary sources', () => {
  const pokhara = profiles.find(({ city }) => city.slug === 'pokhara').profile;
  const laPaz = profiles.find(({ city }) => city.slug === 'la-paz').profile;
  assert.ok(pokhara.landmarks.some(row => /费瓦湖/.test(row.title)));
  assert.ok(pokhara.landmarks.some(row => /和平塔/.test(row.title)));
  assert.ok(pokhara.sources.some(source => new URL(source.url).hostname === 'ntb.gov.np'));
  assert.ok(pokhara.statistics.some(row => row.label === '人口' && /2021.*大都市行政区/.test(row.note)));
  assert.ok(pokhara.culture.some(row => row.label === '当地吃食' && /达尔巴特.*莫莫/.test(row.value)));
  assert.ok(pokhara.sources.some(source => source.url === 'https://pokharatourism.org.np/food-and-cuisine/'));
  assert.ok(laPaz.landmarks.some(row => /Killi Killi/.test(row.title)));
  assert.ok(laPaz.landmarks.some(row => /月亮谷/.test(row.title)));
  assert.ok(laPaz.culture.some(row => /Chairo/.test(row.value)));
  assert.ok(laPaz.sources.some(source => new URL(source.url).hostname === 'lapaz.bo'));
  for (const profile of [pokhara, laPaz]) {
    assert.equal(profile.landmarks.length, 2);
    assert.ok(profile.culture.length >= 1);
    assert.ok(profile.tags.length >= 2);
  }
});

test('new representative coordinates retain their own reviewed source and date', () => {
  const newLocations = ['lanzarote', 'ponta-do-sol', 'ella', 'ahangama-weligama', 'siargao', 'kuta-lombok', 'canggu', 'koh-phangan'];
  for (const slug of newLocations) {
    const { city, profile } = profiles.find(({ city }) => city.slug === slug);
    assert.ok(Number.isFinite(city.lat) && Number.isFinite(city.lon), slug);
    assert.ok(profile.geography.some(row => row.label === '地理坐标' && /代表点/.test(row.note)), slug);
    assert.ok(profile.statistics.some(row => row.label === '时区' && row.value === city.timeZone), slug);
    assert.ok(profile.sources.some(source => new URL(source.url).hostname === 'geocoding-api.open-meteo.com' && source.date === '2026-10-27'), slug);
  }
});
