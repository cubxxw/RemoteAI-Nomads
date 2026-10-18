import { cityMatchesQuery } from "./country-search.js";
import { DEFAULT_WEIGHTS, KEYS, LABELS, PRESETS, parseState, stateParams } from './ranking.js';

export const PREFERENCE_KEY = 'nomads-ranking-view-v1';
export const UI_PRESETS = {
  default: { ...PRESETS.default, label: '综合推荐' },
  budget: PRESETS.budget,
  internet: { label: '网速优先', weights: { safety: 20, cost: 15, climate: 10, life: 15, internet: 55, community: 5 } },
  visa: { ...PRESETS.visa, label: '签证友好', note: '大陆护照免签 · 原资料待核验' },
  winter: PRESETS.winter,
  safe: PRESETS.safe,
};
export const VISA_LABELS = { visa_free: '大陆护照免签', evisa: '电子签', arrival: '落地签', visa_required: '需签证', domestic: '境内', permit: '通行证 / 签注' };
export function viewLabel(state) {
  if (KEYS.every(key => state.weights[key] === DEFAULT_WEIGHTS[key])) return 'Metric Score';
  return [...KEYS].sort((a,b) => state.weights[b] - state.weights[a]).filter(key => state.weights[key] > 0).slice(0,3).map(key => LABELS[key]).join(' · ');
}
export function activeFilters(state) {
  return [
    state.q && { key: 'q', label: '搜索：' + state.q },
    state.region && { key: 'region', label: state.region },
    state.budget && { key: 'budget', label: '月预算 ≤ $' + state.budget.toLocaleString('en-US') },
    state.month && { key: 'month', label: state.month + '月出发' },
    state.visa && { key: 'visa', label: VISA_LABELS[state.visa] || state.visa },
    state.warm && { key: 'warm', label: '历史均温 18–28°C' },
    state.incomplete && { key: 'incomplete', label: '含待补资料' },
  ].filter(Boolean);
}
export function restorePreference(url, storage) {
  const current = parseState(url);
  if (url.search) return current;
  try {
    const stored = JSON.parse(storage.getItem(PREFERENCE_KEY));
    if (stored?.version !== 1 || typeof stored.query !== 'string' || stored.query.length > 2000) return current;
    return parseState(new URL('/?' + stored.query, url.origin));
  } catch { return current; }
}
export function savePreference(state, storage) {
  try {
    const query = stateParams({ ...state, limit: 40 }).toString();
    if (query) storage.setItem(PREFERENCE_KEY, JSON.stringify({ version: 1, query }));
    else storage.removeItem(PREFERENCE_KEY);
    return true;
  } catch { return false; }
}
export function commandItems(data, query = '') {
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
  const actions = [
    ...Object.entries(UI_PRESETS).map(([key,p]) => ({ kind: 'preset', value: key, label: p.label, detail: p.note || '切换排名视角', keywords: key === 'internet' ? '网速 网络 宽带 internet wifi' : key === 'visa' ? '签证 免签 护照 visa' : '' })),
    ...Object.entries(VISA_LABELS).map(([value,label]) => ({ kind: 'filter', key: 'visa', value, label, detail: '签证筛选 · 原资料待核验', keywords: '签证 护照 visa' })),
    ...['亚洲','欧洲','美洲','非洲','大洋洲'].map(value => ({ kind: 'filter', key: 'region', value, label: value, detail: '按地区筛选' })),
    ...Array.from({length:12}, (_,i) => ({ kind:'filter', key:'month', value:i+1, label: i+1+'月出发', detail: '有原推荐记录的城市' })),
    { kind: 'weights', label: '调整排名权重', detail: '安全、花费、气候、生活、网络、社区', keywords: '排序 偏好 权重' },
    { kind: 'reset', label: '重置当前视角', detail: '恢复 Metric Score，清除筛选', keywords:'清除 默认' },
  ];
  const matches = item => !needle || `${item.label} ${item.detail} ${item.keywords || ''}`.normalize('NFKC').toLocaleLowerCase().includes(needle);
  const cities = needle ? data.filter(c => cityMatchesQuery(c, needle)).slice(0,6).map(c => ({kind:'city',value:c.slug,label:c.name,detail:c.nameEn+' · '+c.country,photo:c.photo})) : [];
  const found = [...cities, ...actions.filter(matches)].slice(0,12);
  if (needle) found.push({kind:'search',value:query.trim(),label:'在排行中搜索“'+query.trim()+'”',detail:'按城市或国家名称筛选'});
  return found;
}
