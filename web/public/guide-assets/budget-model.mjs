/** Shared planning model. No DOM, network, clock, storage, or locale-dependent arithmetic. */
const DEFAULTS = Object.freeze({tier:'comfort', nights:30, season:'standard', work:'cowork', currency:'CNY'});
const OPTIONS = Object.freeze({
  tier: ['economy', 'comfort', 'roomy'],
  season: ['standard', 'peak'],
  work: ['room', 'occasional', 'cowork'],
  currency: ['THB', 'MYR', 'CNY', 'USD', 'EUR']
});

function validSelection(value, key) {
  return typeof value === 'string' && OPTIONS[key].includes(value);
}

function validNights(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 365 ? number : null;
}

function validAmount(value) {
  if (typeof value === 'string') {
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
    value = Number(value);
  }
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function cents(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)) : null;
}

function priced(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** Invalid values fall back to city defaults. housingNative is an optional whole-stay user total. */
export function normalizeScenario(input, cityConfig = {}) {
  const candidate = input && typeof input === 'object' ? input : {};
  const configured = cityConfig?.defaultScenario ?? {};
  const result = {};
  for (const key of ['tier', 'season', 'work', 'currency']) {
    const fallback = validSelection(configured[key], key) ? configured[key] : DEFAULTS[key];
    result[key] = validSelection(candidate[key], key) ? candidate[key] : fallback;
  }
  result.nights = validNights(candidate.nights) ?? validNights(configured.nights) ?? DEFAULTS.nights;
  // Stable shape/order also keeps the generated JSON and query strings easy to review.
  const normalized = {tier:result.tier, nights:result.nights, season:result.season, work:result.work, currency:result.currency};
  const housing = validAmount(candidate.housingNative);
  if (housing !== null) normalized.housingNative = housing;
  return normalized;
}

function exchangeRate(config, currency) {
  if (currency === config.nativeCurrency) return 1;
  const fx = config.fx;
  const sourceRate = fx?.base === config.nativeCurrency ? 1 : fx?.rates?.[config.nativeCurrency];
  const targetRate = fx?.base === currency ? 1 : fx?.rates?.[currency];
  return priced(sourceRate) && sourceRate > 0 && priced(targetRate) && targetRate > 0
    ? targetRate / sourceRate : null;
}

function convert(amount, rate) {
  if (!priced(amount) || !priced(rate)) return null;
  const converted = amount * rate;
  return Number.isFinite(converted) ? Math.round(converted) : null;
}

function item(config, {id, label, amountNative, kind, sourceIds = [], note = ''}) {
  return {id, label, amountNative:priced(amountNative) ? cents(amountNative) : null,
    kind, sourceIds:[...sourceIds], checkedOn:kind === 'user' ? null : (config.checkedOn ?? null), note};
}

/**
 * Returns a spending plan, never availability or an inclusive booking quote.
 * Missing required prices block totals. Excluded costs and deposits remain explicit.
 */
export function calculateBudget(cityConfig, input = {}) {
  if (!cityConfig || typeof cityConfig !== 'object') throw new TypeError('cityConfig is required');
  const scenario = normalizeScenario(input, cityConfig);
  const tier = cityConfig.tiers?.[scenario.tier] ?? {};
  const warnings = [cityConfig.planNote ?? '三档为预算计划，不是统计均价或可订报价。'];
  const items = [];
  const housing = tier.housing?.[scenario.season];
  const customHousing = Object.hasOwn(scenario, 'housingNative');

  if (customHousing) {
    items.push(item(cityConfig, {id:'housing', label:'住房总额（用户输入）', amountNative:scenario.housingNative,
      kind:'user', sourceIds:[], note:`用户输入覆盖所选${scenario.nights}晚的房费总额；不再按月或按晚分摊。是否含税、水电及押金以用户取得的报价为准。`}));
  } else if (!housing || !priced(housing.amount)) {
    items.push(item(cityConfig, {id:'housing', label:'住房（待询价）', amountNative:null, kind:'unknown',
      sourceIds:housing?.sourceIds ?? [], note:scenario.season === 'peak'
        ? (tier.housing?.peakNote ?? '没有已核旺季住房总价。') : '此方案没有已核住房金额。'}));
    warnings.push(scenario.season === 'peak' ? '旺季住房金额未核，合计待询价；可填入所选晚数的房费总额。' : '住房金额未知，不能当作0计入合计。');
  } else {
    const prorated = scenario.nights !== 30;
    const note = [housing.note, prorated
      ? `仅把30晚住房预留按${scenario.nights}/30作规划分摊，非可订报价；原月租最短一月，短租及超过一月须按完整日期重新询价。`
      : '30晚按一笔月价参照或住房预留规划，最终日期和含费范围仍须确认。'].filter(Boolean).join(' ');
    items.push(item(cityConfig, {id:'housing', label:housing.kind === 'reference' ? '住房（月价参照）' : '住房预留',
      amountNative:cents(housing.amount * scenario.nights / 30), kind:housing.kind ?? 'allowance', sourceIds:housing.sourceIds, note}));
    if (prorated) warnings.push('非30晚住房仅作预算分摊；原月租有最短一月条件，不保证短租适用，实际房费需重新报价。');
  }

  const workPrices = cityConfig.workPrices ?? {};
  if (scenario.work === 'room') {
    items.push(item(cityConfig, {id:'work', label:'额外共享办公票', amountNative:0, kind:'assumption',
      note:workPrices.room?.note ?? '不额外购买共享办公票；房间工作条件需另核。'}));
  } else if (scenario.work === 'occasional') {
    const price = workPrices.daily ?? {};
    const visits = Math.ceil(scenario.nights * (price.visitsPer30Nights ?? 4) / 30);
    items.push(item(cityConfig, {id:'work', label:`偶尔办公（${visits}天日票）`,
      amountNative:priced(price.amount) ? cents(price.amount * visits) : null,
      kind:price.kind ?? 'reference', sourceIds:price.sourceIds,
      note:`按每30晚${price.visitsPer30Nights ?? 4}天、向上取整，共${visits}天常规日票预留；这是使用天数假设。 ${price.note ?? ''}`}));
  } else {
    const price = workPrices.monthly ?? {};
    const passes = Math.ceil(scenario.nights / (price.billingNights ?? 30));
    items.push(item(cityConfig, {id:'work', label:`共享办公（${passes}张整月票）`,
      amountNative:priced(price.amount) ? cents(price.amount * passes) : null,
      kind:price.kind ?? 'reference', sourceIds:price.sourceIds,
      note:`为${scenario.nights}晚预留${passes}张整月票；不把月票除以30当日票。 ${price.note ?? ''}`}));
    if (scenario.nights !== 30) warnings.push('共享办公按整张月票预留，月票起算日和有效期未确认；不是按晚计费。');
  }

  for (const living of tier.living ?? []) {
    items.push(item(cityConfig, {id:living.id, label:living.label,
      amountNative:priced(living.amount) ? cents(living.amount * scenario.nights / 30) : null,
      kind:living.kind ?? 'allowance', sourceIds:living.sourceIds,
      note:`${living.note ?? '编辑生活预留。'} 按所选${scenario.nights}晚调整，不代表实际消费。`}));
  }
  if (!Array.isArray(tier.living) || tier.living.length === 0) {
    items.push(item(cityConfig, {id:'living', label:'生活费（未知）', amountNative:null, kind:'unknown', note:'缺少生活预算配置，不能按0处理。'}));
  }
  const missing = items.filter(row => row.amountNative === null).map(row => row.id);
  const knownSubtotalNative = cents(items.reduce((total, row) => total + (row.amountNative ?? 0), 0));
  const totalNative = missing.length === 0 ? knownSubtotalNative : null;
  const fxRate = exchangeRate(cityConfig, scenario.currency);
  if (fxRate === null) {
    missing.push('fx');
    warnings.push('此币种没有同日已保存汇率；原币金额可用，换算金额暂缺。');
  }
  const knownSubtotalDisplay = convert(knownSubtotalNative, fxRate);
  const totalDisplay = convert(totalNative, fxRate);
  if (scenario.nights > 30) warnings.push('超过30晚仍是规划演算；没有确认续住价格、跨季房费、库存或长住折扣。');
  warnings.push('总额包含所列预留和参考票价；未确认的税费与超量费用、机票、签证、保险及押金另计。');
  return {scenario, nativeCurrency:cityConfig.nativeCurrency, currency:scenario.currency,
    items:items.map(row => ({...row, amountDisplay:convert(row.amountNative, fxRate)})),
    totalNative, totalDisplay, knownSubtotalNative, knownSubtotalDisplay, fxRate,
    fxDate:cityConfig.fx?.date ?? null, checkedOn:cityConfig.checkedOn ?? null,
    excluded:[...(cityConfig.excluded ?? [])], warnings, missing,
    depositNative:priced(cityConfig.deposit?.amount) ? cents(cityConfig.deposit.amount) : null,
    depositNote:cityConfig.deposit?.note ?? '押金金额未知，未计入消费总额。',
    planLabel:tier.label ?? scenario.tier, planNote:tier.note ?? '',
    totalKind:'planning-estimate', roundingNote:'各项换算后都取整，总额则先加原币、再统一换算，因此逐项相加可能有一点差额。'};
}

export function readScenario(search = '', cityConfig = {}) {
  let params;
  try { params = search instanceof URLSearchParams ? search : new URLSearchParams(typeof search === 'string' ? search.replace(/^\?/, '') : ''); }
  catch { params = new URLSearchParams(); }
  return normalizeScenario({tier:params.get('tier'), nights:params.get('nights'), season:params.get('season'),
    work:params.get('work'), currency:params.get('currency'), housingNative:params.get('housing')}, cityConfig);
}

/** Returns URLSearchParams; callers decide the pathname and history behavior. */
export function writeScenario(input) {
  const scenario = normalizeScenario(input);
  const params = new URLSearchParams();
  for (const key of ['tier', 'nights', 'season', 'work', 'currency']) params.set(key, String(scenario[key]));
  if (Object.hasOwn(scenario, 'housingNative')) params.set('housing', String(scenario.housingNative));
  return params;
}

export function formatMoney(amount, currency) {
  if (!priced(amount)) return '待询价';
  const number = Math.round(amount).toLocaleString('en-US', {maximumFractionDigits:0});
  return `${number} ${OPTIONS.currency.includes(currency) ? currency : DEFAULTS.currency}`;
}
