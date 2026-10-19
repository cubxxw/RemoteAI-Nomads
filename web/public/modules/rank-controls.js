import { cityMatchesQuery } from "./country-search.js";
import {readJourneyMonth} from './trip-state.js';
import {referenceBudgetIn,budgetSymbol} from './budget-currency.js';
import { DEFAULT_WEIGHTS, KEYS, LABELS, PRESETS, SEASONAL_VIEW, currentMonth, parseState, stateParams } from './ranking.js';

export const PREFERENCE_KEY = 'nomads-ranking-view-v1';
export const UI_PRESETS = {
  default: { ...PRESETS.default, label: '综合推荐' },
  budget: PRESETS.budget,
  internet: PRESETS.internet,
  visa: { ...PRESETS.visa, label: '签证友好', note: '大陆护照免签 · 原资料待核验' },
  winter: PRESETS.winter,
  safe: PRESETS.safe,
};
export const VISA_LABELS = { visa_free: '大陆护照免签', evisa: '电子签', arrival: '落地签', visa_required: '需签证', domestic: '境内', permit: '通行证 / 签注' };
export function applyRankingFilter(state, key, value) {
  if(key==='recommendedOnly'&&!value)state.season='';
  if(key==='budgetCurrency'){
    if(!['USD','CNY'].includes(value))return;
    if(state.budget&&value!==state.budgetCurrency){
      const converted=value==='CNY'?referenceBudgetIn(state.budget,'CNY'):state.budget/referenceBudgetIn(1,'CNY');
      if(converted>10000000)return;
      state.budget=Math.round(converted*100)/100;
    }
  }
  state[key] = value;
  if (key === 'region' && value) state.country = '';
  if (key === 'month') {
    if (!state.month) {state.warm = false;state.recommendedOnly=false;}
    if (state.month !== SEASONAL_VIEW.month) state.season = '';
  }
}
export function quickFilters(state, date = new Date()) {
  const month = currentMonth(date);
  return [
    {key:'global',label:'全球',selected:!state.region&&!state.country&&!state.abroad},
    {key:'asia',label:'亚洲',selected:state.region==='亚洲'&&!state.country},
    {key:'domestic',label:'国内',selected:state.country==='CN'},
    {key:'abroad',label:'国外',selected:!!state.abroad},
    {key:'month',label:'本月推荐',detail:month+'月',selected:state.month===month&&state.recommendedOnly},
  ];
}
export function toggleQuickFilter(state, key, date = new Date()) {
  const selected=quickFilters(state,date).find(filter=>filter.key===key)?.selected;
  if (key==='global'||key==='asia'||key==='domestic') {
    state.region=key==='asia'&&!selected?'亚洲':'';
    state.country=key==='domestic'&&!selected?'CN':'';
    if(key!=='asia')state.abroad=false;
    // An overseas entry filter cannot describe a domestic trip.
    if (state.country==='CN') state.visa='';
  }
  if(key==='abroad') {
    state.abroad=!selected;
    state.country='';
    if(state.visa==='domestic')state.visa='';
  }
  if (key==='month') {
    applyRankingFilter(state,'month',selected?null:currentMonth(date));
    state.recommendedOnly=!selected;
    state.warm=false;
  }
}
export function viewLabel(state) {
  if (KEYS.every(key => state.weights[key] === DEFAULT_WEIGHTS[key])) return '综合推荐';
  return [...KEYS].sort((a,b) => state.weights[b] - state.weights[a]).filter(key => state.weights[key] > 0).slice(0,3).map(key => LABELS[key]).join(' · ');
}
export function activeFilters(state) {
  return [
    state.q && { key: 'q', label: '搜索：' + state.q },
    state.region && { key: 'region', label: state.region },
    state.country && {key:'country',label:state.country==='CN'?'国内':'国家：'+state.country},
    state.abroad && {key:'abroad',label:'国外'},
    state.budget && { key: 'budget', label: '月参考 ≤ '+budgetSymbol(state.budgetCurrency) + state.budget.toLocaleString('en-US') },
    state.month && !state.season && { key: 'month', label: state.month + '月出发' },
    state.season === SEASONAL_VIEW.id && { key: 'season', label: SEASONAL_VIEW.label },
    state.recommendedOnly&&!state.season&&{key:'recommendedOnly',label:'只看原推荐月份'},
    state.visa && { key: 'visa', label: VISA_LABELS[state.visa] || state.visa },
    state.warm && { key: 'warm', label: '历史均温 18–28°C' },
    state.incomplete && { key: 'incomplete', label: '含待补资料' },
  ].filter(Boolean);
}
export function additionalFilters(state,date=new Date()) {
  return activeFilters(state).filter(filter=>
    !(filter.key==='region'&&state.region==='亚洲'&&!state.country)&&
    !(filter.key==='country'&&state.country==='CN')&&
    filter.key!=='abroad'&&
    !(['month','recommendedOnly'].includes(filter.key)&&state.month===currentMonth(date)&&state.recommendedOnly&&!state.season));
}
export function restorePreference(url, storage) {
  const current = parseState(url);
  if (url.search) return current;
  let restored=current;
  try {
    const stored = JSON.parse(storage.getItem(PREFERENCE_KEY));
    if (stored?.version === 1 && typeof stored.query === 'string' && stored.query.length <= 2000) restored=parseState(new URL('/?' + stored.query, url.origin));
  } catch {}
  const journeyMonth=readJourneyMonth(storage);
  if(journeyMonth)applyRankingFilter(restored,'month',journeyMonth);
  return restored;
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
    ...quickFilters(parseState(new URL('https://nomads.example/'))).map(filter=>({kind:'quick',value:filter.key,label:filter.label,detail:'快捷筛选'+(filter.detail?' · '+filter.detail:''),keywords:filter.key==='domestic'?'中国 境内 国内':filter.key==='abroad'?'境外 海外 国外':''})),
    ...Object.entries(VISA_LABELS).map(([value,label]) => ({ kind: 'filter', key: 'visa', value, label, detail: '签证筛选 · 原资料待核验', keywords: '签证 护照 visa' })),
    ...['亚洲','欧洲','美洲','非洲','大洋洲'].map(value => ({ kind: 'filter', key: 'region', value, label: value, detail: '按地区筛选' })),
    ...Array.from({length:12}, (_,i) => ({ kind:'filter', key:'month', value:i+1, label: i+1+'月出发', detail: '按该月历史气候比较舒适度' })),
    { kind: 'weights', label: '调整排名权重', detail: '安全、花费、月份舒适度、生活、网络、游民氛围', keywords: '排序 偏好 权重' },
    { kind: 'reset', label: '重置当前视角', detail: '恢复默认偏好，清除筛选', keywords:'清除 默认' },
  ];
  const matches = item => !needle || `${item.label} ${item.detail} ${item.keywords || ''}`.normalize('NFKC').toLocaleLowerCase().includes(needle);
  const cities = needle ? data.filter(c => cityMatchesQuery(c, needle)).slice(0,6).map(c => ({kind:'city',value:c.slug,label:c.name,detail:c.nameEn+' · '+c.country,photo:c.photo})) : [];
  const found = [...cities, ...actions.filter(matches)].slice(0,12);
  if (needle) found.push({kind:'search',value:query.trim(),label:'在排行中搜索“'+query.trim()+'”',detail:'按城市或国家名称筛选'});
  return found;
}
