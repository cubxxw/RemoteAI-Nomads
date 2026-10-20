import {personalComparisonMarkup} from './personal-comparison-markup.js';
import {travelAdvisory} from '../public/modules/recommendation-policy.js';
import { esc, external } from './render.js';
import { KEYS, LABELS, comparisonFitText, scoringValues } from '../public/modules/ranking.js';
import {comparableMetric,communitySource} from '../public/modules/places.js';

export function comparisonFit(city, other,month) {
  return comparisonFitText(city,other,month);
}

import { compactMonths } from '../public/modules/months.js';
export { compactMonths } from '../public/modules/months.js';
const printIcon='<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M5 6V2.5h10V6M5 14H3V7h14v7h-2M5 11h10v6.5H5z" stroke-linejoin="round"/><path d="M14 8.5h1"/></svg>';

export function comparisonBody(a, b, month, {embedded=false}={}) {
  const rootTag=embedded?'div':'article',titleTag=embedded?'h3':'h1',cityTag=embedded?'h4':'h2';
  const number = value => value === null || value === undefined ? '—' : Number(value).toFixed(1);
  const metricCell = (title, unit='') => `<th scope="row"><span>${title}</span>${unit?`<small>${unit}</small>`:''}</th>`;
  const row = (key, title, left, right, unit='', lower=false) => {
    const known = [left,right].every(value => value !== null && value !== undefined) && comparableMetric(key,a,b);
    const diff = known ? Math.abs(left - right) : null;
    const winner = known && diff > 0 ? (lower ? left < right : left > right) ? 0 : 1 : -1;
    const cost = key === 'budget';
    const origin=index=>{const city=[a,b][index],source=communitySource(city);return key==='community'?`<a class="comparison-source" href="/cities/${esc(city.slug)}/?month=${month}#places">${esc(source.label)}${source.date?`<small>${esc(source.date)}</small>`:''}</a>`:'';};
    const cell = (value,index) => `<td${winner === index ? ' class="comparison-winner"' : ''}><div class="comparison-value"><strong>${value === null || value === undefined ? '—' : cost ? '≈ $' + Math.round(value).toLocaleString('en-US') : number(value)}</strong>${winner === index ? `<span class="winner-label">${cost ? '低 $' + Math.round(diff).toLocaleString('en-US') : '高 ' + diff.toFixed(1)}</span>` : ''}</div>${origin(index)}</td>`;
    return `<tr data-comparison-metric="${key}"${known&&diff===0?' data-equal="true"':''}>${cell(left,0)}${metricCell(title,unit)}${cell(right,1)}</tr>`;
  };
  const monthCell = (city,index) => {
    const record=city.months[month-1];
    return `<td data-comparison-weather="${index}"><strong>${record?.meanC===null||record?.meanC===undefined?'—':Math.round(record.meanC)+'°C'}</strong><small>${record?.rainMm===null||record?.rainMm===undefined?'降雨待补':'雨量 '+Math.round(record.rainMm)+' mm'}</small></td>`;
  };
  const months = city => compactMonths(city.months.filter(record=>record.status==='recommended').map(record=>record.month));
  const citySide=(city,other,index)=>`<section class="comparison-city comparison-city-${index}" aria-labelledby="comparison-city-${index}"><a class="comparison-city-photo" href="/cities/${esc(city.slug)}/?month=${month}" tabindex="-1" aria-hidden="true">${city.photo?`<img src="${esc(city.photo)}" alt="" width="560" height="420" decoding="async">`:''}</a>${city.photoCredit ? `<span class="comparison-photo-credit">${external(city.photoSource,city.photoCredit)}</span>` : ''}<div class="comparison-city-identity"><${cityTag} id="comparison-city-${index}"><a href="/cities/${esc(city.slug)}/?month=${month}">${esc(city.name)}</a></${cityTag}><p class="comparison-city-english">${esc(city.nameEn)}</p><p class="comparison-city-country">${esc(city.country)}</p></div><p class="comparison-city-fit">${esc(comparisonFit(city,other,month))}${travelAdvisory(city)?` ${external(travelAdvisory(city).url,'官方提醒')}`:''}</p><div class="comparison-city-actions"><a class="comparison-guide" href="/cities/${esc(city.slug)}/?month=${month}">城市指南</a><a class="comparison-change" href="/compare/?${index===0?'b':'a'}=${esc(other.slug)}&amp;month=${month}">更换城市</a></div></section>`;
  const data=JSON.stringify([a,b].map(city=>({slug:city.slug,countryCode:city.countryCode,name:city.name,months:city.months,scores:city.scores,budget:city.budget,communityPlaces:city.communityPlaces}))).replace(/</g,'\\u003c');
  return `<link rel="stylesheet" href="/comparison.css"><${rootTag} class="compare-app comparison-page">
    <div class="compare-toolbar"><div class="comparison-context"><a href="/compare/">城市对比</a><${titleTag}>${esc(a.name)} <span>与</span> ${esc(b.name)}</${titleTag}></div><div class="comparison-options"><label for="comparison-month"><span class="comparison-month-caption">出发月份</span><select id="comparison-month" aria-label="出发月份">${Array.from({length:12},(_,index)=>`<option value="${index+1}"${index+1===month?' selected':''}>${index+1} 月</option>`).join('')}</select></label><button type="button" id="comparison-print" class="comparison-print" aria-label="保存为一页，打开打印" title="保存为 PDF 或打印">${printIcon}<span>保存一页</span></button></div></div>
    ${personalComparisonMarkup([a,b],month)}
    <div class="comparison-sheet" data-long-names="${a.name.length>6||b.name.length>6}">
      ${citySide(a,b,0)}${citySide(b,a,1)}
      <div class="comparison-center"><div class="table-scroll comparison-scroll" tabindex="0" role="region" aria-label="逐项城市对比"><table class="compare-matrix refined-comparison"><caption class="sr-only">${esc(a.name)}与${esc(b.name)}的生活成本、六项偏好指标、历史气候、推荐月份及入境条件</caption><colgroup><col class="compare-value-col"><col class="compare-label-col"><col class="compare-value-col"></colgroup><thead><tr><th scope="col">${esc(a.name)}</th><th scope="col">逐项对照</th><th scope="col">${esc(b.name)}</th></tr></thead><tbody>
      ${row('budget',embedded?'历史月参考':'月花费',a.budget,b.budget,'USD / 月',true)}
      ${KEYS.map(key=>row(key,LABELS[key],scoringValues(a,month)[key],scoringValues(b,month)[key])).join('')}
      <tr class="comparison-weather-row">${monthCell(a,0)}${metricCell(`<span id="comparison-month-label">${month} 月气候</span>`,'历史均温 / 雨量')}${monthCell(b,1)}</tr>
      <tr class="comparison-months-row"><td>${months(a)}</td>${metricCell('原推荐月份')}<td>${months(b)}</td></tr>
      <tr class="comparison-entry-row"><td><strong>${esc(a.visa.label)}<sup>*</sup></strong></td>${metricCell('大陆护照')}<td><strong>${esc(b.visa.label)}<sup>*</sup></strong></td></tr>
      </tbody></table></div>
      <p class="comparison-footnote"><span class="comparison-print-brand">Roamorrow · </span>花费为历史参考；安全、生活和网络为旧指标 / 10，网络非 Mbps。<br>气候按所选月份计算；氛围来源见各城标注。* 入境标签待复核，工作许可另查。</p>
      <details class="comparison-evidence"><summary>这些数字怎么用<span aria-hidden="true">⌄</span></summary><div><p>绿色标出历史月花费更低、或按同样方法算出分数更高的一边。两边持平、缺资料或氛围来源不同时，不标高低。花费分依据历史月预算，气候分依据所选月份的气温和雨量。氛围分优先看OSM场所密度，未采集的城市沿用历史社区标签；这两类资料不能直接比较社群有多活跃。历史月花费的住宿条件可能不同，不能当作现价或最低生活费。气候用的是2023–2025年ERA5月平均，出行当天的天气仍要另查预报。</p><div class="comparison-entry-details">${[a,b].map(city=>`<section><h3>${esc(city.name)} · ${esc(city.visa.label)}</h3><p>${esc(city.visa.detail)}</p></section>`).join('')}</div><a href="/about/">查看数据方法与来源</a></div></details>
      </div>
    </div><p id="comparison-month-status" class="sr-only" role="status" aria-live="polite"></p>
    <script type="application/json" id="comparison-data">${data}</script><script type="module" src="/modules/compare-ui.js"></script></${rootTag}>`;
}
