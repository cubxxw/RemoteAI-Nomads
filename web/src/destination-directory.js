import {esc} from './render.js';
import {publicURL} from './site-path.js';
import {travelAdvisory} from '../public/modules/recommendation-policy.js';

const regions = ['亚洲', '欧洲', '美洲', '非洲', '大洋洲', '其他地区'];
const collator = new Intl.Collator('zh-CN');

// This is the complete published catalog, including explicitly labelled
// historical information. It does not apply recommendation or month filters.
export function destinationDirectoryPage(cities, env) {
  const groups = new Map();
  for (const city of cities) {
    const region = regions.includes(city.region) ? city.region : '其他地区';
    if (!groups.has(region)) groups.set(region, new Map());
    const countries = groups.get(region), key = city.countryId || city.countryCode;
    if (!countries.has(key)) countries.set(key, {name: city.country, cities: []});
    countries.get(key).cities.push(city);
  }
  const presentRegions = regions.filter(region => groups.has(region));
  const url = publicURL('/destinations/', env);
  const description = `按大洲和国家查找 ${cities.length} 座城市的旅居资料，查看生活消费参考、历史气候与远程工作条件。`;
  return {
    title: '数字游民城市目录：按国家查找旅居目的地', description,
    path: '/destinations/', active: 'directory', indexable: cities.length > 0,
    jsonld: {'@context': 'https://schema.org', '@graph': [
      {'@type': 'CollectionPage', '@id': url + '#webpage', url, name: '数字游民城市目录', description, inLanguage: 'zh-CN'},
      {'@type': 'BreadcrumbList', itemListElement: [
        {'@type': 'ListItem', position: 1, name: '城市排行', item: publicURL('/', env)},
        {'@type': 'ListItem', position: 2, name: '城市目录', item: url},
      ]},
    ]},
    body: `<link rel="stylesheet" href="/content.css"><div class="container content-page destination-directory"><div class="content-intro"><span class="content-eyebrow">全部城市资料</span><h1>按国家，找城市资料</h1><p>${esc(description)}</p><p>目录包含历史资料，收录不表示推荐前往。标有暂勿前往提醒的城市不参与出发推荐。</p><a href="/">按预算与月份选城</a></div>
      <nav class="continent-nav" aria-label="按大洲浏览城市">${presentRegions.map(region => `<a href="#directory-region-${regions.indexOf(region)}">${region}</a>`).join('')}</nav>
      ${presentRegions.map(region => {
        const countries = [...groups.get(region).values()].sort((a, b) => collator.compare(a.name, b.name));
        return `<section class="country-group" id="directory-region-${regions.indexOf(region)}"><div class="content-section-heading"><h2>${region}</h2><span>${countries.reduce((count, country) => count + country.cities.length, 0)} 座城市</span></div>${countries.map(country => `<section class="destination-country"><h3>${esc(country.name)}</h3><ul class="country-list">${country.cities.sort((a, b) => collator.compare(a.name, b.name)).map(city => `<li><a class="directory-city" href="/cities/${esc(encodeURIComponent(city.slug))}/"><strong>${esc(city.name)}</strong><span>${esc(city.nameEn)}</span>${travelAdvisory(city) ? '<small>暂勿前往 · 历史资料</small>' : ''}</a></li>`).join('')}</ul></section>`).join('')}</section>`;
      }).join('')}${cities.length ? '' : '<p class="content-empty">城市资料正在整理。</p>'}
      <p class="content-footnote">价格与气候保留各自的资料日期，出发前请核对具体住宿和停留条件。<a href="/about/">查看数据与方法</a></p></div>`,
  };
}
