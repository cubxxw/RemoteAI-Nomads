import {readRegionalReferences} from './regional-data.js';
const DAY = 86400000;
const CATEGORIES = ['housing', 'food', 'utilities', 'transportation'];
const rows = async (env, sql, args = []) => (await env.DB.prepare(sql).bind(...args).all()).results || [];
const decode = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const age = (date, now) => Math.max(0, Math.floor((new Date(now).getTime() - new Date(date + 'T00:00:00Z').getTime()) / DAY));

// Method references were read on this date; price refreshes do not refresh this review date.
export const ESTAT_METHOD_SOURCES = [
  { id: 'estat:methodology:qa', url: 'https://www.stat.go.jp/data/kakei/qa-1.html', publisher: '日本总务省统计局',
    title: '家计调查官方Q&A：实际房租与不计持家归属家租（F-5、H-2）', kind: 'official',
    license: '注明来源；利用规则见统计局官网', accessed_at: '2026-10-18' },
  { id: 'estat:methodology:definitions', url: 'https://www.stat.go.jp/data/kakei/kaisetsu.html', publisher: '日本总务省统计局',
    title: '家计调查官方定义：实际消费、家庭范围与分布校正', kind: 'official',
    license: '注明来源；利用规则见统计局官网', accessed_at: '2026-10-18' },
];
const ESTAT_MAJORS = ['food','housing','utilities','household','clothing','healthcare','transport_communication','education','entertainment','other'];
const ESTAT_PARENTS = { dining: 'food', actual_rent_spend: 'housing', communication: 'transport_communication', transport: 'transport_communication' };

function estatMethodology(observations, sources) {
  const national = observations.filter(o => o.provider === 'estat' && o.scope === 'national');
  if (!national.length) return null;
  const byField = new Map(national.map(o => [o.field, o]));
  const total = byField.get('total_consumption'), housing = byField.get('housing');
  const majorRows = ESTAT_MAJORS.map(field => byField.get(field)).filter(Boolean);
  const comparable = total && majorRows.every(o => o.currency === total.currency && o.sample_end === total.sample_end && o.household_size === total.household_size);
  const majorSum = majorRows.reduce((sum, o) => sum + o.amount, 0);
  const sample = national.find(o => o.sample_size)?.sample_size || null;
  const source_ids = sources.filter(s => ESTAT_METHOD_SOURCES.some(m => m.url === s.url)).map(s => s.id);
  return {
    provider: 'estat', scope: 'national', household_size: 1, verified_at: '2026-10-18', source_ids,
    housing: { basis: 'actual_payments', actual_rent_paid_included: true, owner_occupied_imputed_rent_included: false,
      households_include_owner_occupiers: true,
      explanation: '房租项只计实际支付的租房、租间家租，不计自有住房的归属家租。全国平均同时包括自有住房家庭，因此住房均值不是租客平均房租或市场报价。',
      source_sections: ['Q&A F-5','Q&A H-2(2)'] },
    sample: { reported_aggregate_households: sample, source_label: '集計世帯数', period: national[0].sample_end.slice(0,4),
      meaning: `年平均结果表单身家庭列的「集計世帯数」${sample ?? '未标明'}；这是表内集计户数，不是全国单身家庭总数，也不能解释成全年仅有这些不同家庭受访。`,
      annual_unique_households: null, population_households: null, single_household_rotation_months: 3,
      weighting: '单身家庭结果按地区、男女和年龄分布校正，不能当作这些户数的简单算术平均。' },
    hierarchy: { total_field: 'total_consumption', major_fields: ESTAT_MAJORS, subcategory_parents: ESTAT_PARENTS,
      instruction: '总消费已含十大分类；分类已含子项。外食属于食料，家租地租属于住房，交通和通信属于交通及通信，禁止再加到父项或总额上。' },
    reconciliation: { currency: total?.currency || national[0].currency, published_total: total?.amount ?? null,
      major_categories_present: majorRows.length, major_categories_complete: majorRows.length === ESTAT_MAJORS.length && !!comparable,
      major_categories_sum: comparable ? majorSum : null,
      published_total_minus_major_sum: comparable && majorRows.length === ESTAT_MAJORS.length ? total.amount - majorSum : null,
      nonhousing_consumption: total && housing && total.currency === housing.currency && total.sample_end === housing.sample_end ? total.amount - housing.amount : null,
      instruction: '保留发布总额和各项原值；如分类之和与总额有差，不强行调平。非住房消费仅可由总消费减住房一次，不等于最低预算。' },
    notes: [
      'e-Stat 家计调查计实际支付的房租，不计自有住房的归属家租；包括自有住房家庭，不能将住房均值直接当作城市租金。',
      `样本口径：${sample ?? '未标明'} 是年平均结果表的「集計世帯数」，不是全国家庭总数或全年唯一受访户数。`,
      '总消费、十大分类和子项有包含关系；食料已含外食，住房已含家租地租，交通及通信已含交通与通信，不能重复相加。',
      '消费支出是购买商品和服务的实际支付；税金与社会保险费属于非消费支出，不能假定已包含在消费总额中。',
    ],
  };
}

/** Only reads previously imported ECB observations. No network requests or guessed rates. */
export async function readFxRate(env, base, quote, { now = new Date().toISOString() } = {}) {
  base = String(base).toUpperCase(); quote = String(quote).toUpperCase();
  if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote)) return null;
  if (base === quote) return { base, quote, rate: 1, date: now.slice(0, 10), checked_at: now, source_id: null, source_url: null, source_title: '同币种', stale: false, age_days: 0, method: 'identity' };
  // Pick a common publication date; never cross rates from different dates.
  const found = await rows(env, `SELECT f.*,s.url source_url,s.title source_title FROM fx_rates f JOIN sources s ON s.id=f.source_id
    WHERE f.base='EUR' AND f.quote IN (?,?) ORDER BY f.rate_date DESC,f.checked_at DESC`, [base, quote]);
  for (const date of [...new Set(found.map(r => r.rate_date))]) {
    const b = base === 'EUR' ? { rate: 1 } : found.find(r => r.rate_date === date && r.quote === base);
    const q = quote === 'EUR' ? { rate: 1 } : found.find(r => r.rate_date === date && r.quote === quote);
    if (!b || !q) continue;
    const evidence = q.source_id ? q : b;
    const age_days = age(date, now);
    return { base, quote, rate: q.rate / b.rate, date, checked_at: evidence.checked_at,
      source_id: evidence.source_id, source_url: evidence.source_url, source_title: evidence.source_title,
      stale: age_days > 7, age_days, method: 'ECB cross via EUR' };
  }
  return null;
}

/** City prices and separately scoped national household references, never a fabricated total. */
export async function readCityCosts(env, cityId, { currency = 'CNY', now = new Date().toISOString() } = {}) {
  currency = String(currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('INVALID_CURRENCY');
  const city = await env.DB.prepare('SELECT id,country_id FROM cities WHERE id=?').bind(cityId).first();
  if (!city) return null;
  const cityPrices = await rows(env, `WITH latest AS (
    SELECT o.*,ROW_NUMBER() OVER(PARTITION BY provider,COALESCE(city_id,''),field ORDER BY sample_end DESC,checked_at DESC,id DESC) AS rn
    FROM cost_observations o WHERE city_id=? OR (country_id=? AND scope='national')
  ) SELECT o.*,s.url source_url,s.title source_title FROM latest o JOIN sources s ON s.id=o.source_id WHERE rn=1 ORDER BY o.scope,o.category,o.field`, [cityId, city.country_id]);
  const regional = city.country_id === 'CN' ? await readRegionalReferences(env, cityId, {now}) : [];
  const found = [...cityPrices,...regional];
  const fx = {};
  for (const from of [...new Set(['USD', 'JPY', ...found.map(o => o.currency)])]) fx[from] = await readFxRate(env, from, currency, { now });
  const observations = found.map(o => {
    const { rn, payload_hash, ...value } = o;
    const rate = fx[o.currency];
    const quality_flags = Array.isArray(o.quality_flags) ? [...o.quality_flags] : decode(o.quality_flags, []);
    const stale = age(o.sample_end, now) > (o.provider === 'estat' || o.period === 'year' ? 550 : 60);
    if (stale) quality_flags.push('stale_observation');
    return { ...value, observed_at: o.sample_end, quality_flags: [...new Set(quality_flags)], detail: typeof o.detail === 'object' ? o.detail : decode(o.detail, {}), stale,
      conversion: rate ? { amount: Math.round(o.amount * rate.rate * 100) / 100, currency, rate: rate.rate, date: rate.date, source_id: rate.source_id, stale: rate.stale } : null };
  });
  const hasEstat = found.some(o => o.provider === 'estat' && o.scope === 'national');
  const methodUrls = hasEstat ? ESTAT_METHOD_SOURCES.map(s => s.url) : [];
  const sourceIds = [...new Set([...found.map(o => o.source_id), ...Object.values(fx).map(r => r?.source_id).filter(Boolean)])];
  const sources = sourceIds.length ? await rows(env, `SELECT * FROM sources WHERE id IN (${sourceIds.map(() => '?').join(',')})${methodUrls.length ? ` OR url IN (${methodUrls.map(() => '?').join(',')})` : ''}`, [...sourceIds, ...methodUrls]) : [];
  const methodology = estatMethodology(observations, sources);
  for (const observation of observations) if (observation.provider === 'estat') observation.detail = { ...observation.detail,
    aggregation_role: observation.field === 'total_consumption' ? 'total' : ESTAT_PARENTS[observation.field] ? 'subcategory' : 'major_category',
    parent_field: ESTAT_PARENTS[observation.field] || (observation.field === 'total_consumption' ? null : 'total_consumption'),
    do_not_add_to_parent: true, owner_occupied_imputed_rent_included: false,
    methodology_source_ids: methodology?.source_ids || [],
  };
  const runs = await rows(env, `SELECT provider,finished_at,status,summary FROM (
    SELECT *,ROW_NUMBER() OVER(PARTITION BY provider ORDER BY finished_at DESC,id DESC) AS rn FROM cost_sync_runs
  ) WHERE rn=1 ORDER BY provider`);
  const sync_status = runs.map(r => ({ provider: r.provider, checked_at: r.finished_at, status: r.status, error: decode(r.summary, {}).error || null }));
  const local = observations.filter(o => o.scope === 'city');
  return { city_id: cityId, country_id: city.country_id, observations, sources, fx, sync_status, methodology, reference_total: null,
    coverage: { city_observations: local.length, national_observations: observations.filter(o=>o.scope==='national').length,
      regional_observations: regional.length,
      missing_categories: CATEGORIES.filter(c => !local.some(o => o.category === c)) },
    limitations: [
      '单项商品、票价、月租的单位不同，不能直接相加；没有完整且同口径的月预算。',
      'CostCompass 是第三方采集的报价样本，住房是挂牌价，不证明短租、合租或实际成交价。',
      ...(city.country_id === 'JP' ? ['e-Stat 是日本全国单身家庭实际月均支出，含自有住房家庭，不是城市租房报价，也不是游民预算。'] : []),
      ...(regional.length ? ['区域食品监测和居民年度支出保留真实地域与采样期，不能直接当成本城住宿报价、月预算或价格下限。'] : []),
      ...(methodology?.notes || []),
      ...(Object.values(fx).some(r => r?.stale) ? ['汇率参考已超过7天；换算保留原汇率日期，不能作为实时交易价。'] : []),
    ] };
}
