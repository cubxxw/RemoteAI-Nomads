import {travelAdvisory} from '../public/modules/recommendation-policy.js';
import {esc,external} from './render.js';

export function cityAdvisoryMarkup(city){
  const advisory=travelAdvisory(city);if(!advisory)return '';
  return `<aside class="city-travel-advisory" aria-label="出行提醒"><strong>暂不作为出发推荐</strong><p>${esc(advisory.reason)}。此页保留历史资料，不作为当前出发建议。</p><p>${external(advisory.url,advisory.title)}<span>核读 ${esc(advisory.checkedAt)}${advisory.publishedAt?' · 发布 '+esc(advisory.publishedAt):''}</span></p></aside>`;
}
