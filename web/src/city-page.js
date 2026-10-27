import {cityText} from '../public/modules/city-copy.js';
import {articleBySlug, relatedArticlesHTML} from './article-catalog.js';
import {entryResourceMarkup,workspaceResourceMarkup} from './trip-resources.js';
import {travelerBudgetMarkup} from './traveler-budget-markup.js';
import {travelerDefaults} from '../public/modules/traveler-budget.js';
import {cityPlacesSection} from './city-places.js';
import {travelAdvisory} from '../public/modules/recommendation-policy.js';
import {cityAdvisoryMarkup} from './travel-advisory.js';
import { esc, external, photo } from './render.js';
import {seasonalCityNote,seasonalProfile} from './seasonal-notes.js';
import { monthRanges } from '../public/modules/months.js';
import { KEYS, LABELS } from '../public/modules/ranking.js';
import { numberOrNull, monthValues, seasonLabel, formatAmount, meetingTime, timeDifference } from '../public/modules/city-ui.js';

const climateText = (value, unit) => value === null ? '待补充' : `${Math.round(value)}${unit}`;
const source = (url, label, date) => `<p class="city-source">${external(url, label)}${date ? `<span>核对 ${esc(date)}</span>` : ''}</p>`;
const cityIcon = name => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${({plus:'M10 4v12M4 10h12',heart:'M16.5 4.8a4.2 4.2 0 0 0-6.5.8 4.2 4.2 0 0 0-6.5-.8C.4 8.2 4.8 12.8 10 17c5.2-4.2 9.6-8.8 6.5-12.2Z',left:'m12 5-5 5 5 5',right:'m8 5 5 5-5 5'})[name]}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const details = (title, content, cls = '') => `<details class="city-disclosure ${cls}"><summary>${title}<span aria-hidden="true">${cityIcon('plus')}</span></summary><div>${content}</div></details>`;
const section = (id, title, content) => `<section class="city-section" id="${id}" aria-labelledby="${id}-title"><h2 id="${id}-title">${title}</h2>${content}</section>`;
const dataAmount = (amount, currency) => `<span data-money-amount="${amount}">${formatAmount(amount, currency)}</span>`;
const itemNames = { food_chicken_1kg:'鸡胸肉 1 kg',food_beef_1kg:'牛肉 1 kg',food_fish_1kg:'鱼片 1 kg',food_deli_meat_1kg:'火腿 / 熟肉 1 kg',food_milk_1l:'牛奶 1 L',food_yogurt_150g:'酸奶 150 g',food_cheese_1kg:'奶酪 1 kg',food_butter_200g:'黄油 200 g',food_eggs_12:'鸡蛋 12 枚',food_bread_500g:'面包 500 g',food_rolls_1pc:'小面包 1 个',food_pasta_500g:'意面 500 g',food_rice_1kg:'大米 1 kg',food_oats_500g:'燕麦 500 g',food_potatoes_1kg:'土豆 1 kg',food_tomatoes_1kg:'番茄 1 kg',food_peppers_1kg:'甜椒 1 kg',food_carrots_1kg:'胡萝卜 1 kg',food_onions_1kg:'洋葱 1 kg',food_garlic_1kg:'大蒜 1 kg',food_apples_1kg:'苹果 1 kg',food_banana_1kg:'香蕉 1 kg',food_oranges_1kg:'橙子 1 kg',food_lentils_1kg:'扁豆 1 kg',food_canned_tomatoes_400g:'番茄罐头 400 g',food_oil_1l:'葵花籽油 1 L',food_flour_1kg:'面粉 1 kg',food_sugar_1kg:'糖 1 kg',food_coffee_250g:'咖啡粉 250 g',food_water_1_5l:'饮用水 1.5 L',food_juice_1l:'橙汁 1 L',food_pork_1kg:'猪肉 1 kg',food_lettuce_1head:'生菜 1 颗',transport_gasoline_1l:'汽油 1 L',transport_monthly_pass:'公共交通月票',transport_oneway_ticket:'公共交通单程票',transport_taxi_start:'出租车起步价',transport_taxi_1km:'出租车每公里',utilities_basic_85m2:'85 m² 公寓基础水电',utilities_mobile_10gb:'手机套餐 10 GB 以上',utilities_internet_60mbps:'宽带 60 Mbps 以上',entertainment_fitness_monthly:'健身房月费',entertainment_cinema:'电影票',entertainment_tennis_1hr:'网球场 1 小时',restaurant_beer_imported:'进口啤酒 330 ml',restaurant_midrange_2p:'中档餐馆双人餐',restaurant_beer_domestic:'本地啤酒 500 ml',restaurant_cappuccino:'卡布奇诺',restaurant_inexpensive:'平价餐馆一餐',clothing_jeans:'牛仔裤',clothing_summer_dress:'连锁店夏装',clothing_business_shoes:'皮质正装鞋',clothing_running_shoes:'品牌跑鞋',healthcare_cold_medicine:'感冒药 6 日用量',healthcare_antibiotics:'抗生素 12 剂',healthcare_doctor_15min:'医生问诊 15 分钟' };
const itemLabel = row => {
  if (row.category === 'housing' && /housing_[13]br_/.test(row.field)) {
    const rooms = row.field.includes('1br') ? '一居室' : '三居室';
    const area = /city-wide/i.test(row.label) ? '全城样本' : row.field.endsWith('outside') ? '中心区外' : '中心区';
    return `${rooms}公寓（${area}）`;
  }
  return itemNames[row.field] || row.label;
};
const itemUnit = row => {
  const unit = String(row.unit || row.period || '').replace(/^[A-Z]{3}\s*\/\s*/, '');
  if (unit === '单身家庭/月') return '/ 单身家庭 / 月';
  return ({ month:'/ 月',item:'/ 件',pair:'/ 双',liter:'/ L',trip:'/ 次',km:'/ km',meal:'/ 餐',ticket:'/ 张',hour:'/ 小时',visit:'/ 次' })[unit] || unit;
};

export function climateChart(climate, selected) {
  const months = Array.from({ length: 12 }, (_, i) => climate.find(r => Number(r.month) === i + 1));
  const known = months.map(r => numberOrNull(r?.mean_c)).filter(v => v !== null);
  if (!known.length && !months.some(r => numberOrNull(r?.rain_mm) !== null)) return '<p class="city-empty">逐月气候待补充，可先查看原资料的月份标签。</p>';
  const low = known.length ? Math.floor(Math.min(...known) / 10) * 10 : 0;
  const high = known.length ? Math.max(low + 10, Math.ceil(Math.max(...known) / 10) * 10) : 30;
  const maxRain = Math.max(100, Math.ceil(Math.max(...months.map(r => numberOrNull(r?.rain_mm) ?? 0)) / 100) * 100);
  const x = index => 64 + index * 54;
  const tempY = value => 102 - (value - low) / (high - low) * 68;
  let line = '', pen = false;
  months.forEach((r, i) => { const v = numberOrNull(r?.mean_c); if (v === null) { pen = false; return; } line += `${pen ? 'L' : 'M'}${x(i)},${tempY(v).toFixed(1)} `; pen = true; });
  return `<div class="city-weather-chart"><svg viewBox="0 0 704 230" role="img" aria-labelledby="climate-chart-title climate-chart-desc"><title id="climate-chart-title">全年平均气温与月雨量</title><desc id="climate-chart-desc">上方绿线表示均温，下方浅绿柱表示降雨。具体数值可用月份选择器查看，也可展开逐月数据。</desc><text class="chart-unit" x="10" y="23">均温 °C</text><text class="chart-unit" x="10" y="142">降雨 mm</text><line class="chart-rule" x1="40" y1="102" x2="680" y2="102"/><line class="chart-rule" x1="40" y1="198" x2="680" y2="198"/><text class="chart-axis" x="12" y="42">${high}°</text><text class="chart-axis" x="12" y="105">${low}°</text><text class="chart-axis" x="8" y="155">${maxRain}</text><text class="chart-axis" x="16" y="201">0</text>${months.map((_, i) => `<g data-chart-month="${i + 1}" class="${i + 1 === selected ? 'is-current' : ''}"><rect class="chart-selection" x="${x(i) - 21}" y="25" width="42" height="177" rx="4"/></g>`).join('')}<path class="chart-temperature" d="${line}"/>${months.map((row, i) => {
    const value = numberOrNull(row?.mean_c), rain = numberOrNull(row?.rain_mm), height = rain === null ? 0 : rain / maxRain * 48;
    return `<g data-chart-month="${i + 1}" class="${i + 1 === selected ? 'is-current' : ''}">${rain === null ? `<text class="chart-missing" x="${x(i)}" y="182">—</text>` : `<rect class="chart-rain" x="${x(i) - 10}" y="${198 - height}" width="20" height="${Math.max(height, 1)}" rx="2"/>`}${value === null ? `<text class="chart-missing" x="${x(i)}" y="72">—</text>` : `<circle class="chart-point" cx="${x(i)}" cy="${tempY(value)}" r="3.5"/>`}<text class="chart-month" x="${x(i)}" y="221">${i + 1}月</text></g>`;
  }).join('')}</svg></div>`;
}

export function cityCostModel(costs) {
  const rates = { CNY: { rate: 1 } };
  for (const code of ['USD', 'JPY']) {
    const rate = costs?.fx?.[code];
    if (rate && rate.rate > 0) rates[code] = { ...rate, rate: 1 / rate.rate };
  }
  const items = (costs?.observations || []).map(row => ({ ...row, displayAmount: row.conversion?.currency === 'CNY' ? row.conversion.amount : row.currency === 'CNY' ? row.amount : null }));
  return { currency: 'CNY', rates, items, defaults:travelerDefaults(items), sources: costs?.sources || [], limitations: costs?.limitations || [] };
}

function costSection(c, budget) {
  const local = budget.items.filter(row => row.scope === 'city'), national = budget.items.filter(row => row.scope === 'national');
  const itemAmount = row => row.displayAmount === null ? formatAmount(row.amount, row.currency) : dataAmount(row.displayAmount, 'CNY');
  const isMonthlyRent = row => row.scope === 'city' && row.provider === 'costcompass' && row.quality !== 'review'
    && row.category === 'housing' && /^housing_[13]br_(center|outside)$/.test(row.field || '') && row.period === 'month'
    && row.quality_flags?.includes('asking_rent') && !row.quality_flags.includes('rent_outlier_requires_review')
    && numberOrNull(row.displayAmount) > 0;
  const priceRow = row => `<div class="city-price-row"><div><strong>${esc(itemLabel(row))}</strong><small>${esc(itemUnit(row))}${row.household_size ? ` · ${row.household_size} 人口径` : ''}${row.quality === 'review' || row.quality_flags?.includes('rent_outlier_requires_review') ? ' · 样本待复核' : ''}</small></div><div class="city-price-amount"><strong>${itemAmount(row)}</strong><small>${esc(row.observed_at || row.sample_end || '日期未标明')}</small></div>${isMonthlyRent(row) ? `<button type="button" class="city-fill-price" data-budget-fill="${row.displayAmount}" data-budget-label="${esc(itemLabel(row))}">用作月租</button>` : ''}</div>`;
  const groups = [['housing', '住房参考价'], ['restaurants', '餐馆与咖啡'], ['food', '日常食品'], ['transportation', '交通出行'], ['utilities', '水电与网络']];
  const references = local.length ? groups.map(([key, label]) => {
    const rows = local.filter(row => row.category === key);
    if (!rows.length) return '';
    if (key === 'housing') return `<div class="city-price-group"><h3>${label}</h3>${rows.slice(0, 2).map(priceRow).join('')}${rows.length > 2 ? details(`再看 ${rows.length - 2} 项住房样本`, rows.slice(2).map(priceRow).join('')) : ''}</div>`;
    return details(`${label}<span class="city-price-count">${rows.length} 项</span>`, rows.map(priceRow).join(''), 'city-price-category');
  }).join('') : budget.items.some(row=>row.scope==='regional') ? '<p class="city-caption">住房价格还没收录，展开“按我的报价调整”就能自己填。</p>' : '<p class="city-empty">这座城市的分项价格还没收录，可以自己填预算。</p>';
  const extra = local.filter(row => !groups.some(([category]) => row.category === category));
  const extraPrices = extra.length ? details(`其他消费参考 ${extra.length} 项`, extra.map(priceRow).join('')) : '';
  const nationalYear = (national[0]?.sample_end || national[0]?.observed_at || '').slice(0, 4);
  const nationalSample = national.find(row => row.sample_size)?.sample_size;
  const currencies = Object.keys(budget.rates);
  const traveler=travelerBudgetMarkup(budget);
  return section('budget', '自己算生活费', `<div class="city-section-toolbar"><p>按一个人住30天估算，拿到自己的报价后可以调整。</p><label class="city-currency-label" for="trip-currency">显示币种<select id="trip-currency">${currencies.map(code => `<option value="${code}">${({ CNY: '人民币 CNY', USD: '美元 USD', JPY: '日元 JPY' })[code] || code}</option>`).join('')}</select></label></div>${traveler.overview}<div class="city-price-references"><h3>消费参考</h3>${regionalReferenceSection(budget)}${references}${extraPrices}<p class="city-caption" data-fx-note${local.length ? '' : ' hidden'}>${local.some(row => row.conversion) ? `换算日期 ${esc(local.find(row => row.conversion)?.conversion.date || '未标明')} · 原币与来源见下方` : '汇率缺失的项目按原币展示'}</p>${national.length ? details('日本全国单身家庭月均支出', `<p>${esc(nationalYear || '对应年份')} 年全国调查${nationalSample ? `，年平均表集计户数 ${nationalSample}` : '，单身家庭口径'}；包含自有住房家庭。这是实际家庭消费结构参考，不能当作${esc(c.name_zh)}的租房总预算。</p>${national.map(priceRow).join('')}<p>住房支出包含自有住房家庭的实际支出，未计自有住房虚拟租金，不宜直接用作市场租金。</p>`) : ''}</div>${traveler.adjustment}${details('价格包含什么、来自哪里', `<ul class="city-source-notes">${budget.limitations.map(text => `<li>${esc(cityText(text))}</li>`).join('') || '<li>这座城市的分项价格还没收录，这里没有借用其他城市的数字。</li>'}</ul>${budget.sources.map(s => source(s.url, s.title || s.publisher || '消费数据来源', s.accessed_at)).join('')}${local.length ? `<div class="city-table-scroll" tabindex="0" role="region" aria-label="原币价格与单位"><table class="city-climate-table"><thead><tr><th>项目</th><th>原币价格</th><th>单位</th><th>样本日期</th></tr></thead><tbody>${local.map(row => `<tr><th>${esc(row.label)}</th><td>${formatAmount(row.amount, row.currency)}</td><td>${esc(row.unit || row.period)}</td><td>${esc(row.sample_end || row.observed_at)}</td></tr>`).join('')}</tbody></table></div>` : ''}${c.budget_amount ? `<div class="city-legacy"><strong>旧资料月成本：${formatAmount(c.budget_amount, c.budget_currency || 'USD')}</strong><p>${esc(cityText(c.budget_basis))}。上方计算器按你填的金额计算，这个旧数值不代表最低生活费。</p>${c.budgetSource ? source(c.budgetSource.url, '查看旧资料', c.budget_checked_at) : ''}</div>` : ''}`)}`);
}

export function regionalReferenceSection(budget) {
  const regional=budget.items.filter(row=>row.scope==='regional');
  if(!regional.length)return '';
  const groups=new Map();
  for(const row of regional){const key=row.area_id+':'+row.category;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  return `<section class="city-regional-references" aria-labelledby="regional-reference-title"><h3 id="regional-reference-title">当地消费参考</h3>${[...groups.values()].map(items=>{
    const first=items[0],food=first.category==='food';
    const period=food?first.sample_start+' — '+first.sample_end:first.sample_start.slice(0,4)+' 年';
    const value=row=>`<div><dt>${esc(row.label)}</dt><dd>${formatAmount(row.amount,row.currency)}<small>${food?' / '+({kg:'公斤',liter:'升'}[row.unit]||esc(row.unit)):' / 人 / 年'}</small></dd></div>`;
    return `<div class="city-regional-group"><div class="city-regional-heading"><strong>${esc(first.area_name)} · ${food?'食品零售监测':'居民消费'}</strong><span>${esc(period)}</span></div><dl class="city-regional-values">${items.slice(0,4).map(value).join('')}</dl>${items.length>4?details(`其余 ${items.length-4} 项监测价格`,`<dl class="city-regional-values">${items.slice(4).map(value).join('')}</dl>`):''}<p class="city-caption">${food?'这些历史价格来自州内不同县市的监测，单位沿用原记录。':'这是当地居民一年的人均支出，可以看消费结构，短租一个月还要另算。'}</p><p class="city-regional-source">${external(first.source_url,first.source_title||'查看原始资料')}<span>${first.published_at?'发布 '+esc(first.published_at):'出版日未标明'} · ${esc(first.source_locator||'')}</span></p></div>`;
  }).join('')}</section>`;
}

function seasonSection(c, month) {
  const current = monthValues(c, month);
  return section('season', '什么时候去', `<div class="city-section-toolbar"><p>按月份看看气温和雨量，再定出发日期。</p><div class="city-month-control"><button type="button" data-month-step="-1" aria-label="上一个月">${cityIcon('left')}</button><label class="sr-only" for="city-month">出发月份</label><select id="city-month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}" ${month === i + 1 ? 'selected' : ''}>${i + 1} 月</option>`).join('')}</select><button type="button" data-month-step="1" aria-label="下一个月">${cityIcon('right')}</button></div></div><div class="city-month-readout" aria-live="polite" aria-atomic="true"><div><span><b data-selected-month>${month} 月</b>历史均温</span><strong data-month-temperature>${climateText(current.mean, '°C')}</strong></div><div><span>月平均降雨</span><strong data-month-rain>${climateText(current.rain, ' mm')}</strong></div><div><span>月份建议</span><strong class="city-season-status" data-month-status data-status="${current.status}">${seasonLabel(current.status)}</strong></div></div>${climateChart(c.climate, month)}<p class="city-month-note" data-month-note>${esc(/继承|Notion/.test(current.note) ? '月份建议来自旧资料，选日期时也看看对应的气温和降雨。' : current.note || '这个月份暂无建议，可以参考气温和雨量。')}</p>${details('逐月数值与气候来源', `<p>图中是ERA5的2023–2025同月平均值，用来看季节差别。出发时的天气和空气质量仍要另查。</p><div class="city-table-scroll" tabindex="0" role="region" aria-label="逐月气候数据"><table class="city-climate-table"><thead><tr><th scope="col">月份</th><th scope="col">均温</th><th scope="col">日高温均值</th><th scope="col">月雨量</th><th scope="col">原有建议</th></tr></thead><tbody>${Array.from({ length: 12 }, (_, i) => { const m = monthValues(c, i + 1); return `<tr><th scope="row">${i + 1} 月</th><td>${climateText(m.mean, '°C')}</td><td>${climateText(m.high, '°C')}</td><td>${climateText(m.rain, ' mm')}</td><td>${seasonLabel(m.status)}</td></tr>`; }).join('')}</tbody></table></div>${c.climate[0] ? source(c.climate[0].source_url, '历史气象数据', c.climate[0].checked_at) : ''}<p>月份建议沿用旧资料。没有建议的月份，还需要补资料才能判断是否合适。</p>`)}`);
}

function workSection(c, date) {
  const meeting = meetingTime(date, 9, c.location?.timezone);
  return section('work', '办公与会议', `<div class="city-meeting"><div><h3>会议时间换算</h3><p>按上海时间开会，${esc(c.name_zh)}几点？</p><div class="city-controls"><label for="meeting-date">会议日期<input type="date" id="meeting-date" value="${date}" min="2000-01-01" max="2099-12-31" ${c.location?.timezone ? '' : 'disabled'}></label><label for="meeting-hour">上海时间<select id="meeting-hour" ${c.location?.timezone ? '' : 'disabled'}>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${h === 9 ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label></div></div><div class="city-meeting-result" aria-live="polite" aria-atomic="true"><span>${esc(c.name_zh)}当地时间</span><output data-meeting-time for="meeting-date meeting-hour">${meeting?.time || '待补充'}</output><small data-meeting-date>${meeting?.date || '城市时区待补充'}${meeting?.date && meeting.date !== date ? ' · 跨日' : ''}</small><small>${esc(c.location?.timezone || '')}${c.location?.timezone ? ' · 按日期处理夏令时' : ''}</small></div></div><div class="city-workspaces"><h3>共享工位</h3>${c.quotes.length ? c.quotes.map(q => `<article class="city-workspace"><div><h4>${esc(q.operator)}</h4><span>${esc(q.plan)}</span></div><strong>${esc(q.amount)} ${esc(q.currency)}<small> / ${esc(q.period)}</small></strong>${details('开放时间、限制与报价', `<dl class="city-evidence-list"><dt>开放时间</dt><dd>${esc(q.access_hours)}</dd><dt>运营方网络说明</dt><dd>${esc(q.network_claim)}</dd><dt>使用限制</dt><dd>${esc(q.restriction)}</dd><dt>报价有效性</dt><dd>${esc(q.validity)}</dd></dl>${source(q.source_url, '运营方公开报价', q.checked_at)}`)}</article>`).join('') : `<p class="city-empty">本栏暂时没有工位价格。到了当地可以买日票试一天，看看通话空间和开放时间是否合适。</p>`}${workspaceResourceMarkup(c.slug)}</div>${details(`AI工具的服务地区 <span class="city-inline-meta">${c.ai.filter(a => a.status === 'listed').length} / ${c.ai.length} 项列入</span>`, `<p>官方名单只说明哪些地区提供服务。你的账号、支付方式、要用的模型和住处网络是否可用，还要分别试。</p><ul class="city-ai-list">${c.ai.map(a => `<li><span><strong>${esc(a.product)}</strong><small>${esc(a.checked_at)}</small></span><span class="city-ai-status" data-status="${esc(a.status)}">${({ listed: '名单列入', not_listed: '未逐项列出', conditional: '有地区例外', unknown: '待核验' })[a.status] || '待核验'}</span>${external(a.source_url, '官方来源')}</li>`).join('') || '<li>地域名单待补充。</li>'}</ul>`)}`);
}

function entrySection(c) {
  const domestic = c.country_id === 'CN';
  const entryDetail = domestic ? '境内旅居，证件和住宿登记按自己的情况向住处确认。' : cityText(c.entry?.detail || '这里还没收录对应的入境条件。');
  return section('entry', domestic ? '入住与证件' : '停留与入境', `<div class="city-entry-summary"><strong>${esc(c.entry?.label || '入境条件待核验')}</strong><span>${domestic ? '中国大陆居民' : '中国大陆普通护照'}</span></div><p class="city-caption">${esc(entryDetail)}</p>${entryResourceMarkup(c.country_id)}${c.entry ? details(domestic ? '入住登记资料' : '旧入境资料说明', `<p>${domestic ? '入住需要哪些证件，向住处按自己的身份确认。' : '入境资格与远程工作的许可需分别确认。'+esc(c.entry.evidence_level === 'legacy' ? '这项建议来自旧资料，出发前要重新查。' : '')}</p>${source(c.entry.source_url, '历史标签的维护说明', c.entry.checked_at)}`) : ''}${c.visas.map(v => details(esc(v.name), `<dl class="city-evidence-list"><dt>停留与有效期</dt><dd>${esc(v.stay_text)}</dd><dt>财务要求</dt><dd>${esc(v.financial_rule)}</dd><dt>工作范围</dt><dd>${esc(v.work_scope)}</dd><dt>护照与领区</dt><dd>${esc(v.passport_scope)}</dd><dt>限制</dt><dd>${esc(v.restriction)}</dd><dt>政策资料</dt><dd>${esc(v.verification)} · 发布 ${esc(v.source_published_at || '未标明')}</dd></dl>${source(v.source_url, '官方政策', v.checked_at)}`)).join('')}${!c.visas.length ? `<p class="city-caption">${domestic ? '入住登记要求以当地和住处说明为准。' : '远程工作签证资料还没补齐，先到该国官方页面看看。'}</p>` : ''}`);
}

function searchCoverage(c, date) {
  const guide = articleBySlug(`${c.slug}-monthly-budget`);
  return {
    monthlyGuide: Boolean(guide && !guide.topic && guide.citySlugs.includes(c.slug)),
    costs: Boolean(c.costs?.observations?.some(row => row.scope === 'city' && numberOrNull(row.amount) !== null)),
    climate: Boolean(c.climate?.some(row => numberOrNull(row.mean_c) !== null)),
    meeting: Boolean(meetingTime(date, 12, c.location?.timezone)),
  };
}

function searchTitle(c, coverage) {
  if (travelAdvisory(c)) return `${c.name_zh}城市资料与出行提醒`;
  if (coverage.costs && coverage.climate) return `${c.name_zh}数字游民指南：预算、月份与远程工作`;
  const features = [coverage.monthlyGuide ? '月住费用' : coverage.costs ? '消费参考' : null, coverage.climate ? '历史气候' : null, coverage.meeting ? '会议时差' : null].filter(Boolean).slice(0, 2);
  const entry = c.country_id === 'CN' ? '入住证件' : '入境参考';
  return features.length ? `${c.name_zh}旅居资料：${features.length === 1 ? features[0] + '与' + entry : features.join('与')}` : `${c.name_zh}旅居资料与${entry}`;
}

function searchDescription(c, coverage) {
  const place = c.country_name && c.country_name !== c.name_zh ? `${c.name_zh}（${c.country_name}）` : c.name_zh;
  const advisory = travelAdvisory(c);
  if (advisory) return `${place}城市资料。${advisory.reason}。出行前请核对官方提醒；原有数据保留各自的资料日期。`;
  const costs = coverage.costs ? '城市消费样本可查' : '城市消费样本待补充';
  const climate = coverage.climate ? '可按月份查看历史气候' : '逐月历史气候待补充';
  return `${place}旅居与远程工作参考。${coverage.monthlyGuide ? '附单人30晚的月住费用指南。' : ''}${costs}，${climate}。${coverage.meeting ? '支持与北京的会议时间换算。' : ''}${c.country_id === 'CN' ? '入住证件与登记要求向住处确认。' : '停留条件与工作许可需分别核对。'}`;
}

export function renderCityPage(c, env = {}, options = {}) {
  const today = options.date || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const coverage = searchCoverage(c, today);
  const chosenMonth=Number(options.month);
  const month = Number.isInteger(chosenMonth)&&chosenMonth>=1&&chosenMonth<=12?chosenMonth:Number(today.slice(5, 7));
  const budget = cityCostModel(c.costs);
  const visitorTransitCity = {seoul:'首尔', singapore:'新加坡'}[c.slug];
  if (visitorTransitCity) {
    budget.defaults.transport = {amount:null, basis:'按短访票种与实际路线填写', source:null};
    budget.transportAssumption = visitorTransitCity + '短访交通按实际票种与路线填写，未确认适用的月票参考暂不计入';
  }
  const domestic = c.country_id === 'CN';
  const caveat = domestic && c.caveat === '具体住宿、网络、停留资格需要单独核验。' ? '问清房间条件和网络，入住需要的证件也向住处确认。' : cityText(c.caveat || '先用可取消的短住，验证一个完整工作日。');
  const recommended = c.months.filter(m => m.suitability === 'recommended').map(m => m.month);
  const monthGroups = monthRanges(recommended);
  const monthLabel = monthGroups.map((range, i) => `<span>${range}${i === monthGroups.length - 1 ? ' 月' : ''}</span>`).join('、');
  const data = { slug:c.slug, climate: c.climate, months: c.months, timeZone: c.location?.timezone || null, budget: {currency: budget.currency, rates: budget.rates,defaults:budget.defaults} };
  const body = `<link rel="stylesheet" href="/city.css"><link rel="stylesheet" href="/vendor/leaflet/leaflet.css"><link rel="stylesheet" href="/places.css"><article class="city-guide" id="city-guide"><nav class="city-breadcrumbs" aria-label="面包屑"><a href="/cities/">城市</a><span aria-hidden="true">/</span><a href="/countries/${esc(c.country_id.toLowerCase())}/">${esc(c.country_name)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(c.name_zh)}</span></nav><div class="city-heading"><div><h1>${esc(c.name_zh)}<span>${esc(c.name_en)}</span></h1></div><div class="city-heading-actions"><button type="button" class="city-action" data-save="${esc(c.slug)}" aria-label="收藏${esc(c.name_zh)}" aria-pressed="false">${cityIcon('heart')}</button><button type="button" class="city-action compare-add" data-compare="${esc(c.slug)}" data-name="${esc(c.name_zh)}" aria-pressed="false">${cityIcon('plus')}<span>对比</span></button></div></div>${cityAdvisoryMarkup(c)}<figure class="city-cover">${photo(c, '', 'eager')}${c.photo_source ? `<figcaption>${external(c.photo_source, c.photo_credit)}</figcaption>` : ''}</figure>${!travelAdvisory(c) && !seasonalProfile(c.slug) && c.summary && c.summary !== "从预算、月份与工作条件，了解这座城市。" ? `<p class="city-intro">${esc(cityText(c.summary))}</p>` : ""}<div class="city-at-a-glance"><a href="#budget"><span>生活预算</span><strong>${c.budget_amount ? '≈ ' + formatAmount(c.budget_amount, c.budget_currency || 'USD') : '自己算一笔'}</strong><small>${c.budget_amount ? '历史月花费 · 按你的住法重算' : '按住法和停留时间估算'}</small></a><a href="#season"><span>参考月份</span><strong class="city-months-short">${monthLabel || '待核验'}</strong><small>查看全年气温与雨量</small></a><a href="#entry"><span>${domestic ? '入住证件' : '入境参考'}</span><strong>${esc(c.entry?.label || '待核验')}</strong><small>${domestic ? '中国大陆居民' : '中国大陆普通护照'}</small></a><a href="#work"><span>与北京的时差</span><strong class="city-zone-short" data-time-difference title="${esc(c.location?.timezone || '时区待补充')}">${esc(timeDifference(today, c.location?.timezone))}</strong><small data-time-difference-date>${esc(today)} · 换算会议时间</small></a></div>${seasonalCityNote(c.slug)}${relatedArticlesHTML(c.slug)}<nav class="city-section-nav" aria-label="城市资料"><a data-city-anchor href="#budget" aria-current="location">生活预算</a><a data-city-anchor href="#season">出发季节</a><a data-city-anchor href="#work">远程工作</a><a data-city-anchor href="#places">工作地图</a><a data-city-anchor href="#entry">${domestic ? '入住证件' : '停留入境'}</a></nav><div class="city-guide-layout"><div class="city-guide-main">${costSection(c, budget)}${seasonSection(c, month)}${workSection(c, today)}${cityPlacesSection(c)}${entrySection(c)}${details('这些分数怎么看', `<dl class="city-score-list">${KEYS.map(key => `<div><dt>${esc(key==='climate'?'环境（历史）':key==='community'?'社区（历史）':LABELS[key])}</dt><dd>${numberOrNull(c.ranking?.[key]) === null ? '待补充' : Number(c.ranking[key]).toFixed(1) + ' / 10'}</dd></div>`).join('')}</dl><p>这些是旧资料里的分数。网络要在具体房间里试，安全情况也要按街区了解。</p>${c.ranking ? source(c.ranking.source_url, '城市指标记录', c.ranking.checked_at) : ''}<p>资料日期 ${esc(c.checked_at || '日期待补充')}。<a href="/about/">查看资料来源与说明</a></p>`)}<div class="city-end-links"><a href="/cities/">继续找城市</a><a href="/guides/first-month/">第一周落地清单</a></div></div><aside class="city-plan"><div class="city-plan-inner"><h2>订房前问清楚</h2><p>${esc(caveat)}</p><ul><li>在房间里试一次平时的会议</li><li>留出押金和临时换房的钱</li><li>${domestic ? '确认入住证件与登记要求' : '确认停留期与工作许可'}</li></ul><button class="city-secretary" type="button" data-agent-open data-agent-question="${esc(`我想去${c.name_zh}住一阵，请根据城市资料帮我核对季节、预算和远程工作条件。`)}">检查这份预算有没有漏项<span aria-hidden="true">↗</span></button></div></aside></div><script type="application/json" id="city-guide-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script></article><script type="module" src="/modules/city-ui.js"></script><script type="module" src="/modules/city-places.js"></script>`;
  return {
    title: searchTitle(c, coverage),
    description: searchDescription(c, coverage),
    body, share:{kind:'city',city:{slug:c.slug,name:c.name_zh,nameEn:c.name_en,country:c.country_name,countryCode:c.country_id,scores:{internet:numberOrNull(c.ranking?.internet)},budget:c.budget_amount,budgetCurrency:c.budget_currency||'USD',budgetCheckedAt:c.budget_checked_at,checkedAt:c.checked_at,photo:c.photo_url,photoCredit:c.photo_credit,photoSource:c.photo_source,why:travelAdvisory(c)?.reason||cityText(c.summary),visa:c.entry?{label:c.entry.label,detail:c.entry.detail}:null,months:Array.from({length:12},(_,i)=>({month:i+1,meanC:c.climate?.find(row=>Number(row.month)===i+1)?.mean_c??null}))}}, path: `/cities/${c.slug}/`, indexable: c.publication_status === 'published',
    jsonld: { '@context': 'https://schema.org', '@type': 'Place', name: c.name_zh, alternateName: c.name_en, url: `${(env.SITE_ORIGIN || 'http://127.0.0.1:8787').replace(/\/$/, '')}/cities/${c.slug}/` },
  };
}
