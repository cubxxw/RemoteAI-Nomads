import {
  packRankingData,
  displayMonth,
  KEYS,
  LABELS,
  PRESETS,
  SEASONAL_VIEW,
  isDefault,
  parseState,
  rankCities,
  renderRow,
  esc,
  stateParams,
} from "../public/modules/ranking.js";

import { comparisonBody, comparisonFit } from "./comparison-page.js";
import { UI_PRESETS, VISA_LABELS, activeFilters, viewLabel } from "../public/modules/rank-controls.js";

const rows = async (db, sql, args = []) =>
  (
    await db
      .prepare(sql)
      .bind(...args)
      .all()
  ).results;
const rankingCache = new Map();
// Public catalog only. Never cache private preview data or model/user state.
// Tools in one run repeatedly use the same 348-city catalog; coalesce those
// reads, and return independent copies so one request cannot alter another.
export async function loadRankings(env) {
  if(env.PREVIEW!=='false'||!env.RELEASE_ID||!env.SITE_ORIGIN)return readRankings(env);
  const key=env.SITE_ORIGIN+'|'+env.RELEASE_ID;let entry=rankingCache.get(key);
  if(!entry||entry.expires<=Date.now()){
    const promise=readRankings(env);entry={promise,expires:Date.now()+300000};rankingCache.set(key,entry);
    if(rankingCache.size>8)rankingCache.delete(rankingCache.keys().next().value);
    promise.catch(()=>{if(rankingCache.get(key)?.promise===promise)rankingCache.delete(key);});
  }
  return structuredClone(await entry.promise);
}
async function readRankings(env) {
  const where =
    env.PREVIEW === "false" ? "WHERE c.publication_status='published'" : "";
  const [base, months, climate] = await Promise.all([
    rows(
      env.DB,
      `SELECT c.id,c.slug,c.name_zh,c.name_en,c.country_id,c.region,c.budget_amount,c.budget_basis,c.photo_url,c.summary,k.name_zh country_name,k.iso2,s.safety,s.cost,s.climate,s.life,s.internet,s.community,s.original_metric_score,s.why_short,e.entry_type,e.label entry_label,e.detail entry_detail,l.latitude,l.longitude,l.timezone FROM cities c JOIN countries k ON k.id=c.country_id LEFT JOIN city_scores s ON s.city_id=c.id LEFT JOIN city_entry_conditions e ON e.city_id=c.id AND e.passport='CN' LEFT JOIN city_locations l ON l.city_id=c.id ${where}`,
    ),
    rows(
      env.DB,
      `SELECT m.city_id,m.month,m.suitability FROM city_months m JOIN cities c ON c.id=m.city_id ${where}`,
    ),
    rows(
      env.DB,
      `SELECT m.city_id,m.month,m.mean_c,m.high_c,m.rain_mm FROM city_climate_months m JOIN cities c ON c.id=m.city_id ${where}`,
    ),
  ]);
  const monthly = new Map(),
    weather = new Map();
  for (const m of months) {
    if (!monthly.has(m.city_id)) monthly.set(m.city_id, []);
    monthly.get(m.city_id).push(m);
  }
  for (const m of climate) weather.set(m.city_id + ":" + m.month, m);
  return base.map((c) => ({
    slug: c.slug,
    name: c.name_zh,
    nameEn: c.name_en,
    country: c.country_name,
    countryCode: c.iso2,
    region: c.region,
    budget: c.budget_amount,
    budgetBasis: c.budget_basis,
    photo: c.photo_url,
    why: c.why_short || c.summary,
    baseScore: c.original_metric_score,
    scores: Object.fromEntries(KEYS.map((k) => [k, c[k] ?? null])),
    visa: {
      code: c.entry_type || "unknown",
      label: c.entry_label || "待核验",
      detail: c.entry_detail || "资料待补",
    },
    lat: c.latitude,
    lon: c.longitude,
    timeZone: c.timezone,
    months: Array.from({ length: 12 }, (_, i) => {
      const m = monthly.get(c.id)?.find((x) => x.month === i + 1);
      const t = weather.get(c.id + ":" + (i + 1));
      return {
        month: i + 1,
        status: m?.suitability || "unknown",
        meanC: t?.mean_c ?? null,
        highC: t?.high_c ?? null,
        rainMm: t?.rain_mm ?? null,
      };
    }),
  }));
}
const icon = (name) => {
  const paths = { plus: '<path d="M10 4v12M4 10h12"/>', close:'<path d="m5 5 10 10M15 5 5 15"/>', search:'<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>', sliders:'<path d="M3 6h14M3 14h14"/><circle cx="7" cy="6" r="2"/><circle cx="13" cy="14" r="2"/>', share:'<path d="M10 13V3m-4 4 4-4 4 4M4 11v6h12v-6"/>', map:'<path d="m3 5 5-2 4 2 5-2v12l-5 2-4-2-5 2V5Zm5-2v12m4-10v12"/>', command:'<path d="M7 7V4a2 2 0 1 0-2 2h9a2 2 0 1 0-2-2v12a2 2 0 1 0 2-2H5a2 2 0 1 0 2 2V7Z"/>', assistant:'<path d="M4 4h12v9H9l-5 4V4Z"/><path d="M7 8h6"/>', minus:'<path d="M4 10h12"/>', undo:'<path d="m7 4-4 4 4 4M3 8h8a5 5 0 0 1 0 10"/>' };
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
};
export async function rankingPage(env, url) {
  return rankingPageFromData(await loadRankings(env), url);
}
// The live database and public outage snapshot render the same URL state.
export function rankingPageFromData(data, url) {
  const state = parseState(url), ranked = rankCities(data, state), visible = ranked.slice(0, state.limit);
  const filters = activeFilters(state);
  const selectedPreset = preset => KEYS.every(key => state.weights[key] === preset.weights[key]) && (!preset.month || state.month === preset.month) && (preset.warm ? state.warm && !state.visa : !state.warm) && (preset.visa ? state.visa === preset.visa : !state.visa);
  const option = (value,label,current) => `<option value="${esc(value ?? '')}"${String(value ?? '') === String(current ?? '') ? ' selected' : ''}>${label}</option>`;
  const slider = key => `<label class="weight-control" for="weight-${key}"><span><span>${LABELS[key]}</span><output aria-live="off" for="weight-${key}" id="output-${key}">${state.weights[key]}</output></span><input id="weight-${key}" type="range" min="0" max="100" step="0.25" value="${state.weights[key]}" data-weight="${key}" aria-label="${LABELS[key]}权重"></label>`;
  const body = `<link rel="stylesheet" href="/ranking-controls.css"><div id="ranking-root" class="rank-app">
  <section class="ranking-toolbar" aria-label="城市排行与搜索"><h1>最佳数字游民城市</h1><div class="rank-toolbar-actions"><form id="ranking-search-form" action="${url.pathname}" method="get" role="search"><label class="sr-only" for="rank-search">搜索城市或国家</label>${icon('search')}<input id="rank-search" name="q" type="search" autocomplete="off" placeholder="搜索城市或国家" value="${esc(state.q)}"><kbd aria-hidden="true">/</kbd><button class="sr-only" type="submit">搜索</button></form><button type="button" class="rank-icon-button" id="open-command" aria-label="搜索城市或更改视角，快捷键 Command K" title="搜索与命令 · ⌘K">${icon('command')}</button><button type="button" class="rank-pill agent-launch" data-open-agent aria-controls="nomad-agent" aria-expanded="false" aria-label="打开选城助手">${icon('assistant')}<span>选城助手</span></button><button id="share-ranking" type="button" class="rank-icon-button" aria-label="分享当前视角" title="分享当前视角">${icon('share')}</button><button id="toggle-map" type="button" class="rank-icon-button" aria-expanded="false" aria-controls="ranking-map-panel" aria-label="显示地图" title="显示地图">${icon('map')}</button></div></section>
  <div class="ranking-view-line"><span>按</span><button type="button" id="view-sort" data-open-weights class="rank-inline-button">${esc(viewLabel(state))}</button><span>排序</span><span class="view-separator" aria-hidden="true">·</span><p id="ranking-result-count" role="status" aria-live="polite">${ranked.length} 座城市</p><div class="rank-view-recovery"><button type="button" id="undo-ranking" class="rank-text-button" hidden>${icon('undo')}撤销</button><button type="button" id="reset-ranking" class="rank-text-button"${stateParams({...state,limit:40}).toString() ? '' : ' hidden'}>重置</button></div></div>
  <p class="rank-season-note" id="rank-season-note"${state.season === SEASONAL_VIEW.id ? '' : ' hidden'}>${esc(SEASONAL_VIEW.note)} <a href="${esc(SEASONAL_VIEW.methodology)}" target="_blank" rel="noopener noreferrer">本期依据 ↗</a></p><div class="rank-controls-line"><div class="rank-preset-viewport"><div class="preset-row" aria-label="预设视角">${Object.entries(UI_PRESETS).map(([key,p]) => `<button type="button" data-preset="${key}" class="preset-chip${selectedPreset(p) ? ' selected' : ''}" aria-pressed="${selectedPreset(p)}"${p.note ? ` title="${esc(p.note)}"` : ''}>${p.label}</button>`).join('')}</div></div><button type="button" id="toggle-filters" class="rank-pill" aria-expanded="false" aria-controls="rank-filter-popover">${icon('plus')}<span>筛选</span></button><button type="button" id="weights-toggle" data-open-weights class="rank-icon-button" aria-expanded="false" aria-controls="weights-dialog" aria-label="微调排名权重" title="微调权重">${icon('sliders')}</button></div>
  <div id="active-ranking-filters" class="rank-active-filters" aria-label="已启用的筛选条件"${filters.length ? '' : ' hidden'}>${filters.map(filter => `<button type="button" class="rank-pill" data-remove-filter="${esc(filter.key)}" aria-label="移除筛选：${esc(filter.label)}">${esc(filter.label)}${icon('close')}</button>`).join('')}</div>
  <div id="rank-filter-popover" class="rank-filter-popover" role="dialog" aria-label="筛选城市" hidden><div class="rank-popover-heading"><strong>筛选城市</strong><button type="button" data-close-filters class="rank-icon-button" aria-label="关闭筛选">${icon('close')}</button></div><div class="rank-filter-fields"><label>地区<select data-filter-input="region" id="filter-region">${option('','所有地区',state.region)}${['亚洲','欧洲','美洲','非洲','大洋洲'].map(r => option(r,r,state.region)).join('')}</select></label><label>每月参考预算<select data-filter-input="budget" id="filter-budget">${option(null,'不限预算',state.budget)}${[500,750,1000,1500,2000,3000].map(v => option(v,'≤ $'+v.toLocaleString('en-US'),state.budget)).join('')}${state.budget && ![500,750,1000,1500,2000,3000].includes(state.budget) ? option(state.budget,'≤ $'+state.budget.toLocaleString('en-US'),state.budget) : ''}</select></label><label>出发月份<select data-filter-input="month" id="filter-month">${option(null,'全年',state.month)}${Array.from({length:12},(_,i) => option(i+1,i+1+'月',state.month)).join('')}</select></label><label>大陆护照入境<select data-filter-input="visa" id="filter-visa">${option('','不限方式',state.visa)}${Object.entries(VISA_LABELS).map(([v,l]) => option(v,l,state.visa)).join('')}</select></label></div><label class="rank-incomplete-toggle"><input id="include-incomplete" type="checkbox"${state.incomplete ? ' checked' : ''}> 包含指标待补的城市</label><p class="rank-filter-note">预算是参考基准，签证为原资料；订房与出发前请核验。</p><div class="rank-popover-footer"><button type="button" id="clear-filters" class="rank-text-button">清除筛选</button><button type="button" data-close-filters class="rank-pill rank-solid">查看结果</button></div></div>
  <dialog id="weights-dialog" class="rank-weights-dialog" aria-labelledby="weights-title"><div class="rank-dialog-heading"><div><p class="rank-eyebrow">你的排名视角</p><h2 id="weights-title">更看重什么？</h2></div><button type="button" data-close-weights class="rank-icon-button" aria-label="关闭权重微调">${icon('close')}</button></div><p class="rank-dialog-intro">拖动滑块，看看城市如何换位。</p><section id="weights-preview" class="rank-weights-preview" aria-label="按当前权重排列的前三座城市"><p>当前前三 <span>随权重变化</span></p><ol></ol></section><div class="rank-weights-scroll"><div id="weights-controls" class="weight-grid">${KEYS.map(slider).join('')}</div><div class="rank-weight-feedback"><output id="weights-result">${ranked.length} 座城市</output><span>按当前权重实时排序</span></div><details class="ranking-method"><summary>分数与数据说明</summary><p>默认保留原 Metric Score：安全31.25%、成本25%、环境18.75%、生活18.75%、网络6.25%，社区另加最多0.5分。省钱、网速、安全预设将主指标设为80%（其余共20%）；签证友好先按免签标签筛选，再按综合分排序。自定义权重按相对比例计算，保留0–10.5范围。</p><p>自定义排序的花费从历史月参考金额连续换算：$300为10分，每翻倍减2.5分，限0–10。不是现价或最低消费；缺金额不推算便宜。气候环境为原环境分，含污染；网络是旧评分，不是 Mbps。缺失项不补零，签证不参与评分。</p><a href="/about/">查看方法与来源</a></details></div><div class="rank-dialog-footer"><button type="button" id="reset-weights" class="rank-text-button">恢复默认权重</button><button type="button" data-close-weights class="rank-pill rank-solid">完成</button></div></dialog>
  <dialog id="rank-command" class="rank-command-dialog" aria-label="搜索城市与命令"><div class="rank-command-input">${icon('search')}<label class="sr-only" for="command-search">搜索城市或更改视角</label><input id="command-search" type="search" autocomplete="off" placeholder="城市、国家，或试试“签证”" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="command-results"><button type="button" data-close-command class="rank-icon-button" aria-label="关闭命令面板">${icon('close')}</button></div><div id="command-results" role="listbox" aria-label="搜索结果与命令"></div><p id="command-result-status" class="sr-only" role="status" aria-live="polite"></p><div class="rank-command-footer"><span>↑ ↓ 选择 · Enter 确认</span><span>Esc 关闭</span></div></dialog>
  <div class="ranking-body"><section class="ranking-list-panel" aria-label="城市排行榜" data-empty="${!ranked.length}"><div class="ranking-columns" aria-hidden="true"><span>名次</span><span></span><span>城市 / 为什么好</span><span>月花费</span><span>安全 /10</span><span>${displayMonth(state)}月均温</span><span>网络 /10</span><span>推荐月份</span><span>大陆护照</span><span>${isDefault(state.weights) ? '指标分' : '自定义分'}</span><span></span></div><div id="ranking-list">${visible.map(c => renderRow(c,state)).join('')}</div><div id="ranking-empty" class="ranking-empty"${ranked.length ? ' hidden' : ''}><h2>换一个条件，看看更多可能</h2><p>暂时没有符合全部条件的城市。先去掉一个筛选，或包含资料待补的城市。</p><button type="button" class="rank-pill rank-solid" data-reset-all>清除条件并恢复默认</button></div><a id="show-more-cities" class="load-more" href="${url.pathname}?${esc(stateParams({...state,limit:Math.min(360,state.limit+40)}).toString())}"${ranked.length > state.limit ? '' : ' hidden'}>再显示 40 座城市</a><div class="rank-data-notes"><details class="month-key"><summary>如何读月份带</summary><div class="month-key-panel"><p><i class="key-recommended"></i>绿色为原推荐月份，深灰为需留意，浅灰为未判定。</p><p>条高表示历史月均温。<i class="key-missing"></i>空心虚线表示气温待补，不代表全年同温。</p></div></details><a href="/about/">数据与口径</a><p class="ranking-footnote">月花费为历史参考；月份带结合原推荐标签与2023–2025历史均温。* 签证资料待复核。</p></div></section>
  <dialog id="ranking-map-panel" class="map-panel" aria-label="与排行联动的地图"><div class="map-heading"><strong>城市分布</strong><span id="map-count">正在加载地图</span><button type="button" data-close-map class="rank-icon-button" aria-label="关闭地图">${icon('close')}</button></div><div id="map-stage" class="map-stage" aria-busy="true"><div class="map-skeleton" role="status"><span>正在载入城市地图…</span></div></div><div class="map-controls"><button type="button" id="map-zoom-in" aria-label="放大地图">${icon('plus')}</button><button type="button" id="map-zoom-out" aria-label="缩小地图">${icon('minus')}</button><button type="button" id="map-reset" aria-label="复位地图">复位</button></div><div id="map-selection" class="map-selection"><span>选择一座城市</span><p>悬停列表或点选地图，查看同一个地方。</p></div><p class="map-attribution">Natural Earth · GeoNames <span>位置与温度均保留来源</span></p></dialog></div>
  <noscript><p class="notice">当前显示服务端排行。开启 JavaScript 可调整排名与使用地图；城市详情与对比仍可直接访问。</p></noscript></div><script id="ranking-data" type="application/json">${JSON.stringify(packRankingData(data)).replace(/</g,'\\u003c')}</script>`;
  return { title:'最佳数字游民城市排行榜', description:'按安全、预算、气候环境、生活、网络与社区调整权重，实时比较全球数字游民城市。',path:'/',active:'cities',indexable:!url.search,body };
}

export async function rankedComparison(env, key, url) {
  const slugs = key.split("-vs-");
  if (slugs.length !== 2 || slugs[0] === slugs[1]) return null;
  const canonical = [...slugs].sort().join("-vs-");
  if (canonical !== key) return { redirect: "/compare/" + canonical + "/" + (url?.search || "") };
  const data = await loadRankings(env);
  const a = data.find((c) => c.slug === slugs[0]),
    b = data.find((c) => c.slug === slugs[1]);
  if (!a || !b) return null;
  const credits = await rows(env.DB, 'SELECT slug,photo_credit,photo_source FROM cities WHERE slug IN (?,?)', [a.slug,b.slug]);
  for (const city of [a,b]) { const credit=credits.find(row=>row.slug===city.slug);city.photoCredit=credit?.photo_credit;city.photoSource=credit?.photo_source; }
  const requestedMonth = Number(url?.searchParams.get('month'));
  const month = Number.isInteger(requestedMonth)&&requestedMonth>=1&&requestedMonth<=12 ? requestedMonth : displayMonth({});
  const body = comparisonBody(a, b, month);
  const editorial = await env.DB.prepare(
    "SELECT status FROM editorial_pages WHERE kind='comparison' AND slug=?",
  )
    .bind(key)
    .first();
  return {
    title: a.name + " vs " + b.name + "：数字游民逐项对比",
    description: comparisonFit(a, b) + " " + comparisonFit(b, a),
    path: "/compare/" + key + "/",
    active: "compare",
    body,
    indexable: editorial?.status === "published",
  };
}
