import {cityText} from '../public/modules/city-copy.js';
import edition from '../data/seasonal-2026-10.json' with {type:'json'};
import {esc,external} from './render.js';

const profiles=new Map(edition.cities.map(city=>[city.slug,city]));
export const seasonalProfile=slug=>profiles.get(slug)||null;

// Human-edited, dated observation. It supplements the historical catalog;
// it never overwrites a price, network measurement, or entry entitlement.
export function seasonalCityNote(slug){
  const city=seasonalProfile(slug);if(!city)return '';
  const sources=city.sources.filter(source=>/^https:\/\//.test(source.url||'')&&!/search|blocked|unavailable|受限|检索/.test(source.read_scope||''));
  return `<section class="city-seasonal-note" aria-labelledby="seasonal-note-title"><div class="city-seasonal-heading"><h2 id="seasonal-note-title">2026年10月 · 旅居观察</h2><span>核对 ${esc(city.checked_at||edition.checked_at)}</span></div><p>${esc(cityText(city.summary))}</p><details><summary>这段建议的来源</summary><p>季节建议来自官方资料，住客经历另有署名。历史消费和网络评分不代表本月报价或房间测速。</p><ul>${sources.map(source=>`<li>${external(source.url,source.title)}${source.published_at?`<small>${esc(source.published_at.replace(/T.*$/, ''))}</small>`:''}</li>`).join('')}</ul><a class="city-seasonal-guide" href="https://github.com/cubxxw/RemoteAI-Nomads/blob/main/guides/seasonal-2026-10.md#${esc(slug)}" target="_blank" rel="noopener noreferrer">查看详细资料和原帖 ↗</a></details></section>`;
}
