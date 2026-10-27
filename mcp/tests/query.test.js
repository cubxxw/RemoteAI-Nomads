import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createSnapshot} from '../scripts/build-data.mjs';
import {publicSeedSql, publicSha256} from '../../web/scripts/bootstrap-public.mjs';
import {query} from '../src/query.js';

const seed = JSON.parse(gunzipSync(await readFile(new URL('../../web/data/public-catalog.json.gz', import.meta.url))));
const snapshot = createSnapshot(seed);
const run = (name, args = {}) => query(snapshot, 'nomads_' + name, args, {now: new Date('2026-10-26T00:00:00Z')});

test('the public projection is stable, field-limited and carries honest provenance', () => {
  assert.equal(snapshot.cities.length, 350);
  assert.equal(snapshot.countries.length, 258);
  assert.equal(snapshot.data_version, createSnapshot(seed).data_version);
  const body = JSON.stringify(snapshot);
  assert.ok(!/notion\.(?:so|com)\/|payload_hash|CREATE TABLE|\/Users\//i.test(body));
  assert.ok(snapshot.sources.every(s => !Object.hasOwn(s, 'body')));
  assert.ok(snapshot.sources.some(s => s.license_status === 'not_recorded'));
  const corrupt = structuredClone(seed); corrupt.publication.private_notes_exported = 1;
  assert.throws(() => createSnapshot(corrupt), /Private notes/);
});

test('one call resolves a country and supplies bounded candidates, evidence and known gaps', () => {
  const result = run('get_context', {place: '泰国', months: [11]});
  assert.equal(result.data.place.id, 'country:TH');
  assert.ok(result.data.candidates.length > 0 && result.data.candidates.length <= 3);
  assert.ok(result.data.candidates.every(c => c.country_code === 'TH'));
  assert.ok(result.data.candidates.every(c => c.url.startsWith('https://roamorrow.com/nomads/cities/')));
  assert.ok(result.data.candidates.some(c => c.climate.length));
  assert.ok(result.sources.length > 0);
  assert.equal(result.data.entry.applicability, 'passport_not_provided');
  assert.equal(result.data_version, snapshot.data_version);
  assert.ok(Buffer.byteLength(JSON.stringify(result)) < 65536);
});

test('name ambiguity is explicit and exact country filtering never widens to a continent', () => {
  assert.equal(run('get_context', {place: 'not-a-place'}).error.code, 'PLACE_NOT_FOUND');
  assert.equal(run('find_cities', {country: 'not-a-country'}).error.code, 'PLACE_NOT_FOUND');
  const china = run('find_cities', {country: '中国', months: [1]});
  assert.ok(china.data.cities.length > 0);
  assert.ok(china.data.cities.every(c => c.country_code === 'CN'));
  assert.equal(run('get_context', {place: 'Georgetown'}).error.code, 'AMBIGUOUS_PLACE');
});

test('hard climate filters require observations, preserve zero and exclude reviewed advisories', () => {
  const result = run('find_cities', {months: [11], min_temp: 18, max_temp: 28, limit: 20});
  assert.ok(result.data.cities.length);
  for (const c of result.data.cities) {
    const month = c.climate[0];
    assert.ok(month.mean_c >= 18 && month.mean_c <= 28);
    assert.equal(c.recommendation.eligible, true);
  }
  assert.equal(result.data.excluded_missing_climate,0,'the current public snapshot has complete climate coverage');
  const changed=structuredClone(snapshot),gap=changed.cities.find(c=>c.id==='city:chiang-mai');
  gap.climate=gap.climate.filter(row=>row.month!==11);
  const missing=query(changed,'nomads_find_cities',{months:[11],min_temp:18,max_temp:28,limit:20});
  assert.equal(missing.data.excluded_missing_climate,1);
  assert.ok(!missing.data.cities.some(c=>c.id===gap.id));
  gap.climate.push({...snapshot.cities.find(c=>c.id===gap.id).climate.find(row=>row.month===11),mean_c:0});
  gap.months[10].meanC=0;
  const zero=query(changed,'nomads_find_cities',{months:[11],min_temp:0,max_temp:0,limit:20});
  assert.equal(zero.data.cities.find(c=>c.id===gap.id).climate[0].mean_c,0);
});

test('city and national costs remain separate, with original units and dated FX', () => {
  const result = run('get_costs', {place: '东京', currency: 'CNY', limit: 50});
  assert.ok(result.data.observations.some(o => o.scope === 'city'));
  assert.ok(result.data.observations.some(o => o.scope === 'national'));
  assert.equal(result.data.reference_price_is_floor, false);
  for (const o of result.data.observations) {
    assert.ok(o.unit && o.period && o.source_id && o.observed_at);
    if (o.conversion && o.currency !== 'CNY') {
      assert.equal(o.conversion.date, '2026-10-16');
      assert.equal(o.conversion.stale, true);
    }
  }
  const country = run('get_costs', {place: '日本'});
  assert.ok(country.data.priced_cities.length > 0);
  assert.equal(country.data.scope, 'country_coverage');
});

test('entry applicability never assumes CN and unsupported passports retain the actual gap', () => {
  assert.equal(run('get_entry_rules', {country: '泰国', passport: 'US'}).data.applicability, 'passport_not_supported');
  assert.equal(run('get_entry_rules', {country: '泰国', passport: 'CN'}).data.applicability, 'requires_individual_verification');
  assert.equal(run('get_entry_rules', {country: '泰国'}).error.code, 'INVALID_ARGUMENTS');
  const oneCall = run('get_context', {country: 'MY', passport: 'US', months: [11]});
  assert.equal(oneCall.data.entry.applicability, 'passport_not_supported');
  assert.ok(oneCall.data.entry.references.length > 0);
  assert.ok(oneCall.sources.some(s => s.url.includes('mdec.my')));
});

test('budget arithmetic distinguishes group rent, per-person food and one-off costs', () => {
  const inputs = {budget: 5000, currency: 'CNY', days: 7, people: 2, reserve: 500,
    expenses: [
      {label: '整间房', category: 'housing', amount: 100, period: 'day', basis: 'group'},
      {label: '餐费', category: 'food', amount: 60, period: 'day', basis: 'person'},
      {label: '一次交通', category: 'transport', amount: 100, period: 'once', basis: 'group'},
    ]};
  const first = run('calculate_budget', inputs);
  assert.equal(first.data.spending, 1640);
  assert.equal(first.data.remaining, 2860);
  assert.equal(first.data.market_feasibility, 'unknown');
  const shorter = run('calculate_budget', {...first.data.plan, days: 3});
  assert.equal(shorter.data.spending, 760);
  assert.equal(first.data.plan.days, 7);
  assert.equal(run('calculate_budget', {...inputs, days: 0}).error.code, 'INVALID_ARGUMENTS');
});

test('meeting conversion handles date rollover and refuses nonexistent or ambiguous local times', () => {
  const winter = run('convert_meeting_time', {city: '里斯本', home_timezone: 'Asia/Shanghai', date: '2027-01-15', times: ['09:00', '18:00']});
  assert.deepEqual(winter.data.times.map(t => t.local_time), ['01:00', '10:00']);
  const invalid = run('convert_meeting_time', {city: '东京', home_timezone: 'America/New_York', date: '2027-03-14', times: ['02:30']});
  assert.equal(invalid.error.code, 'NONEXISTENT_HOME_TIME');
  const ambiguous = run('convert_meeting_time', {city: '东京', home_timezone: 'America/New_York', date: '2027-11-07', times: ['01:30']});
  assert.equal(ambiguous.error.code, 'AMBIGUOUS_HOME_TIME');
});

test('schema and data versions are enforced equally for ordinary and MCP callers', () => {
  assert.equal(run('get_catalog_info', {data_version: 'missing'}).error.code, 'DATA_VERSION_UNAVAILABLE');
  assert.equal(run('find_cities', {limit: 21}).error.code, 'INVALID_ARGUMENTS');
  assert.equal(run('get_context', {place: '泰国', sql: 'select *'}).error.code, 'INVALID_ARGUMENTS');
  assert.equal(run('does_not_exist').error.code, 'UNKNOWN_TOOL');
});

test('regional references follow reviewed area relationships rather than any same-country area', () => {
  const anji = run('get_costs', {place: '安吉', scope: 'regional', limit: 50});
  assert.equal(anji.data.observations.length, 0, 'a reviewed area relationship alone does not create an observation');
  const dali = run('get_costs', {place: '大理', scope: 'regional', limit: 50});
  assert.ok(dali.data.observations.some(o => o.area_id === 'CN:532900'));
  assert.ok(dali.data.observations.every(o => o.area_id !== 'CN:330523'));
});

test('winter presets honor warm-climate requirements, and unsupported cost categories are explicit', () => {
  const result = run('find_cities', {country: 'JP', preset: 'winter', limit: 20});
  const expected = snapshot.cities.filter(c => c.countryCode === 'JP' && !c.advisory &&
    c.months[0].meanC !== null && c.months[0].meanC >= 18 && c.months[0].meanC <= 28);
  assert.equal(result.data.total, expected.length);
  assert.equal(run('get_costs', {place: '东京', category: 'not-a-category'}).error.code, 'UNSUPPORTED_CATEGORY');
  const zeroSnapshot = structuredClone(snapshot);
  const zeroCity = zeroSnapshot.cities.find(c => c.slug === 'sydney');
  zeroCity.climate.find(m => m.month === 11).rain_mm = 0;
  zeroCity.months[10].rainMm = 0;
  const zero = query(zeroSnapshot, 'nomads_find_cities', {months: [11], max_rain: 0, limit: 20});
  assert.ok(zero.data.cities.length > 0);
  assert.ok(zero.data.cities.every(c => c.climate[0].rain_mm === 0));
});

test('the latest same-field observation wins without mixing historical samples', () => {
  const changed = structuredClone(snapshot);
  const source = changed.costs.find(o => o.city_id === 'city:sydney' && o.category === 'housing');
  changed.costs.push({...source, id: 'fixture-older', amount: 1, sample_end: '2019-01-01', checked_at: '2019-01-02'});
  const result = query(changed, 'nomads_get_costs', {place: '悉尼', category: 'housing'});
  assert.ok(result.data.observations.some(o => o.id === source.id));
  assert.ok(!result.data.observations.some(o => o.id === 'fixture-older'));
});

test('country context and a work schedule are assembled in one request', () => {
  const result = run('get_context', {country: 'TH', months: [11], work_schedule: {
    home_timezone: 'Asia/Shanghai', date: '2026-11-16', times: ['09:00','18:00'],
  }});
  assert.equal(result.data.place.id, 'country:TH');
  assert.equal(result.data.entry.applicability, 'passport_not_provided');
  assert.ok(result.data.candidates.every(c => c.work.meeting_examples.times[0].local_time === '08:00'));
  const asia = run('get_context', {region: '亚洲', months: [11], min_temp: 18, max_temp: 28});
  assert.ok(asia.data.candidates.length > 0);
  assert.ok(asia.data.candidates.every(c => c.region === '亚洲'));
});

test('a single comparison includes current snapshot price evidence and work coverage', () => {
  const result = run('compare_cities', {cities: ['清迈', '槟城'], months: [11], currency: 'CNY'});
  assert.equal(result.data.cities.length, 2);
  assert.ok(result.data.cities.every(c => c.cost_samples.observations.length > 0));
  assert.ok(result.data.cities.every(c => c.work.room_speed_measured === false));
  assert.ok(result.sources.some(s => s.id.startsWith('costcompass:')));
});

test('context prices cover available core categories without pretending to be a complete budget', () => {
  const result = run('get_context', {place: '悉尼'});
  const samples = result.data.candidates[0].cost_samples;
  assert.deepEqual(new Set(samples.observations.map(o => o.category)), new Set(['housing','food','transportation','utilities']));
  assert.ok(samples.observations.length <= 8);
  assert.equal(samples.complete, false);
  assert.equal(samples.selection, 'representative_samples_by_category');
});

test('direct city context never treats a mismatching region or climate as a matching candidate', () => {
  const cold = run('get_context', {place: '东京', months: [1], min_temp: 25});
  assert.deepEqual(cold.data.candidates, []);
  assert.equal(cold.data.requested_place.id, 'city:tokyo');
  assert.ok(cold.data.requested_place.climate[0].mean_c < 25);
  const region = run('get_context', {place: '东京', region: '欧洲'});
  assert.deepEqual(region.data.candidates, []);
  assert.equal(region.data.coverage.catalogue_cities, 0);
  const advisory = run('get_context', {place: 'city:damascus'});
  assert.deepEqual(advisory.data.candidates, []);
  assert.equal(advisory.data.requested_place.recommendation.eligible, false);
});

test('country cost queries respect category and scope and make coverage scope explicit', () => {
  const cityOnly = run('get_costs', {place: '日本', category: 'housing', scope: 'city'});
  assert.deepEqual(cityOnly.data.national_reference, []);
  assert.ok(cityOnly.data.priced_cities.every(c => snapshot.costs.some(o => o.city_id === c.id && o.category === 'housing' && o.scope === 'city')));
  assert.equal(cityOnly.data.coverage_category, 'housing');
  const national = run('get_costs', {place: '日本', category: 'housing', scope: 'national'});
  assert.ok(national.data.national_reference.length > 0);
  assert.ok(national.data.national_reference.every(o => o.scope === 'national' && o.category === 'housing'));
  assert.equal(national.data.priced_city_count, null, 'city coverage was not requested, rather than zero');
});

test('missing city timezone does not ask the user to correct a valid schedule', () => {
  const changed=structuredClone(snapshot),city=changed.cities.find(c=>c.id==='city:chiang-mai');
  city.timeZone=null;
  const result = query(changed,'nomads_get_context', {place: city.id, work_schedule: {
    home_timezone: 'Asia/Shanghai', date: '2026-11-16', times: ['09:00'],
  }});
  assert.equal(result.data.candidates[0].work.meeting_examples.error.code, 'TIMEZONE_MISSING');
});

test('representative context includes meal evidence and does not promote review-required rent', () => {
  const changed = structuredClone(snapshot);
  const cityCosts = changed.costs.filter(o => o.city_id === 'city:sydney');
  const rent = cityCosts.find(o => o.field === 'housing_1br_center');
  rent.quality = 'review'; rent.quality_flags.push('rent_outlier_requires_review');
  const sample = cityCosts.find(o => o.category === 'food');
  changed.costs.push({...sample, id: 'fixture-meal', category: 'restaurants', field: 'restaurant_inexpensive',
    label: 'Fixture single meal', period: 'meal', unit: 'meal'});
  const result = query(changed, 'nomads_get_context', {place: 'city:sydney'});
  const observations = result.data.candidates[0].cost_samples.observations;
  assert.ok(observations.some(o => o.field === 'restaurant_inexpensive'));
  assert.ok(observations.every(o => o.quality !== 'review' && !o.quality_flags.includes('rent_outlier_requires_review')));
});

test('a rechecksummed seed with an unpublished city is rejected before any related observations can be exported', () => {
  const draft = structuredClone(seed);
  const cities = draft.tables.find(t => t.name === 'cities');
  cities.rows[0][cities.columns.indexOf('publication_status')] = 'draft';
  draft.payload_sha256 = publicSha256(JSON.stringify({schema: draft.schema, tables: draft.tables}));
  draft.seed_sha256 = publicSha256(publicSeedSql(draft.tables));
  assert.throws(() => createSnapshot(draft), /Unpublished/);
});
