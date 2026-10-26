// Input is the checksummed public seed, never a local development database.
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile, readdir, unlink} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve, dirname} from 'node:path';
import {validatePublicSeed} from '../../web/scripts/bootstrap-public.mjs';
import {enrichCommunity} from '../../web/src/community.js';
import {travelAdvisory} from '../../web/public/modules/recommendation-policy.js';
import articles from '../../web/data/article-catalog.json' with {type: 'json'};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pick = (row, keys) => Object.fromEntries(keys.split(' ').filter(k => Object.hasOwn(row, k)).map(k => [k, row[k]]));
const hash = value => createHash('sha256').update(value).digest('hex');

export function createSnapshot(seed) {
  validatePublicSeed(seed);
  const rows = name => {
    const table = seed.tables.find(t => t.name === name);
    return table.rows.map(values => Object.fromEntries(table.columns.map((key, i) => [key, values[i]])));
  };
  const countries = rows('countries').map(r => pick(r, 'id iso2 name_zh name_en region'));
  const byCountry = new Map(countries.map(c => [c.id, c]));
  const scores = new Map(rows('city_scores').map(r => [r.city_id, r]));
  const publicCities = rows('cities');
  if (publicCities.some(c => c.publication_status !== 'published') ||
      rows('editorial_pages').some(p => p.status !== 'published')) throw Error('Unpublished content in the public seed');
  const locations = new Map(rows('city_locations').map(r => [r.city_id, r]));
  const entries = rows('city_entry_conditions');
  const climate = rows('city_climate_months');
  const months = rows('city_months');
  const cities = publicCities.map(c => {
    const s = scores.get(c.id), l = locations.get(c.id), e = entries.find(e => e.city_id === c.id && e.passport === 'CN');
    const country = byCountry.get(c.country_id);
    const historic = climate.filter(r => r.city_id === c.id);
    const city = enrichCommunity({
      slug: c.slug, name: c.name_zh, nameEn: c.name_en, country: country.name_zh,
      countryCode: country.iso2, countryId: country.id, region: c.region,
      budget: c.budget_amount, budgetBasis: c.budget_basis, why: s?.why_short || c.summary,
      scores: Object.fromEntries(['safety','cost','climate','life','internet','community'].map(k => [k, s?.[k] ?? null])),
      visa: {code: e?.entry_type || 'unknown', label: e?.label || '待核验', detail: e?.detail || ''},
      lat: l?.latitude ?? null, lon: l?.longitude ?? null, timeZone: l?.timezone ?? null,
      months: Array.from({length: 12}, (_, i) => {
        const old = months.find(m => m.city_id === c.id && m.month === i + 1);
        const weather = historic.find(m => m.month === i + 1);
        return {month: i + 1, status: old?.suitability || 'unknown',
          meanC: weather?.mean_c ?? null, highC: weather?.high_c ?? null, rainMm: weather?.rain_mm ?? null};
      }),
    });
    return {...city, id: 'city:' + c.slug, url: 'https://roamorrow.com/nomads/cities/' + c.slug + '/',
      checked_at: c.checked_at, advisory: travelAdvisory(city), score_evidence: 'legacy_unverified',
      source_ids: [...new Set([s?.source_id, l?.source_id, c.budget_source_id, e?.source_id,
        ...months.filter(m => m.city_id === c.id).map(m => m.source_id), ...historic.map(m => m.source_id)].filter(Boolean))],
      climate: historic.map(m => pick(m, 'month mean_c high_c rain_mm sample_days period_start period_end model checked_at source_id'))};
  });
  const sources = rows('sources').map(s => ({...pick(s, 'id url title publisher kind license accessed_at'),
    license_status: s.license ? 'recorded' : 'not_recorded', export_scope: 'metadata_and_reviewed_facts'}));
  const payload = {
    schema_version: 1, source_snapshot_date: seed.snapshot_date,
    origin: 'https://roamorrow.com/nomads', countries, cities, sources,
    costs: rows('cost_observations').map(r => ({...pick(r,
      'id provider city_id country_id scope category field label amount currency period unit household_size sample_start sample_end sample_size min_amount max_amount quality source_id checked_at'),
      quality_flags: JSON.parse(r.quality_flags || '[]')})),
    regional: rows('regional_reference_observations').map(r => ({...pick(r,
      'id area_id provider category field label amount currency period unit population_scope market_type sample_start sample_end published_at source_locator source_id checked_at'),
      scope: 'regional', city_id: null, quality: 'official_reference', quality_flags: ['regional_reference','not_city_quote','not_monthly_budget']})),
    regional_links: rows('city_geo_areas').map(r => pick(r, 'city_id area_id relation')),
    areas: rows('geo_areas').map(r => pick(r, 'id country_id name_zh name_en level')),
    fx: rows('fx_rates').map(r => pick(r, 'base quote rate rate_date checked_at source_id')),
    entries: entries.map(r => pick(r, 'city_id passport label detail evidence_level checked_at source_id')),
    policies: rows('visa_programs').map(r => pick(r,
      'id country_id name kind stay_text financial_rule work_scope passport_scope restriction verification source_published_at effective_at checked_at source_id')),
    workspaces: rows('workspace_quotes').map(r => pick(r,
      'city_id operator plan amount currency period access_hours network_claim restriction validity source_id checked_at')),
    services: rows('ai_availability').map(r => pick(r, 'country_id product status detail checked_at tested source_id')),
    guides: articles.entries.filter(a => a.status === 'published').map(a => pick(a, 'slug title summary path updatedAt citySlugs')),
  };
  const text = JSON.stringify(payload);
  if (/https?:\/\/[^\s"'<>]*notion\.(?:so|com)\//iu.test(text) || /\/Users\/|\bsk-[a-zA-Z0-9_-]{20,}/u.test(text)) {
    throw Error('Private content cannot enter public data');
  }
  for (const source of sources) {
    const url = new URL(source.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        [...url.searchParams.keys()].some(k => /^(?:access_token|api_key|token|secret)$/i.test(k))) {
      throw Error('Access-bearing source URL cannot enter public data');
    }
  }
  return {data_version: 'public-' + hash(text).slice(0, 20), ...payload};
}

export async function buildData() {
  const seed = JSON.parse(gunzipSync(await readFile(resolve(ROOT, '../web/data/public-catalog.json.gz'))));
  const snapshot = createSnapshot(seed), body = JSON.stringify(snapshot);
  const directory = resolve(ROOT, 'public/data');
  await mkdir(directory, {recursive: true});
  await writeFile(resolve(directory, snapshot.data_version + '.json'), body);
  const manifest = {schema_version: 1, data_version: snapshot.data_version,
    source_snapshot_date: snapshot.source_snapshot_date, sha256: hash(body),
    path: '/data/' + snapshot.data_version + '.json', bytes: Buffer.byteLength(body)};
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest));
  // This directory contains generated projections only. Do not ship obsolete
  // projections as accidental archives after publication fields change.
  for (const file of await readdir(directory)) {
    if (/^public-[0-9a-f]{20}\.json$/.test(file) && file !== snapshot.data_version + '.json') await unlink(resolve(directory, file));
  }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await buildData()));
}
