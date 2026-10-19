import {esc} from './ranking.js';
import {travelAdvisory} from './recommendation-policy.js';
import {sitePath,mountMarkup} from './site-path.js';

export const countryHref = code => /^(?:[A-Z]{2}|legacy:[a-z-]+)$/.test(code) ? sitePath(`/countries/${encodeURIComponent(code.toLowerCase())}/`) : null;

export function countryGroups(countries, catalog, visible) {
  const groups = new Map(countries.map(country => [country.code,{...country,cities:[],visible:[]}]));
  const ranked = new Map(visible.map(city => [city.slug,city]));
  for (const city of catalog) {
    const group = groups.get(city.countryId || city.countryCode);
    if (!group) continue;
    group.cities.push(ranked.get(city.slug) || city);
    if (ranked.has(city.slug)) group.visible.push(ranked.get(city.slug));
  }
  for (const group of groups.values()) {
    group.cities.sort((a,b)=>(ranked.has(b.slug)-ranked.has(a.slug)) || (a.rank ?? Infinity)-(b.rank ?? Infinity) || a.name.localeCompare(b.name,'zh-CN'));
    group.visible.sort((a,b)=>(a.rank ?? Infinity)-(b.rank ?? Infinity));
  }
  return groups;
}

export function renderCountryPreview(country, activeSlug) {
  const visible = new Set(country.visible.map(city=>city.slug));
  return mountMarkup(`<div class="map-country-intro"><div class="map-selection-title"><strong>${esc(country.name)}</strong><span>已收录 ${country.cities.length} 城</span></div><p>${esc(country.nameEn)}</p><a class="map-country-open" href="${countryHref(country.code)}">进入${esc(country.name)}栏目 <span aria-hidden="true">↗</span></a></div><div class="map-country-cities"><div class="map-city-list-heading">${country.visible.length ? `本次筛选 ${country.visible.length} 城` : '当前筛选没有匹配城市'}</div>${country.cities.length ? `<ul>${country.cities.map(city=>{
    const advisory=travelAdvisory(city), included=visible.has(city.slug), located=Number.isFinite(city.lat)&&Number.isFinite(city.lon);
    const status=advisory ? '暂勿前往 · 历史资料' : included ? city.rank ? `#${city.rank}` : '评分待补' : '本次筛选外';
    return `<li${city.slug===activeSlug ? ' class="is-active"' : ''}><a href="/cities/${encodeURIComponent(city.slug)}/"><span>${esc(city.name)}${!located ? '<small>位置待补</small>' : ''}</span><small>${status}</small></a>${included ? `<button type="button" data-map-locate="${esc(city.slug)}" aria-label="在排行中定位${esc(city.name)}" title="在排行中定位">⌖</button>` : ''}</li>`;
  }).join('')}</ul>` : '<p>城市资料待补充，可先查看国家背景。</p>'}</div>`);
}
