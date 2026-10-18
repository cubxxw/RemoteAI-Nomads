import { KEYS, SEASONAL_VIEW, parseState, rankCities, esc } from '../public/modules/ranking.js';

const origin = 'https://nomads.cubxxw.com';
export const DOMESTIC_START = '<!-- seasonal:domestic:start -->';
export const DOMESTIC_END = '<!-- seasonal:domestic:end -->';
export const NEEDS_START = '<!-- seasonal:needs:start -->';
export const NEEDS_END = '<!-- seasonal:needs:end -->';
export const DOMESTIC_COUNT = 5;
export const NEED_COUNT = 3;

const money = amount => '≈$' + Math.round(amount).toLocaleString('en-US');
const cityName = city => city.name.replace(/（[^）]*）/g, '');
const cityLink = city => `<a href="${origin}/cities/${city.slug}/">${esc(cityName(city))}</a>`;
const monthMean = (city, month) => city.months?.[month - 1]?.meanC;
const temperature = (city, month) => Number.isFinite(monthMean(city, month)) ? Math.round(monthMean(city, month)) + '°C' : '—';
const scored = city => Number.isFinite(city.score) && KEYS.every(key => Number.isFinite(city.scores?.[key]));
const ranked = (catalog, url) => rankCities(catalog, parseState(new URL(url)));
const monthQuery = () => `month=${SEASONAL_VIEW.month}&season=${SEASONAL_VIEW.id}`;

export function recommendationViews() {
  const current = monthQuery();
  return [
    {key:'budget', label:'月预算≤$1,000', query:`preset=budget&budget=1000&${current}`, metric:'budget'},
    {key:'visa', label:'大陆护照免签＋≤$1,000', query:`preset=visa&budget=1000&${current}`, metric:'budget'},
    {key:'internet', label:'国外 · 网络优先', query:`preset=internet&abroad=1&${current}`, metric:'internet'},
    {key:'safe', label:'国外 · 安全优先', query:`preset=safe&abroad=1&${current}`, metric:'safety'},
    {key:'warm', label:`${SEASONAL_VIEW.month}月温暖 · 18–28°C`, query:`warm=1&abroad=1&${current}`, metric:'temperature'},
    {key:'winter', label:'提前看1月避寒', query:'preset=winter&abroad=1', metric:'temperature'},
  ].map(view => ({...view, url:`${origin}/?${view.query}`}));
}

function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('推荐目录为空。');
  if (new Set(catalog.map(city => city.slug)).size !== catalog.length || catalog.some(city => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(city.slug))) throw new Error('推荐目录存在重复或不合法城市。');
}

export function domesticRecommendations(catalog) {
  validateCatalog(catalog);
  const url = `${origin}/?country=CN`;
  const cities = ranked(catalog, url);
  const top = cities.filter(scored).slice(0, DOMESTIC_COUNT);
  if (top.length !== DOMESTIC_COUNT || top.some(city => !Number.isFinite(city.budget) || city.budget <= 0)) throw new Error('国内推荐不足五座完整城市。');
  // These are directory links, never a second ranking with guessed scores.
  const other = cities.filter(city => city.score === null);
  const dali = other.findIndex(city => city.slug === 'dali');
  if (dali > 0) other.unshift(...other.splice(dali, 1));
  return {url, total:cities.length, scoredCount:cities.filter(scored).length, cities:top, other};
}

export function needRecommendations(catalog) {
  validateCatalog(catalog);
  return recommendationViews().map(view => {
    const state = parseState(new URL(view.url));
    const all = ranked(catalog, view.url);
    // Do not skip a top result with missing evidence and silently call the next one #1.
    const cities = all.slice(0, NEED_COUNT);
    if (cities.length !== NEED_COUNT || cities.some(city => !scored(city) || !Number.isFinite(city.budget) || city.budget <= 0 || view.metric === 'temperature' && !Number.isFinite(monthMean(city, state.month)))) throw new Error(`需求推荐 ${view.key} 缺少前三名的必要数据。`);
    return {...view, state, total:all.length, cities};
  });
}

export function recommendedMonths(city) {
  const values = city.months.filter(item => item.status === 'recommended').map(item => item.month);
  const ranges = [];
  for (const value of values) {
    const last = ranges.at(-1);
    if (last && value === last[1] + 1) last[1] = value;
    else ranges.push([value, value]);
  }
  return ranges.map(([start,end]) => (start === end ? start : `${start}–${end}`) + '月').join(' · ') || '—';
}

export function renderDomesticBlock(catalog) {
  const group = domesticRecommendations(catalog);
  const month = SEASONAL_VIEW.month;
  const lines = [DOMESTIC_START, '## 国内先看哪里', '', `已收录${group.total}座国内目的地，${group.scoredCount}座有完整评分。这里不限定出发月份，按综合分排序。`, '',
    `<table tabindex="0" aria-label="国内综合推荐，可横向滚动">`,
    `<thead><tr><th scope="col" nowrap>城市</th><th scope="col" nowrap>月花费 / USD</th><th scope="col" nowrap>${month}月均温</th><th scope="col" nowrap>推荐月份</th></tr></thead>`, '<tbody>'];
  for (const [i, city] of group.cities.entries()) lines.push(`<tr><td nowrap>${i+1}. ${cityLink(city)}</td><td nowrap align="right">${money(city.budget)}</td><td nowrap align="right">${temperature(city,month)}</td><td nowrap>${recommendedMonths(city)}</td></tr>`);
  lines.push('</tbody>', '</table>', '', `[查看全部国内目的地 →](${group.url})`);
  if (group.other.length) {
    lines.push('', `也可以看${group.other.map(city => `${cityLink(city)}${Number.isFinite(monthMean(city,month)) ? '（'+temperature(city,month)+'）' : ''}`).join(' · ')}。气温取${month}月均温，这${group.other.length}座的月预算与评分还在补充。`);
  }
  lines.push(DOMESTIC_END);
  return lines.join('\n');
}

function needDetail(city, view) {
  if (view.metric === 'budget') return money(city.budget) + '/月';
  if (view.metric === 'temperature') return temperature(city, view.state.month) + ' · ' + money(city.budget) + '/月';
  return city.scores[view.metric] + '/10 · ' + money(city.budget) + '/月';
}

export function renderNeedsBlock(catalog) {
  const views = needRecommendations(catalog);
  const lines = [NEEDS_START, '## 按你在意的选', '', `除1月避寒外，均取本期${SEASONAL_VIEW.month}月视角；每行列出对应条件的前三名。网络与安全用评分表示。手机可横滑表格。`, '',
    '<table tabindex="0" aria-label="按预算、签证、网络、安全与季节选城市，可横向滚动">',
    '<thead><tr><th scope="col" nowrap>你在意什么</th><th scope="col" nowrap>先看这3座</th></tr></thead>', '<tbody>'];
  for (const view of views) {
    const label=view.label.split(/＋| · /).map(esc).join('<br>');
    lines.push(`<tr><th scope="row" nowrap>${label}<br><a href="${esc(view.url)}">查看${view.total}城 →</a></th><td nowrap>${view.cities.map(city => `${cityLink(city)} · ${esc(needDetail(city, view))}`).join('<br>')}</td></tr>`);
  }
  lines.push('</tbody>', '</table>', NEEDS_END);
  return lines.join('\n');
}
