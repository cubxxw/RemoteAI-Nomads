import { esc, external } from './render.js';
import { KEYS, LABELS, advantages } from '../public/modules/ranking.js';

export function comparisonFit(city, other) {
  const strengths = advantages(city, other);
  if (strengths.length) return `更适合看重${strengths.join('和')}的人。`;
  const months = city.months.filter(month => month.status === 'recommended' && other.months[month.month - 1]?.status !== 'recommended').map(month => month.month);
  return months.length ? `可优先看看 ${months.join('、')} 月的出发条件。` : '先比较你的预算和出发月份，再做选择。';
}

import { compactMonths } from '../public/modules/months.js';
export { compactMonths } from '../public/modules/months.js';
const printIcon='<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M5 6V2.5h10V6M5 14H3V7h14v7h-2M5 11h10v6.5H5z" stroke-linejoin="round"/><path d="M14 8.5h1"/></svg>';

export function comparisonBody(a, b, month) {
  const number = value => value === null || value === undefined ? '—' : Number(value).toFixed(1);
  const metricCell = (title, unit='') => `<th scope="row"><span>${title}</span>${unit?`<small>${unit}</small>`:''}</th>`;
  const row = (key, title, left, right, unit='', lower=false) => {
    const known = [left,right].every(value => value !== null && value !== undefined);
    const diff = known ? Math.abs(left - right) : null;
    const winner = known && diff > 0 ? (lower ? left < right : left > right) ? 0 : 1 : -1;
    const cost = key === 'budget';
    const cell = (value,index) => `<td${winner === index ? ' class="comparison-winner"' : ''}><div class="comparison-value"><strong>${value === null || value === undefined ? '—' : cost ? '≈ $' + Math.round(value).toLocaleString('en-US') : number(value)}</strong>${winner === index ? `<span class="winner-label">${cost ? '低 $' + Math.round(diff).toLocaleString('en-US') : '高 ' + diff.toFixed(1)}</span>` : ''}</div></td>`;
    return `<tr data-comparison-metric="${key}"${known&&diff===0?' data-equal="true"':''}>${cell(left,0)}${metricCell(title,unit)}${cell(right,1)}</tr>`;
  };
  const monthCell = (city,index) => {
    const record=city.months[month-1];
    return `<td data-comparison-weather="${index}"><strong>${record?.meanC===null||record?.meanC===undefined?'—':Math.round(record.meanC)+'°C'}</strong><small>${record?.rainMm===null||record?.rainMm===undefined?'降雨待补':'雨量 '+Math.round(record.rainMm)+' mm'}</small></td>`;
  };
  const months = city => compactMonths(city.months.filter(record=>record.status==='recommended').map(record=>record.month));
  const citySide=(city,other,index)=>`<section class="comparison-city comparison-city-${index}" aria-labelledby="comparison-city-${index}"><a class="comparison-city-photo" href="/cities/${esc(city.slug)}/" tabindex="-1" aria-hidden="true">${city.photo?`<img src="${esc(city.photo)}" alt="" width="560" height="420" decoding="async">`:''}</a>${city.photoCredit ? `<span class="comparison-photo-credit">${external(city.photoSource,city.photoCredit)}</span>` : ''}<div class="comparison-city-identity"><h2 id="comparison-city-${index}"><a href="/cities/${esc(city.slug)}/">${esc(city.name)}</a></h2><p class="comparison-city-english">${esc(city.nameEn)}</p><p class="comparison-city-country">${esc(city.country)}</p></div><p class="comparison-city-fit">${esc(comparisonFit(city,other))}</p><div class="comparison-city-actions"><a class="comparison-guide" href="/cities/${esc(city.slug)}/">城市指南</a><a class="comparison-change" href="/compare/?${index===0?'b':'a'}=${esc(other.slug)}&amp;month=${month}">更换城市</a></div></section>`;
  const data=JSON.stringify([a,b].map(city=>({name:city.name,months:city.months}))).replace(/</g,'\\u003c');
  return `<link rel="stylesheet" href="/comparison.css"><article class="compare-app comparison-page">
    <div class="compare-toolbar"><div class="comparison-context"><a href="/compare/">城市对比</a><h1>${esc(a.name)} <span>与</span> ${esc(b.name)}</h1></div><div class="comparison-options"><label for="comparison-month"><span class="comparison-month-caption">出发月份</span><select id="comparison-month" aria-label="出发月份">${Array.from({length:12},(_,index)=>`<option value="${index+1}"${index+1===month?' selected':''}>${index+1} 月</option>`).join('')}</select></label><button type="button" id="comparison-print" class="comparison-print" aria-label="保存为一页，打开打印" title="保存为 PDF 或打印">${printIcon}<span>保存一页</span></button></div></div>
    <div class="comparison-sheet" data-long-names="${a.name.length>6||b.name.length>6}">
      ${citySide(a,b,0)}${citySide(b,a,1)}
      <div class="comparison-center"><div class="table-scroll comparison-scroll" tabindex="0" role="region" aria-label="逐项城市对比"><table class="compare-matrix refined-comparison"><caption class="sr-only">${esc(a.name)}与${esc(b.name)}的生活成本、六项旧评分、历史气候、推荐月份及入境条件</caption><colgroup><col class="compare-value-col"><col class="compare-label-col"><col class="compare-value-col"></colgroup><thead><tr><th scope="col">${esc(a.name)}</th><th scope="col">逐项对照</th><th scope="col">${esc(b.name)}</th></tr></thead><tbody>
      ${row('budget','月花费',a.budget,b.budget,'USD / 月',true)}
      ${KEYS.map(key=>row(key,LABELS[key],a.scores[key],b.scores[key])).join('')}
      <tr class="comparison-weather-row">${monthCell(a,0)}${metricCell(`<span id="comparison-month-label">${month} 月气候</span>`,'历史均温 / 雨量')}${monthCell(b,1)}</tr>
      <tr class="comparison-months-row"><td>${months(a)}</td>${metricCell('原推荐月份')}<td>${months(b)}</td></tr>
      <tr class="comparison-entry-row"><td><strong>${esc(a.visa.label)}<sup>*</sup></strong></td>${metricCell('大陆护照')}<td><strong>${esc(b.visa.label)}<sup>*</sup></strong></td></tr>
      </tbody></table></div>
      <p class="comparison-footnote"><span class="comparison-print-brand">RemoteAI Nomads · </span>花费为历史参考；评分为旧指标 / 10，网络非 Mbps。<br>气候：2023–2025 ERA5；* 入境标签待复核，工作许可另查。</p>
      <details class="comparison-evidence"><summary>口径与入境说明<span aria-hidden="true">⌄</span></summary><div><p>绿色标出较低的历史花费或较高的旧评分；持平或缺失时不标胜负。环境旧评分包含污染。历史花费的住宿条件可能不同，不能当作当前房源报价或最低预算。气候为2023–2025年ERA5历史月平均，不是天气预报。</p><div class="comparison-entry-details">${[a,b].map(city=>`<section><h3>${esc(city.name)} · ${esc(city.visa.label)}</h3><p>${esc(city.visa.detail)}</p></section>`).join('')}</div><a href="/about/">查看数据方法与来源</a></div></details>
      </div>
    </div><p id="comparison-month-status" class="sr-only" role="status" aria-live="polite"></p>
    <script type="application/json" id="comparison-data">${data}</script><script type="module" src="/modules/compare-ui.js"></script></article>`;
}
