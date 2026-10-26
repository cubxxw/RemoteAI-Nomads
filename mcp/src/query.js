import {tools} from './tools.js';
import {convertMeeting} from './meeting.js';
import {calculateBudget} from '../../web/src/agent-budget.js';
import {rankCities, parseState, PRESETS, currentMonth, customScore, scoringValues, DEFAULT_WEIGHTS} from '../../web/public/modules/ranking.js';
import {countryQueryCode} from '../../web/public/modules/country-search.js';

const norm = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[\s_\-（）(),]/g, '');
const pick = (row, keys) => Object.fromEntries(keys.map(k => [k, row[k] ?? null]));
const fail = (code, message, details) => { throw Object.assign(new Error(message), {code, details}); };
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const age = (date, now) => {
  const value = Date.parse(date?.slice(0, 10) + 'T00:00:00Z');
  return Number.isFinite(value) ? Math.max(0, Math.floor((now - value) / 86400000)) : null;
};
const chosenMonths = (args, now) => [...new Set(args.months || [PRESETS[args.preset]?.month || currentMonth(now)])];

function places(snapshot, value, kind, partial = false) {
  const q = norm(value), alias = countryQueryCode(value);
  return [
    ...snapshot.countries.map(c => ({kind: 'country', id: 'country:' + c.id, name: c.name_zh, name_en: c.name_en, country_code: c.iso2, row: c})),
    ...snapshot.cities.map(c => ({kind: 'city', id: c.id, name: c.name, name_en: c.nameEn, country_code: c.countryCode, row: c})),
  ].filter(p => (!kind || p.kind === kind) && [p.id, p.name, p.name_en, p.row.slug, p.kind === 'country' ? p.row.id : null,
    p.kind === 'country' ? p.country_code : null].filter(Boolean).some(v =>
      norm(v) === q || (p.kind === 'country' && alias && p.country_code === alias) || (partial && norm(v).includes(q))));
}

function resolve(snapshot, value, kind) {
  const matches = places(snapshot, value, kind);
  const countries = matches.filter(p => p.kind === 'country');
  if (!kind && countries.length === 1) return countries[0];
  if (matches.length === 1) return matches[0];
  if (!matches.length) fail('PLACE_NOT_FOUND', '地点未匹配；可用中文、英文、国家代码或先搜索地点。');
  fail('AMBIGUOUS_PLACE', '名称对应多个地点，请使用返回的公开地点ID。', {
    matches: matches.map(({row, ...place}) => place),
  });
}

function climate(city, months) {
  return months.map(month => city.climate.find(r => r.month === month) || {
    month, mean_c: null, high_c: null, rain_mm: null, status: 'not_collected',
  });
}

function summary(snapshot, city, months) {
  const costs = snapshot.costs.filter(o => o.city_id === city.id && o.scope === 'city');
  return {id: city.id, slug: city.slug, name: city.name, name_en: city.nameEn, country: city.country,
    country_code: city.countryCode, region: city.region, url: city.url, timezone: city.timeZone,
    reference_scores: city.scores, score_evidence: city.score_evidence,
    climate: climate(city, months), source_ids: city.source_ids,
    coverage: {city_price_observations: costs.length, climate_months: city.climate.length,
      workspace_quotes: snapshot.workspaces.filter(q => q.city_id === city.id).length},
    recommendation: {eligible: !city.advisory, advisory: city.advisory,
      review_scope: '已有提醒的排除范围；没有提醒不表示已完成安全审查'}};
}

function find(snapshot, args, now, cityId) {
  const months = chosenMonths(args, now);
  if (args.min_temp !== undefined && args.max_temp !== undefined && args.min_temp > args.max_temp) {
    fail('INVALID_TEMPERATURE_RANGE', '最低温度条件不能高于最高温度条件。');
  }
  const country = args.country ? resolve(snapshot, args.country, 'country').row : null;
  const rows = snapshot.cities.filter(c => (!cityId || c.id === cityId) &&
    (!country || c.countryId === country.id) && (!args.region || c.region === args.region));
  const preset = PRESETS[args.preset || 'default'];
  const minTemp = args.min_temp ?? (preset.warm ? 18 : undefined);
  const maxTemp = args.max_temp ?? (preset.warm ? 28 : undefined);
  const state = {...parseState(new URL('https://example.invalid/')), weights: preset.weights,
    month: months[0], scoringMonth: months[0], incomplete: true, visa: '', warm: false};
  let excludedMissing = 0;
  const filtered = rankCities(rows, state).filter(city => {
    if (args.legacy_budget_usd_max !== undefined && (city.budget === null || city.budget > args.legacy_budget_usd_max)) return false;
    if ([minTemp, maxTemp, args.max_rain].every(v => v === undefined)) return true;
    const observations = climate(city, months);
    if (observations.some(m => (minTemp !== undefined || maxTemp !== undefined) && m.mean_c === null ||
        args.max_rain !== undefined && m.rain_mm === null)) { excludedMissing++; return false; }
    return observations.every(m => (minTemp === undefined || m.mean_c >= minTemp) &&
      (maxTemp === undefined || m.mean_c <= maxTemp) && (args.max_rain === undefined || m.rain_mm <= args.max_rain));
  }).map(city => {
    const values = months.map(month => customScore(city, preset.weights, month));
    return {...summary(snapshot, city, months), score: values.some(v => v === null) ? null : round(values.reduce((a,b) => a+b,0) / values.length),
      score_months: months, legacy_budget_usd: args.legacy_budget_usd_max === undefined ? undefined : city.budget};
  });
  filtered.sort((a,b) => (b.score ?? -1) - (a.score ?? -1) || a.slug.localeCompare(b.slug));
  const offset = args.offset || 0, limit = args.limit || 10;
  return {months, country: country ? 'country:' + country.id : null, total: filtered.length,
    cities: filtered.slice(offset, offset + limit), next_offset: offset + limit < filtered.length ? offset + limit : null,
    excluded_missing_climate: excludedMissing, reference_price_is_floor: false,
    methodology: '沿用网站六项偏好的加权均值；跨月取平均；旧指标并非房间或当前城市实测。'};
}

function conversion(snapshot, amount, from, to, now) {
  if (from === to) return {amount, currency: to, rate: 1, date: null, stale: false, method: 'identity', source_id: null};
  const dates = [...new Set(snapshot.fx.map(f => f.rate_date))].sort().reverse();
  for (const date of dates) {
    const base = from === 'EUR' ? {rate: 1} : snapshot.fx.find(f => f.base === 'EUR' && f.quote === from && f.rate_date === date);
    const quote = to === 'EUR' ? {rate: 1} : snapshot.fx.find(f => f.base === 'EUR' && f.quote === to && f.rate_date === date);
    if (!base || !quote) continue;
    const rate = quote.rate / base.rate;
    return {amount: round(amount * rate), currency: to, rate, date, stale: age(date, now) > 7,
      method: 'ECB same-date cross rate', source_id: quote.source_id || base.source_id};
  }
  return null;
}

const costOrder = o => (o.provider === 'estat' && o.field === 'total_consumption' ? -1 :
  ({housing: 0, food: 1, restaurants: 1, transportation: 2, utilities: 3}[o.category] ?? 4));
function latestCosts(rows) {
  const ordered = [...rows].sort((a,b) => (b.sample_end || '').localeCompare(a.sample_end || '') ||
    (b.checked_at || '').localeCompare(a.checked_at || '') || b.id.localeCompare(a.id));
  const seen = new Set();
  return ordered.filter(o => {
    const key = [o.provider, o.city_id || o.area_id || o.country_id, o.scope, o.field].join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function observation(snapshot, o, currency, now) {
  const days = age(o.sample_end, now);
  return {...o, observed_at: o.sample_end, stale: days === null ? null : days > (o.provider === 'estat' || o.period === 'year' ? 550 : 60),
    conversion: conversion(snapshot, o.amount, o.currency, currency, now),
    ...(o.provider === 'estat' ? {do_not_add_to_parent: true,
      methodology_note: '全国居民消费包含自有住房家庭；总额已含分类，分类已含子项；不能当作本城租金或最低预算。'} : {})};
}

function costs(snapshot, args, now) {
  const place = resolve(snapshot, args.place), currency = args.currency || 'CNY', limit = args.limit || 20, offset = args.offset || 0;
  if (args.category && ![...snapshot.costs, ...snapshot.regional].some(o => o.category === args.category)) {
    fail('UNSUPPORTED_CATEGORY', '消费类别未识别，请使用资料中的类别。', {categories: [...new Set(snapshot.costs.map(o => o.category))]});
  }
  if (place.kind === 'country') {
    const cities = snapshot.cities.filter(c => c.countryId === place.row.id);
    const scope = args.scope || 'all', includeCity = scope === 'all' || scope === 'city';
    const includeNational = scope === 'all' || scope === 'national', includeRegional = scope === 'all' || scope === 'regional';
    const categoryMatches = o => !args.category || o.category === args.category;
    const priced = (includeCity ? cities : []).map(c => ({id: c.id, name: c.name,
      observations: snapshot.costs.filter(o => o.city_id === c.id && o.scope === 'city' && categoryMatches(o)).length}))
      .filter(c => c.observations > 0);
    const national = includeNational ? latestCosts(snapshot.costs.filter(o =>
      o.country_id === place.row.id && o.scope === 'national' && categoryMatches(o))).sort((a,b) => costOrder(a)-costOrder(b)) : [];
    const areas = snapshot.areas.filter(a => a.country_id === place.row.id);
    const regional = includeRegional ? latestCosts(snapshot.regional.filter(o =>
      areas.some(a => a.id === o.area_id) && categoryMatches(o))).map(o =>
        ({...o, area_name: areas.find(a => a.id === o.area_id)?.name_zh})) : [];
    const pageTotal = scope === 'national' ? national.length : scope === 'regional' ? regional.length : priced.length;
    return {scope: 'country_coverage', country: place.id, requested_scope: scope, coverage_category: args.category || 'all',
      priced_city_count: includeCity ? priced.length : null, city_coverage_status: includeCity ? 'queried' : 'not_requested',
      priced_cities: priced.slice(offset, offset + limit), next_offset: offset + limit < pageTotal ? offset + limit : null,
      national_reference: national.slice(scope === 'national' ? offset : 0, scope === 'national' ? offset + limit : Math.min(limit, 5))
        .map(o => observation(snapshot, o, currency, now)), national_reference_total: national.length,
      regional_reference: regional.slice(scope === 'regional' ? offset : 0, scope === 'regional' ? offset + limit : Math.min(limit, 5))
        .map(o => observation(snapshot, o, currency, now)), regional_reference_total: regional.length,
      reference_price_is_floor: false};
  }
  const c = place.row;
  const areaIds = snapshot.regional_links.filter(l => l.city_id === c.id).map(l => l.area_id);
  const raw = latestCosts([...snapshot.costs.filter(o => o.city_id === c.id || o.country_id === c.countryId && o.scope === 'national'),
    ...snapshot.regional.filter(o => areaIds.includes(o.area_id)).map(o => ({...o,
      area_name: snapshot.areas.find(a => a.id === o.area_id)?.name_zh}))])
    .filter(o => (!args.category || o.category === args.category) && (!args.scope || args.scope === 'all' || o.scope === args.scope))
    .sort((a,b) => costOrder(a)-costOrder(b) || (a.scope === 'city' ? 0 : 1)-(b.scope === 'city' ? 0 : 1));
  return {city: c.id, currency, reference_price_is_floor: false, total: raw.length,
    observations: raw.slice(offset, offset + limit).map(o => observation(snapshot, o, currency, now)),
    next_offset: offset + limit < raw.length ? offset + limit : null,
    coverage: {city_observations: raw.filter(o => o.scope === 'city').length,
      national_observations: raw.filter(o => o.scope === 'national').length,
      missing_city_categories: ['housing','food','transportation','utilities'].filter(k => !raw.some(o => o.scope === 'city' && o.category === k))},
    limitations: ['城市、区域和全国观察不可互相替代。', '挂牌和历史单价不证明短租成交价；缺少项目保留缺口。', '不同单位不能直接相加成月预算。']};
}

function entry(snapshot, country, passport) {
  if (!passport) return {country: 'country:' + country.id, applicability: 'passport_not_provided', qualification_verified: false,
    policy_count: snapshot.policies.filter(p => p.country_id === country.id).length};
  if (passport.toUpperCase() !== 'CN') return {country: 'country:' + country.id, passport: passport.toUpperCase(),
    applicability: 'passport_not_supported', rules: [], qualification_verified: false,
    references: snapshot.policies.filter(p => p.country_id === country.id).map(p => ({
      title: p.name, source_id: p.source_id, applicability: 'not_checked_for_requested_passport',
    }))};
  return {country: 'country:' + country.id, passport: 'CN', applicability: 'requires_individual_verification',
    rules: snapshot.policies.filter(p => p.country_id === country.id),
    legacy_labels: snapshot.entries.filter(e => snapshot.cities.some(c => c.id === e.city_id && c.countryId === country.id)).slice(0, 8),
    qualification_verified: false, meaning: '有效期、单次停留和工作许可分别核对；不裁定个人资格。'};
}

function work(snapshot, place) {
  const country = place.kind === 'country' ? place.row.id : place.row.countryId;
  const cities = place.kind === 'country' ? snapshot.cities.filter(c => c.countryId === country) : [place.row];
  return {place: place.id, total_cities: cities.length, cities: cities.slice(0, 8).map(c => ({id: c.id, name: c.name, timezone: c.timeZone,
    network_reference: c.scores.internet, evidence_level: 'legacy_unverified', source_ids: c.source_ids, places: c.communityPlaces,
    workspace_quotes: snapshot.workspaces.filter(w => w.city_id === c.id)})),
    service_regions: snapshot.services.filter(s => s.country_id === country),
    room_speed_measured: false, quietness_measured: false, actual_service_access_verified: false,
    meaning: '场所数量不证明允许办公；名单不保证账号、支付、具体模型或真实网络可用。'};
}

function details(snapshot, city, months, args, now) {
  const working = work(snapshot, resolve(snapshot, city.id));
  if (args.work_schedule) {
    const schedule = args.work_schedule;
    try {
      if (!city.timezone) fail('TIMEZONE_MISSING', '城市时区资料尚未收录，可以先比较其他资料。');
      working.meeting_examples = {date: schedule.date, times: schedule.times.map(time =>
        convertMeeting(schedule.date, time, schedule.home_timezone, city.timezone))};
    } catch (error) {working.meeting_examples = {error: {code: error.code || 'INVALID_TIMEZONE',
      message: error.code === 'TIMEZONE_MISSING' ? error.message : '请核对会议日期和时区。'}};}
  }
  const prices = costs(snapshot, {place: city.id, currency: args.currency, scope: 'city', limit: 50}, now);
  const usable = prices.observations.filter(o => o.quality !== 'review' && !o.quality_flags?.includes('rent_outlier_requires_review'));
  const preferred = (category, fields, limit) => usable.filter(o => o.category === category).sort((a,b) =>
    (fields.includes(a.field) ? fields.indexOf(a.field) : 100) - (fields.includes(b.field) ? fields.indexOf(b.field) : 100) ||
    a.field.localeCompare(b.field)).slice(0, limit);
  const observations = [
    ...preferred('housing', ['housing_1br_outside','housing_1br_center'], 2),
    ...preferred('restaurants', ['restaurant_inexpensive'], 1),
    ...preferred('food', ['food_rice_1kg','food_bread_500g'], 1),
    ...preferred('transportation', ['transport_monthly_pass','transport_oneway_ticket'], 2),
    ...preferred('utilities', ['utilities_mobile_10gb','utilities_internet_60mbps'], 2),
  ];
  const {next_offset, ...sample} = prices;
  return {...city, cost_samples: {...sample, observations, complete: false,
    selection: 'representative_samples_by_category', detail_tool: 'nomads_get_costs'}, work: working};
}

function sourcesFor(snapshot, value) {
  const ids = new Set();
  const walk = item => {
    if (!item || typeof item !== 'object') return;
    if (typeof item.source_id === 'string') ids.add(item.source_id);
    if (Array.isArray(item.source_ids)) item.source_ids.forEach(id => ids.add(id));
    Object.values(item).forEach(v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); });
  };
  walk(value);
  return snapshot.sources.filter(s => ids.has(s.id));
}

function execute(snapshot, name, args, now) {
  const months = chosenMonths(args, now);
  if (name === 'search_places') {
    const matches = places(snapshot, args.query, args.kind, true);
    return {total: matches.length, matches: matches.slice(0, args.limit).map(({row, ...place}) => place)};
  }
  if (name === 'find_cities') return find(snapshot, args, now);
  if (name === 'get_context') {
    const place = args.place || args.country ? resolve(snapshot, args.place || args.country) : null;
    if (place && args.country && (place.kind === 'country' ? place.row.id : place.row.countryId) !== resolve(snapshot, args.country, 'country').row.id) {
      fail('CONFLICTING_COUNTRY', '地点与国家条件不一致，请使用同一范围。');
    }
    const matched = find(snapshot, {...args, country: place?.kind === 'country' ? place.row.id : args.country,
      limit: args.limit}, now, place?.kind === 'city' ? place.id : undefined);
    const candidates = matched.cities;
    const scope = snapshot.cities.filter(c => (!place || (place.kind === 'city' ? c.id === place.id : c.countryId === place.row.id)) &&
      (!args.region || c.region === args.region));
    const ids = new Set(scope.map(c => c.id));
    return {place: place ? pick(place, ['id','kind','name','name_en','country_code']) : {id: 'world', name: '已收录城市'},
      coverage: {catalogue_cities: scope.length, priced_cities: new Set(snapshot.costs.filter(o => o.scope === 'city' && ids.has(o.city_id)).map(o => o.city_id)).size,
        climate_cities: scope.filter(c => c.climate.length).length, selected_candidates: candidates.length},
      months, candidates: candidates.map(c => details(snapshot, c, months, args, now)),
      requested_place: place?.kind === 'city' && !candidates.length ? summary(snapshot, place.row, months) : undefined,
      selection_note: place?.kind === 'city' && !candidates.length ? '指定城市未满足筛选或不参与推荐，requested_place仅供查阅。' : undefined,
      entry: place ? entry(snapshot, place.kind === 'country' ? place.row : snapshot.countries.find(k => k.id === place.row.countryId), args.passport) :
        {applicability: 'destination_not_selected', qualification_verified: false},
      related_guides: snapshot.guides.filter(g => g.citySlugs.some(slug => candidates.some(c => c.slug === slug))).slice(0, 5)
        .map(g => ({title: g.title, url: snapshot.origin + g.path, updated_at: g.updatedAt})),
      assumptions: {month_basis: args.months ? 'user_provided' : args.preset === 'winter' ? 'winter_preset' : 'current_month_Asia_Shanghai',
        currency_is_display_only: true, passport_assumed: false},
      next_step: '先按当前条件给候选；只补问会改变结论的一项，不重新索取已知条件。'};
  }
  if (name === 'get_costs') return costs(snapshot, args, now);
  if (name === 'get_climate') return {period: '2023–2025', forecast_available: false, air_quality_available: false,
    cities: args.cities.map(value => {const city = resolve(snapshot, value, 'city').row;
      return {id: city.id, name: city.name, months: climate(city, months)};})};
  if (name === 'get_entry_rules') return entry(snapshot, resolve(snapshot, args.country, 'country').row, args.passport);
  if (name === 'get_work_conditions') return work(snapshot, resolve(snapshot, args.place));
  if (name === 'get_sources') return {sources: snapshot.sources.filter(s => args.source_ids.includes(s.id)),
    not_found: args.source_ids.filter(id => !snapshot.sources.some(s => s.id === id))};
  if (name === 'get_catalog_info') return {source_snapshot_date: snapshot.source_snapshot_date,
    coverage: {cities: snapshot.cities.length, directory_regions: snapshot.countries.length,
      priced_cities: new Set(snapshot.costs.filter(o => o.scope === 'city').map(o => o.city_id)).size,
      climate_cities: snapshot.cities.filter(c => c.climate.length).length,
      workspace_cities: new Set(snapshot.workspaces.map(w => w.city_id)).size},
    methodology: {default_weights: DEFAULT_WEIGHTS, climate: '2023–2025 ERA5历史网格，不是预报',
      ranking: '沿用网站加权评分；缺失不补零；历史网络与安全指标不是当前实测',
      cost: '原币、单位、地域和日期保留；住房挂牌不是最低可行预算', fx: '仅使用ECB同日交叉汇率，超过7天标为过期'},
    data_origin: 'Reviewed public seed; no runtime database or model access',
    sources_without_recorded_license: snapshot.sources.filter(s => !s.license).length};
  if (name === 'compare_cities') {
    const cities = args.cities.map(value => resolve(snapshot, value, 'city').row);
    if (new Set(cities.map(c => c.id)).size !== cities.length) fail('DUPLICATE_CITY', '请比较不同城市。');
    return {months, cities: cities.map(c => details(snapshot, summary(snapshot, c, months), months, args, now)),
      metrics: months.map(month => ({month, values: cities.map(c => ({id: c.id, values: scoringValues(c, month)}))})),
      comparison_url: cities.length === 2 ? snapshot.origin + '/compare/' + cities.map(c => c.slug).sort().join('-vs-') + '/' : null,
      meaning: '数值与口径逐项比较，缺项和签证不判赢家；不提供通用最佳城市。'};
  }
  if (name === 'calculate_budget') {
    if (args.solve_for === '住宿' && args.expenses.some(e => e.category === 'housing')) fail('SOLVED_EXPENSE_ALREADY_LISTED', '已列住宿费用时不要再次把剩余钱分配给住宿。');
    const normalized = args.expenses.map(e => ({label: e.label, amount: e.amount * (e.basis === 'person' ? args.people : 1), period: e.period}));
    const result = calculateBudget({...args, budget: args.budget * (args.budget_basis === 'person' ? args.people : 1), expenses: normalized});
    const {data_version, ...plan} = args;
    return {...result, people: args.people, plan, price_evidence: 'planning_assumptions_only'};
  }
  if (name === 'convert_meeting_time') {
    const city = resolve(snapshot, args.city, 'city').row;
    if (!city.timeZone) fail('TIMEZONE_MISSING', '该城市时区尚未确定。');
    return {city: city.id, times: args.times.map(time => convertMeeting(args.date, time, args.home_timezone, city.timeZone))};
  }
}

export function query(snapshot, name, input = {}, {now = new Date()} = {}) {
  const base = {data_version: snapshot.data_version, source_snapshot_date: snapshot.source_snapshot_date};
  try {
    const tool = tools.find(t => t.name === name);
    if (!tool) fail('UNKNOWN_TOOL', '工具不存在，请先读取工具列表。');
    const parsed = tool.schema.safeParse(input);
    if (!parsed.success) fail('INVALID_ARGUMENTS', '参数不符合工具说明；请检查必填字段、范围和允许的字段。');
    const args = parsed.data;
    if (args.data_version && args.data_version !== snapshot.data_version) fail('DATA_VERSION_UNAVAILABLE', '请求版本不可用，请以返回的新版本重新建立本次建议。');
    const data = execute(snapshot, name.replace(/^nomads_/, ''), args, now);
    const result = {...base, data, sources: sourcesFor(snapshot, data), read_only: true};
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 65536) fail('RESULT_TOO_LARGE', '结果过大，请减少数量或使用专门的明细工具。');
    return result;
  } catch (error) {
    return {...base, error: {code: error.code || 'QUERY_FAILED', message: error.code ? error.message : '资料查询失败，请稍后重试。',
      ...(error.details ? {details: error.details} : {})}, read_only: true};
  }
}
