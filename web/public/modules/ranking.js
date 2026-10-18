import { cityMatchesQuery } from "./country-search.js";
import {recommendationEligible} from './recommendation-policy.js';
// A dated editorial view; the underlying historical scores remain unchanged.
export const SEASONAL_VIEW = {
  id: '2026-10', month: 10, label: '10月出发建议', reviewedAt: '2026-10-18',
  excludedCountries: ['JP'],
  note: '本期另按赴日提醒及通行条件筛选；暂勿前往范围始终排除。大陆普通护照参考，非全目录风险审查。',
  methodology: 'https://github.com/cubxxw/RemoteAI-Nomads/blob/main/guides/seasonal-2026-10.md',
};
export const KEYS = [
  "safety",
  "cost",
  "climate",
  "life",
  "internet",
  "community",
];
const monthFormatter = new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Singapore',month:'numeric'});
export const currentMonth = (date = new Date()) => Number(monthFormatter.format(date));
export const displayMonth = (state) => state.month || currentMonth();
export const LABELS = {
  safety: "安全",
  cost: "花费",
  climate: "气候环境",
  life: "生活",
  internet: "网络",
  community: "社区",
};
export const DEFAULT_WEIGHTS = {
  safety: 31.25,
  cost: 25,
  climate: 18.75,
  life: 18.75,
  internet: 6.25,
  community: 5,
};
export const PRESETS = {
  default: { label: "Metric Score", weights: DEFAULT_WEIGHTS },
  budget: {
    label: "省钱优先",
    weights: {
      safety: 25,
      cost: 50,
      climate: 8,
      life: 10,
      internet: 5,
      community: 2,
    },
  },
  internet: {label:'网速优先',weights:{safety:25,cost:10,climate:5,life:8,internet:50,community:2}},
  winter: {
    label: "冬天避寒",
    weights: {
      safety: 20,
      cost: 20,
      climate: 40,
      life: 10,
      internet: 10,
      community: 5,
    },
    month: 1,
    warm: true,
  },
  safe: {
    label: "安全第一",
    weights: {
      safety: 50,
      cost: 10,
      climate: 12,
      life: 15,
      internet: 10,
      community: 3,
    },
  },
  visa: { label: "大陆护照免签", weights: DEFAULT_WEIGHTS, visa: "visa_free" },
};
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export function validWeights(input) {
  const w = {};
  for (const key of KEYS) {
    const n = Number(input?.[key]);
    w[key] = Number.isFinite(n)
      ? Math.round(clamp(n, 0, 100) * 4) / 4
      : DEFAULT_WEIGHTS[key];
  }
  return KEYS.some((k) => w[k] > 0) ? w : { ...DEFAULT_WEIGHTS };
}
export const isDefault = (w) => KEYS.every((k) => w[k] === DEFAULT_WEIGHTS[k]);
// Upgrade the three formerly published presets in saved views and old links.
// Other user-defined weights remain explicit choices; advisories still apply.
const legacyPresetKeys={'5,80,5,5,4,1':'budget','5,5,4,5,80,1':'internet','80,5,5,5,4,1':'safe'};
export function parseState(url) {
  const p = url.searchParams;
  const preset = Object.hasOwn(PRESETS, p.get('preset')) ? PRESETS[p.get('preset')] : PRESETS.default;
  const parts = p.get("w")?.split(",");
  const raw =
    parts?.length === 6
      ? Object.fromEntries(KEYS.map((k, i) => [k, parts[i]]))
      : preset.weights;
  const weights=validWeights(raw), presetKey=legacyPresetKeys[KEYS.map(key=>weights[key]).join(',')];
  const m = Number(p.has('month') ? p.get('month') : preset.month),
    b = Number(p.get("budget")),
    lim = Number(p.get("limit"));
  return {
    weights: {...(PRESETS[presetKey]?.weights || weights)},
    q: (p.get("q") || "").normalize("NFKC").trim().slice(0, 100),
    region: ["亚洲", "欧洲", "非洲", "美洲", "大洋洲"].includes(p.get("region"))
      ? p.get("region")
      : "",
    country: /^[A-Z]{2}$/.test((p.get('country') || '').toUpperCase()) ? p.get('country').toUpperCase() : '',
    abroad: p.get('abroad') === '1',
    budget: Number.isFinite(b) && b > 0 && b <= 100000 ? Math.round(b) : null,
    month: Number.isInteger(m) && m > 0 && m < 13 ? m : null,
    visa: !p.has('visa') ? preset.visa || '' : [
      "visa_free",
      "evisa",
      "arrival",
      "visa_required",
      "domestic",
      "permit",
    ].includes(p.get("visa"))
      ? p.get("visa")
      : "",
    season: p.get("season") === SEASONAL_VIEW.id && m === SEASONAL_VIEW.month ? SEASONAL_VIEW.id : "",
    warm: p.has('warm') ? p.get('warm') === '1' : !!preset.warm,
    incomplete: p.get("incomplete") === "1",
    limit: [40, 80, 120, 160, 200, 240, 280, 320, 360].includes(lim) ? lim : 40,
  };
}
export function stateParams(s) {
  const p = new URLSearchParams();
  if (s.q) p.set("q", s.q);
  if (s.region) p.set("region", s.region);
  if (s.country) p.set('country', s.country);
  if (s.abroad) p.set('abroad', '1');
  if (s.month) p.set("month", String(s.month));
  if (s.season === SEASONAL_VIEW.id && s.month === SEASONAL_VIEW.month) p.set("season", s.season);
  if (s.budget) p.set("budget", String(s.budget));
  if (s.visa) p.set("visa", s.visa);
  if (s.warm) p.set("warm", "1");
  if (s.incomplete) p.set("incomplete", "1");
  if (!isDefault(s.weights))
    p.set("w", KEYS.map((k) => s.weights[k]).join(","));
  if (s.limit > 40) p.set("limit", String(s.limit));
  return p;
}
// A continuous editorial normalization of the same dated monthly USD reference.
// $300 => 10, $600 => 7.5, $1,200 => 5, $2,400 => 2.5; not a market quote or floor.
export function referenceCostScore(amount) {
  return typeof amount === 'number' && Number.isFinite(amount) && amount > 0
    ? clamp(10 - 2.5 * Math.log2(amount / 300), 0, 10) : null;
}
function scoreValue(city, weights) {
  const active = KEYS.filter((k) => weights[k] > 0);
  if (!active.length) return null;
  const values = { ...city.scores };
  // Preserve the imported Metric Score exactly. Personalized views use the amount
  // rather than a coarse historical cost category that tied $450 and $1,000 cities.
  if (!isDefault(weights) && weights.cost > 0) values.cost = referenceCostScore(city.budget);
  if (
    active.some(
      (k) =>
        values[k] === null ||
        values[k] === undefined ||
        !Number.isFinite(values[k]),
    )
  )
    return null;
  if (isDefault(weights) && Number.isFinite(city.baseScore))
    return city.baseScore;
  const sum = active.reduce((n, k) => n + weights[k], 0);
  return active.reduce((n, k) => n + weights[k] * values[k], 0) / sum * 1.05;
}
export function customScore(city, weights) {
  const value = scoreValue(city, weights);
  return value === null ? null : Math.round(value * 10) / 10;
}
export function rankCities(cities, state) {
  const query = state.q.normalize("NFKC").trim().toLocaleLowerCase();
  const result = [], preciseScores = new Map();
  for (const city of cities) {
    if (!recommendationEligible(city)) continue;
    if (
      query &&
      !cityMatchesQuery(city, query)
    )
      continue;
    if (state.region && city.region !== state.region) continue;
    if (state.country && city.countryCode !== state.country) continue;
    if (state.abroad && (!city.countryCode || ['CN','HK','MO','TW'].includes(city.countryCode))) continue;
    if (state.season === SEASONAL_VIEW.id && state.month === SEASONAL_VIEW.month && (SEASONAL_VIEW.excludedCountries.includes(city.countryCode) || city.visa.code === "unavailable")) continue;
    if (state.budget && (city.budget === null || city.budget > state.budget))
      continue;
    if (state.visa && city.visa.code !== state.visa) continue;
    if (state.month && city.months[state.month - 1]?.status !== "recommended")
      continue;
    if (state.warm) {
      const t = city.months[(state.month || 1) - 1]?.meanC;
      if (t === null || t === undefined || t < 18 || t > 28) continue;
    }
    const precise = scoreValue(city, state.weights);
    const score = precise === null ? null : Math.round(precise * 10) / 10;
    if (score === null && !state.incomplete) continue;
    preciseScores.set(city.slug, precise);
    result.push({ ...city, score });
  }
  result.sort(
    (a, b) =>
      (preciseScores.get(b.slug) ?? -1) - (preciseScores.get(a.slug) ?? -1) ||
      (state.weights.cost > Math.max(...KEYS.filter(key => key !== 'cost').map(key => state.weights[key])) ? (a.budget ?? Infinity) - (b.budget ?? Infinity) : 0) ||
      (b.baseScore ?? -1) - (a.baseScore ?? -1) ||
      a.slug.localeCompare(b.slug, "en"),
  );
  return result.map((c, i) => ({
    ...c,
    rank: c.score === null ? null : i + 1,
  }));
}
export const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const flag = (code) =>
  /^[A-Z]{2}$/.test(code || "")
    ? String.fromCodePoint(...[...code].map((x) => 127397 + x.charCodeAt(0)))
    : "";
export const money = (v) =>
  v === null ? "—" : "$" + Math.round(v).toLocaleString("en-US");
export function monthBand(city, selected = null) {
  const pieces = city.months.map((m) => {
    const height =
      m.meanC === null || m.meanC === undefined
        ? 8
        : Math.max(4, Math.min(22, (m.meanC + 10) / 2));
    const label =
      m.status === "recommended"
        ? "有推荐记录"
        : m.status === "caution"
          ? "季节需留意"
          : "未判定";
    const temp =
      m.meanC === null || m.meanC === undefined
        ? " · 历史均温待补"
        : " · 历史均温 " + m.meanC.toFixed(1) + "°C";
    return `<span aria-hidden="true" class="month-mark ${m.status}${m.meanC === null || m.meanC === undefined ? " missing-temperature" : ""}${selected === m.month ? " chosen" : ""}" title="${m.month} 月 · ${label}${temp}"><span>${m.month}</span><svg viewBox="0 0 5 22" aria-hidden="true"><rect x="0" y="${22 - height}" width="5" height="${height}" rx="1"/></svg></span>`;
  });
  return `<span class="month-band" role="img" aria-label="推荐月份：${
    city.months
      .filter((m) => m.status === "recommended")
      .map((m) => m.month)
      .join("、") || "待补录"
  }；颜色为原推荐标签，条高为历史均温，空心虚线为均温待补">${pieces.join("")}</span>`;
}
export function renderRow(c, state) {
  const month = displayMonth(state);
  const mean = c.months[month - 1]?.meanC;
  const n = (v) => (v === null || v === undefined ? "—" : Number(v).toFixed(1));
  const bar = (v) =>
    `<svg class="micro-bar" viewBox="0 0 40 3" aria-hidden="true"><rect width="40" height="3" class="bar-track"/><rect width="${v === null || v === undefined ? 0 : Math.min(40, v * 4)}" height="3" class="bar-value"/></svg>`;
  return `<article class="ranking-row" data-city="${esc(c.slug)}" data-score="${c.score ?? ""}" aria-label="${c.rank ? "第" + c.rank + "名，" : ""}${esc(c.name)}" tabindex="-1">
 <span class="rank-number" role="img" aria-label="${c.rank ? "第" + c.rank + "名" : "资料待补"}"><span class="rank-digit" aria-hidden="true">${c.rank ?? "—"}</span></span>
 <a class="rank-photo" href="/cities/${esc(c.slug)}/" tabindex="-1" aria-hidden="true">${c.photo ? `<img src="${esc(c.photo.endsWith(".webp") ? c.photo.replace(".webp", ".thumb.webp") : c.photo)}" alt="" width="48" height="48" loading="lazy">` : `<span>${esc(c.name.slice(0, 1))}</span>`}</a>
 <div class="rank-identity"><a class="rank-city-link" href="/cities/${esc(c.slug)}/"><strong>${esc(c.name)}</strong></a><span class="rank-english"><span class="rank-city-name-en">${esc(c.nameEn)}</span><span class="rank-country-separator" aria-hidden="true">·</span><a class="rank-country-link" href="/countries/${esc(c.countryCode.toLowerCase())}/" aria-label="查看${esc(c.country)}的城市"><span class="country-flag" role="img" aria-label="${esc(c.country)}旗帜">${["TW", "XK"].includes(c.countryCode) ? `<img src="/flags/${c.countryCode.toLowerCase()}.svg" alt="" width="16" height="12">` : flag(c.countryCode)}</span><span>${esc(c.country)}</span></a></span><p title="${esc(c.why)}">${esc(c.why)}</p><span class="mobile-visa" title="${esc(c.visa.detail)}">${esc(c.visa.label)} · 旧资料</span></div>
 <div class="rank-metric cost-cell"><span class="metric-mobile-label">月花费</span><strong title="历史估算；${esc(c.budgetBasis)}">${c.budget === null ? "—" : "≈" + money(c.budget)}</strong><small>USD / 月</small></div>
 <div class="rank-metric safety-cell"><span class="metric-mobile-label">安全</span><strong>${n(c.scores.safety)}</strong>${bar(c.scores.safety)}</div>
 <div class="rank-metric climate-cell"><span class="metric-mobile-label">${month} 月均温</span><strong title="2023–2025 ERA5 历史均温；非天气预报">${mean === null || mean === undefined ? "—" : Math.round(mean) + "°"}</strong><small>${month} 月均温</small></div>
 <div class="rank-metric internet-cell"><span class="metric-mobile-label">网络</span><strong title="旧资料网络评分；不是房间实测 Mbps">${n(c.scores.internet)}</strong>${bar(c.scores.internet)}</div>
 <div class="rank-season">${monthBand(c, state.month)}</div>
 <span class="rank-visa" title="${esc(c.visa.detail)}">${esc(c.visa.label)}<span class="legacy-indicator" aria-label="原资料待复核">*</span></span>
 <div class="rank-score"><strong>${c.score === null ? "—" : c.score.toFixed(1)}</strong><small>${c.score === null ? "资料待补" : isDefault(state.weights) ? "指标分" : "自定义分"}</small></div>
 <button class="rank-compare" data-compare="${esc(c.slug)}" data-name="${esc(c.name)}" aria-label="对比${esc(c.name)}" aria-pressed="false"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg></button>
 </article>`;
}
export function advantages(a, b) {
  return KEYS.filter(
    (k) =>
      a.scores[k] !== null && b.scores[k] !== null && a.scores[k] > b.scores[k],
  )
    .sort((x, y) => a.scores[y] - b.scores[y] - (a.scores[x] - b.scores[x]))
    .slice(0, 2)
    .map((k) => LABELS[k]);
}

// A compact transport for twelve months; the public API keeps descriptive field names.
export function packRankingData(cities) {
  return cities.map((c) => ({
    ...c,
    months: c.months.map((m) => [
      m.status === "recommended" ? 1 : m.status === "caution" ? -1 : 0,
      m.meanC,
      m.highC,
      m.rainMm,
    ]),
  }));
}
export function unpackRankingData(cities) {
  return cities.map((c) => ({
    ...c,
    months: c.months.map((m, i) =>
      Array.isArray(m)
        ? {
            month: i + 1,
            status:
              m[0] === 1 ? "recommended" : m[0] === -1 ? "caution" : "unknown",
            meanC: m[1],
            highC: m[2],
            rainMm: m[3],
          }
        : m,
    ),
  }));
}
