import { readEstatWorkbook } from './cost-xlsx.js';
import { ESTAT_METHOD_SOURCES } from './cost-data.js';

export const COSTCOMPASS_CITIES_URL = 'https://costcompass.net/data/cities.json';
export const COSTCOMPASS_PRICES_URL = 'https://costcompass.net/data/prices.csv';
export const ECB_RATES_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export const ECB_PAGE_URL = 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';
const DAY = 86400000;
const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
const normalize = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Explicit same-city spellings; never region -> city or country -> capital fallbacks.
const ALIASES = { saigon: 'hochiminhcity', hochiminh: 'hochiminhcity', bangalore: 'bengaluru', newyork: 'newyorkcity', rangoon: 'yangon' };
const key = s => ALIASES[normalize(s)] || normalize(s);
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
const query = async (env, sql, args = []) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const encoder = new TextEncoder();
// Below D1's 100 KB SQL limit as an additional conservative bound on each JSON binding.
const JSON_CHUNK_BYTES = 90000;
const bytes = s => encoder.encode(s).byteLength;

function jsonObjectChunks(records) {
  const chunks = []; let current = [], size = 2;
  for (const record of records) {
    const next = bytes(JSON.stringify(record));
    if (next + 2 > JSON_CHUNK_BYTES) throw Error('COST_ROW_PARAMETER_LIMIT');
    if (size + next + (current.length ? 1 : 0) > JSON_CHUNK_BYTES) { chunks.push(JSON.stringify(current)); current = []; size = 2; }
    size += next + (current.length ? 1 : 0); current.push(record);
  }
  if (current.length) chunks.push(JSON.stringify(current));
  return chunks;
}

// Dictionary-encoded tuples avoid repeating field labels, URLs and provenance in each row.
// SQLite reconstructs the same original values; the content hash remains unchanged.
function dictionaryChunks(records) {
  const chunks = []; let doc, dictionary, size;
  const reset = () => { doc = { strings: [], rows: [] }; dictionary = new Map(); size = bytes(JSON.stringify(doc)); };
  reset();
  function encode(record) {
    const added = []; let extra = 0;
    const row = record.map(value => {
      if (typeof value !== 'string') return value;
      if (!dictionary.has(value)) {
        extra += bytes(JSON.stringify(value)) + (doc.strings.length ? 1 : 0);
        dictionary.set(value, doc.strings.length); doc.strings.push(value); added.push(value);
      }
      return dictionary.get(value);
    });
    extra += bytes(JSON.stringify(row)) + (doc.rows.length ? 1 : 0);
    return { row, added, extra };
  }
  for (const record of records) {
    let encoded = encode(record);
    if (size + encoded.extra > JSON_CHUNK_BYTES && doc.rows.length) {
      for (const value of encoded.added) dictionary.delete(value);
      doc.strings.length -= encoded.added.length;
      chunks.push(JSON.stringify(doc)); reset(); encoded = encode(record);
    }
    if (size + encoded.extra > JSON_CHUNK_BYTES) throw Error('COST_ROW_PARAMETER_LIMIT');
    doc.rows.push(encoded.row); size += encoded.extra;
  }
  if (doc.rows.length) chunks.push(JSON.stringify(doc));
  if (chunks.some(chunk => bytes(chunk) > JSON_CHUNK_BYTES)) throw Error('COST_JSON_PARAMETER_LIMIT');
  return chunks;
}

export function parseCsv(text) {
  const result = [], row = []; let field = '', quoted = false;
  for (let i = 0; i <= text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else if (c === undefined) throw Error('UNTERMINATED_CSV_QUOTE');
      else field += c;
    } else if (c === '"' && !field) quoted = true;
    else if (c === ',' || c === '\n' || c === undefined) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (c !== ',') { if (row.some(Boolean)) result.push(row.splice(0)); else row.length = 0; }
    } else field += c;
    if (result.length > 20000 || row.length > 100 || field.length > 20000) throw Error('CSV_LIMIT');
  }
  if (!result.length) throw Error('EMPTY_CSV');
  const header = result.shift().map(s => s.replace(/^\uFEFF/, ''));
  return result.map(r => { if (r.length !== header.length) throw Error('CSV_COLUMN_MISMATCH'); return Object.fromEntries(header.map((h, i) => [h, r[i]])); });
}

export function matchCostCity(localCities, remote) {
  if (!/^[A-Z]{2}$/.test(remote.country?.code || '')) return null;
  const candidates = localCities.filter(c => c.iso2 === remote.country.code &&
    (key(c.slug) === key(remote.slug) || key(c.name_en) === key(remote.name)));
  return candidates.length === 1 ? candidates[0] : null;
}

async function fetchBytes(url, options, maxBytes = 8 * 1024 * 1024) {
  const response = await (options.fetcher || fetch)(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'RemoteAI-Nomads/0.1 (+cost-source-sync)' } });
  if (!response.ok) throw Error(`SOURCE_HTTP_${response.status}`);
  const length = Number(response.headers.get('content-length'));
  if (length > maxBytes) throw Error('SOURCE_RESPONSE_LIMIT');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw Error('SOURCE_RESPONSE_LIMIT'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  await options.onFetch?.(url, bytes);
  return bytes;
}
const fetchText = async (url, options, max) => new TextDecoder().decode(await fetchBytes(url, options, max));
async function addSources(env, sources) {
  if (!sources.length) return new Map();
  const urls = JSON.stringify([...new Set(sources.map(s => s.url))]);
  if (bytes(urls) > JSON_CHUNK_BYTES) throw Error('COST_SOURCE_CATALOG_LIMIT');
  const lookup = () => query(env, 'SELECT id,url,publisher,title,license FROM sources WHERE url IN (SELECT value FROM json_each(?))', [urls]);
  const existing = await lookup();
  const found = new Map(existing.map(s => [s.url, s.id]));
  const metadataUpdates = sources.filter(s => s.publisher === 'CostCompass' && existing.some(old => old.url === s.url &&
    (old.publisher !== s.publisher || old.title !== s.title || old.license !== s.license)));
  for (const chunk of jsonObjectChunks(metadataUpdates)) await env.DB.prepare(`UPDATE sources SET
    publisher=json_extract(j.value,'$.publisher'),title=json_extract(j.value,'$.title'),license=json_extract(j.value,'$.license')
    FROM json_each(?) j WHERE sources.url=json_extract(j.value,'$.url')`).bind(chunk).run();
  const missing = sources.filter(s => !found.has(s.url));
  if (missing.length) {
    for (const chunk of jsonObjectChunks(missing)) await env.DB.prepare(`INSERT OR IGNORE INTO sources(id,url,publisher,title,kind,license,accessed_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.url'),json_extract(value,'$.publisher'),json_extract(value,'$.title'),
      json_extract(value,'$.kind'),json_extract(value,'$.license'),json_extract(value,'$.accessed_at') FROM json_each(?)`).bind(chunk).run();
    // Re-read URL identities after insert to handle a concurrent importer using another source ID.
    for (const source of await lookup()) found.set(source.url, source.id);
  }
  if (sources.some(s => !found.has(s.url))) throw Error('COST_SOURCE_IDENTITY_CONFLICT');
  return found;
}
async function addSource(env, source) {
  return (await addSources(env, [source])).get(source.url);
}
async function insertObservations(env, observations) {
  let inserted = 0; const records = [];
  const fields = ['provider','city_id','country_id','scope','category','field','label','amount','currency','period','unit','household_size','sample_start','sample_end','sample_size','min_amount','max_amount','quality','quality_flags','detail','source_id','checked_at','payload_hash'];
  const numeric = new Set(['amount','household_size','sample_size','min_amount','max_amount']);
  for (const o of observations) {
    const { checked_at: checkedAt, ...identity } = o;
    const payloadHash = await hash(JSON.stringify(identity));
    records.push(fields.map(f => f === 'payload_hash' ? payloadHash : ['quality_flags','detail'].includes(f) ? JSON.stringify(o[f]) : o[f] ?? null));
  }
  const textAt = i => `json_extract(p.doc,'$.strings[' || json_extract(r.value,'$[${i}]') || ']')`;
  const sql = `WITH p AS (SELECT ? AS doc) INSERT OR IGNORE INTO cost_observations(id,${fields.join(',')})
    SELECT 'cost:' || ${textAt(fields.length - 1)},${fields.map((field, i) => numeric.has(field) ? `json_extract(r.value,'$[${i}]')` : textAt(i)).join(',')}
    FROM p,json_each(p.doc,'$.rows') r`;
  for (const chunk of dictionaryChunks(records)) inserted += (await env.DB.prepare(sql).bind(chunk).run()).meta?.changes || 0;
  return inserted;
}

/** Public CC BY 4.0 prices only. Website monthly totals include withheld prices and are excluded. */
export async function syncCostCompass(env, options = {}) {
  const now = options.now || new Date().toISOString();
  const catalog = JSON.parse(await fetchText(COSTCOMPASS_CITIES_URL, options));
  if (catalog.license?.id !== 'CC-BY-4.0' || catalog.currency !== 'USD' || !Array.isArray(catalog.cities) || catalog.cities.length > 1000 || !validDate(catalog.observedTo)) throw Error('COSTCOMPASS_CATALOG_SCHEMA');
  const local = await query(env, 'SELECT c.id,c.slug,c.name_en,c.country_id,co.iso2 FROM cities c JOIN countries co ON co.id=c.country_id');
  const matches = new Map(), unmatched = [];
  for (const remote of catalog.cities) {
    const city = matchCostCity(local, remote);
    if (city) matches.set(remote.slug, { city, remote }); else unmatched.push(remote.slug);
  }
  const prices = parseCsv(await fetchText(COSTCOMPASS_PRICES_URL, options));
  const observations = [], rejected = []; const sourceDrafts = new Map();
  for (const p of prices) {
    const match = matches.get(p.city_slug); if (!match) continue;
    const amount = Number(p.price_usd), sample = Number(p.observations), min = Number(p.min_usd), max = Number(p.max_usd);
    const allowedCategories = ['housing','food','transportation','utilities','restaurants','entertainment','healthcare','clothing'];
    const prefix = ({ transportation: 'transport', restaurants: 'restaurant' })[p.category] || p.category;
    if (p.country_code !== match.city.iso2 || key(p.city) !== key(match.remote.name) || !/^[a-z][a-z0-9_]{1,100}$/.test(p.field) || !allowedCategories.includes(p.category) ||
      !p.field.startsWith(prefix + '_') ||
      !p.price_usd || !Number.isFinite(amount) || amount <= 0 || amount > 1000000 || !Number.isInteger(sample) || sample < 1 ||
      !validDate(p.first_observed) || !validDate(p.last_observed) || p.first_observed > p.last_observed || p.last_observed > now.slice(0,10) ||
      (new Date(now) - new Date(p.last_observed)) / DAY > 60 || !p.sources ||
      !Number.isFinite(min) || !Number.isFinite(max) || min > amount || max < amount ||
      p.page_url !== `https://costcompass.net/living/cities/${match.remote.slug}` || !p.unit || p.unit.length > 50) {
      rejected.push({ city: p.city_slug, field: p.field, reason: 'invalid_or_stale_source_sample' }); continue;
    }
    if (!sourceDrafts.has(p.city_slug)) sourceDrafts.set(p.city_slug, {
      id: `costcompass:${p.city_slug}`, url: p.page_url, publisher: 'CostCompass', title: `CostCompass — ${match.remote.name} 公开单项报价样本`,
      kind: 'dataset', license: 'CC-BY-4.0', accessed_at: now,
    });
    const rentOutlier = p.category === 'housing' && (amount < 50 || amount > 20000);
    observations.push({ provider: 'costcompass', city_id: match.city.id, country_id: match.city.country_id, scope: 'city',
      category: p.category, field: p.field, label: p.item, amount, currency: 'USD', period: p.unit, unit: p.unit,
      household_size: null, sample_start: p.first_observed, sample_end: p.last_observed, sample_size: sample,
      min_amount: min, max_amount: max, quality: rentOutlier ? 'review' : 'sample', quality_flags: [
        ...(rentOutlier ? ['rent_outlier_requires_review'] : []),
        ...(sample === 1 ? ['single_observation'] : []), ...(p.category === 'housing' ? ['asking_rent','occupancy_unspecified','short_stay_not_verified'] : []),
      ], detail: { original_publishers: p.sources.split(';').map(s => s.trim()), dataset_url: COSTCOMPASS_PRICES_URL,
        generated_at: catalog.generated, source_city_slug: p.city_slug, attribution: `Source: CostCompass (${p.page_url})`,
        note: '单项报价；未导入网站月总价；数量见品名。' }, source_id: p.city_slug, checked_at: now });
  }
  const sourceIds = await addSources(env, [...sourceDrafts.values()]);
  for (const observation of observations) observation.source_id = sourceIds.get(sourceDrafts.get(observation.source_id).url);
  const inserted = await insertObservations(env, observations);
  return { catalog_cities: catalog.cities.length, matched_cities: matches.size, cities_with_prices: sourceIds.size,
    observations: observations.length, inserted, rejected, unmatched_source_cities: unmatched,
    local_cities_without_match: local.filter(c => ![...matches.values()].some(m => m.city.id === c.id)).map(c => c.slug),
    monthly_totals_imported: 0, generated_at: catalog.generated };
}

const ESTAT_CATEGORIES = {
  '消費支出': ['total_consumption','total_consumption','全国单身家庭消费支出'],
  '食料': ['food','food','食料（含外食）'], '外食': ['restaurants','dining','外食（已含在食料中）'],
  '住居': ['housing','housing','住房支出（含自有住房家庭）'], '家賃地代': ['housing','actual_rent_spend','房租及地租（已含在住房支出中）'],
  '光熱・水道': ['utilities','utilities','能源及水费'], '家具・家事用品': ['household','household','家具及家务用品'],
  '被服及び履物': ['clothing','clothing','服装及鞋履'], '保健医療': ['healthcare','healthcare','保健医疗'],
  '交通・通信': ['transportation','transport_communication','交通及通信'], '交通': ['transportation','transport','交通（已含在交通及通信中）'],
  '通信': ['utilities','communication','通信（已含在交通及通信中）'],
  '教育': ['education','education','教育'], '教養娯楽': ['entertainment','entertainment','文化娱乐'],
  'その他の消費支出': ['other','other','其他消费支出'],
};
export function extractEstatSingle(rows, year) {
  const allText = rows.flatMap(r => Object.values(r)).join(' ');
  if (!allText.includes(`${year}年`) || !allText.includes('単身世帯') || !allText.includes('１世帯当たり１か月間の収入と支出')) throw Error('ESTAT_WRONG_HOUSEHOLD_TABLE');
  const header = rows.find(r => Object.values(r).some(v => v === '単身世帯の実数'));
  const valueCol = header && Object.keys(header).find(c => header[c] === '単身世帯の実数');
  const labels = rows.find(r => Object.values(r).includes('用途分類'));
  const labelCol = labels && Object.keys(labels).find(c => labels[c] === '用途分類');
  const unitCol = labels && Object.keys(labels).find(c => labels[c] === '実数の単位');
  if (!valueCol || !labelCol || !unitCol) throw Error('ESTAT_UNEXPECTED_COLUMNS');
  const sample = rows.find(r => r[labelCol] === '集計世帯数');
  const sampleSize = Number(sample?.[valueCol]);
  const result = [], seen = new Set();
  // Later gift subcategories repeat labels; only first top-level occurrence is accepted.
  for (const row of rows) {
    const item = ESTAT_CATEGORIES[String(row[labelCol] || '').replace(/\d+\)$/, '')];
    if (!item || seen.has(item[1]) || row[unitCol] !== '円') continue;
    const amount = Number(row[valueCol]);
    if (!row[valueCol] || !Number.isFinite(amount) || amount < 0) throw Error('ESTAT_INVALID_VALUE');
    seen.add(item[1]); result.push({ category: item[0], field: item[1], label: item[2], amount });
  }
  if (!result.some(o => o.field === 'total_consumption') || !result.some(o => o.field === 'food') || !result.some(o => o.field === 'housing')) throw Error('ESTAT_MISSING_KEY_VALUES');
  return { observations: result, sample_size: Number.isInteger(sampleSize) && sampleSize > 0 ? sampleSize : null };
}
export async function syncEstat(env, options = {}) {
  const now = options.now || new Date().toISOString();
  const country = await env.DB.prepare("SELECT id FROM countries WHERE iso2='JP'").first();
  if (!country) return { skipped: 'JP_NOT_IN_CATALOG', observations: 0 };
  for (const year of [Number(now.slice(0,4)) - 1, Number(now.slice(0,4)) - 2]) {
    const listing = `https://www.e-stat.go.jp/stat-search/files?cycle=7&layout=dataset&page=1&tclass1=000000330001&tclass2=000000330022&tclass3=000000330023&tclass4val=0&toukei=00200561&tstat=000000330001&year=${year}0`;
    const html = await fetchText(listing, options);
    const id = /file-download\?statInfId=(\d+)&(?:amp;)?fileKind=0/.exec(html)?.[1];
    if (!id) continue;
    const download = `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${id}&fileKind=0`;
    const rows = await readEstatWorkbook(await fetchBytes(download, options));
    const extracted = extractEstatSingle(rows, year);
    const sourceIds = await addSources(env, [{ id: `estat:single:${year}`, url: download, publisher: '日本总务省统计局 / e-Stat',
      title: `家計調査 ${year}年 单身家庭 第1表 全国月均收支`, kind: 'official', license: '政府標準利用規約（第2.0版）; 出典明示', accessed_at: now }, ...ESTAT_METHOD_SOURCES]);
    const source_id = sourceIds.get(download);
    const observations = extracted.observations.map(o => ({ ...o, provider: 'estat', city_id: null, country_id: country.id,
      scope: 'national', currency: 'JPY', period: 'month', unit: 'JPY/单身家庭/月', household_size: 1,
      sample_start: `${year}-01-01`, sample_end: `${year}-12-31`, sample_size: extracted.sample_size,
      quality: 'official_reference', quality_flags: ['national_not_city','resident_households_not_nomads','includes_owner_occupiers','annual_average'],
      detail: { stat_inf_id: id, table: '第1表', household: '単身世帯', aggregation: '年平均の1か月当たり', listing_url: listing,
        source_url: download, subset: ['dining','actual_rent_spend','communication','transport'].includes(o.field),
        note: '全国居民实际支出，含自有住房家庭；不是市场租金，不等于城市或短租游民预算。子项与父项不能重复相加。' }, source_id, checked_at: now }));
    return { year, household_size: 1, scope: 'national', sample_size: extracted.sample_size, observations: observations.length,
      inserted: await insertObservations(env, observations), public_download: true, api_key_required: false, source_url: download,
      methodology_source_ids: ESTAT_METHOD_SOURCES.map(s => sourceIds.get(s.url)), methodology_verified_at: '2026-10-18' };
  }
  throw Error('ESTAT_SINGLE_HOUSEHOLD_PUBLIC_TABLE_NOT_FOUND');
}

export function parseEcbRates(xml, now = new Date().toISOString()) {
  const date = /<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!validDate(date) || date > now.slice(0,10)) throw Error('ECB_INVALID_DATE');
  const rates = [...xml.matchAll(/<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/?\s*>/g)]
    .map(m => ({ base: 'EUR', quote: m[1], rate: Number(m[2]), rate_date: date }));
  if (!xml.includes('European Central Bank') || !rates.some(r => r.quote === 'CNY') || !rates.some(r => r.quote === 'USD') ||
    !rates.some(r => r.quote === 'JPY') || rates.some(r => !Number.isFinite(r.rate) || r.rate <= 0)) throw Error('ECB_INVALID_RATES');
  return rates;
}
export async function syncFx(env, options = {}) {
  const now = options.now || new Date().toISOString(), started = now;
  try {
    const rates = parseEcbRates(await fetchText(ECB_RATES_URL, options, 100000), now);
    const source_id = await addSource(env, { id: 'ecb:reference-fx', url: ECB_PAGE_URL, publisher: 'European Central Bank',
      title: 'ECB 欧元外汇参考汇率', kind: 'official', license: 'ECB reuse with attribution', accessed_at: now });
    const payload = rates.map(r => ({ ...r, id: `ecb:${r.rate_date}:${r.quote}:${r.rate}`, source_id, checked_at: now }));
    let inserted = 0;
    for (const chunk of jsonObjectChunks(payload)) inserted += (await env.DB.prepare(`INSERT OR IGNORE INTO fx_rates(id,base,quote,rate,rate_date,source_id,checked_at)
      SELECT json_extract(value,'$.id'),json_extract(value,'$.base'),json_extract(value,'$.quote'),json_extract(value,'$.rate'),
      json_extract(value,'$.rate_date'),json_extract(value,'$.source_id'),json_extract(value,'$.checked_at') FROM json_each(?)`).bind(chunk).run()).meta?.changes || 0;
    const summary = { rates: rates.length, inserted, date: rates[0].rate_date, source_id };
    await logRun(env, 'ecb', started, 'ok', summary);
    return summary;
  } catch (error) { await logRun(env, 'ecb', started, 'failed', { error: error.message }); throw error; }
}
async function logRun(env, provider, started, status, summary) {
  await env.DB.prepare('INSERT INTO cost_sync_runs(id,provider,started_at,finished_at,status,summary) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), provider, started, new Date().toISOString(), status, JSON.stringify(summary)).run();
}
/** Monthly on the 15th. Providers fail independently; old observations stay available. */
export async function syncCosts(env, options = {}) {
  const result = {};
  for (const [provider, sync] of [['costcompass', syncCostCompass], ['estat', syncEstat]]) {
    const started = new Date().toISOString();
    try {
      const summary = await sync(env, options); result[provider] = { ok: true, ...summary };
      await logRun(env, provider, started, summary.rejected?.length ? 'partial' : 'ok', summary);
    } catch (error) {
      result[provider] = { ok: false, error: error.message };
      await logRun(env, provider, started, 'failed', result[provider]);
    }
  }
  return result;
}
