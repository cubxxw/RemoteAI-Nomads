import catalog from '../data/article-catalog.json' with {type: 'json'};
import {articleCoverHTML} from './guide-covers.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const topicCategories = {
  start: {label:'选目的地', description:'第一站、城市取舍与试住'},
  budget: {label:'租房与开销', description:'房租、账单与交通怎么算'},
  season: {label:'季节与换城', description:'按月份和天气安排下一站'},
  permission: {label:'签证与工作', description:'护照资格、停留期与会议时差'},
  compare: {label:'对比与工具', description:'城市对比、网络与办公核对'},
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

// Validate the whole registry, including drafts, so publication cannot silently
// shadow an existing slug or canonical path. Returned entries are immutable.
export function createArticleCatalog(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Article catalog schemaVersion 1 and entries are required');
  const slugs = new Set(), paths = new Set(), seriesNumbers = new Set();
  const entries = data.entries.map(entry => {
    if (!slugPattern.test(entry.slug)) throw new Error('Invalid article slug: ' + entry.slug);
    if (!['guide', 'comparison'].includes(entry.kind)) throw new Error('Invalid article kind: ' + entry.slug);
    if (!['draft', 'published'].includes(entry.status)) throw new Error('Invalid article status: ' + entry.slug);
    if (typeof entry.path !== 'string' || !/^\/(?:guides|compare)\/[a-z0-9-]+\/$/.test(entry.path)) throw new Error('Invalid article path: ' + entry.slug);
    if (slugs.has(entry.slug)) throw new Error('Duplicate article slug: ' + entry.slug);
    if (paths.has(entry.path)) throw new Error('Duplicate article path: ' + entry.path);
    slugs.add(entry.slug); paths.add(entry.path);
    const canonical = '/' + (entry.kind === 'guide' ? 'guides' : 'compare') + '/' + entry.slug + '/';
    if (entry.path !== canonical) throw new Error('Article path does not match kind and slug: ' + entry.slug);
    if (![entry.title, entry.summary].every(value => typeof value === 'string' && value.trim())) throw new Error('Article title and summary are required: ' + entry.slug);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.updatedAt) || Number.isNaN(Date.parse(entry.updatedAt))) throw new Error('Article update date is required: ' + entry.slug);
    if (!Array.isArray(entry.citySlugs) || !entry.citySlugs.every(slug => typeof slug === 'string' && slugPattern.test(slug)) || new Set(entry.citySlugs).size !== entry.citySlugs.length) throw new Error('Invalid article citySlugs: ' + entry.slug);
    if (entry.assetPath !== undefined && (entry.kind !== 'guide' || entry.assetPath !== '/city-guides/' + entry.slug + '.html')) throw new Error('Invalid article assetPath: ' + entry.slug);
    if (entry.topic !== undefined && (typeof entry.topic !== 'boolean' || entry.kind !== 'guide')) throw new Error('Invalid article topic flag: ' + entry.slug);
    if (entry.topicCategory !== undefined && (!entry.topic || typeof entry.topicCategory !== 'string' || !Object.hasOwn(topicCategories,entry.topicCategory))) throw new Error('Invalid article topic category: ' + entry.slug);
    if (entry.seriesNumber !== undefined) {
      if (!Number.isInteger(entry.seriesNumber) || entry.seriesNumber < 1 || entry.seriesNumber > 50 || !entry.topic || !['start','budget','season','permission','compare'].includes(entry.seriesCategory)) throw new Error('Invalid article series metadata: ' + entry.slug);
      if (seriesNumbers.has(entry.seriesNumber)) throw new Error('Duplicate article series number: ' + entry.seriesNumber);
      seriesNumbers.add(entry.seriesNumber);
    } else if (entry.seriesCategory !== undefined) throw new Error('Article series category needs a number: ' + entry.slug);
    if (entry.bodyParagraphs !== undefined && (entry.kind !== 'guide' || !Array.isArray(entry.bodyParagraphs) || !entry.bodyParagraphs.length || !entry.bodyParagraphs.every(text => typeof text === 'string' && text.trim()))) throw new Error('Invalid article bodyParagraphs: ' + entry.slug);
    return Object.freeze({...entry, citySlugs: Object.freeze([...entry.citySlugs]), ...(entry.bodyParagraphs ? {bodyParagraphs: Object.freeze([...entry.bodyParagraphs])} : {})});
  });
  const published = Object.freeze(entries.filter(entry => entry.status === 'published'));
  const publishedArticles = () => published;
  const articlesForCity = slug => published.filter(entry => entry.citySlugs.includes(slug));
  const articleBySlug = slug => published.find(entry => entry.slug === slug) || null;
  const articlePaths = () => published.map(entry => entry.path);
  const cardHTML = (entry, cover = '') => `<article class="city-article-card">${cover}<a href="${escapeHTML(entry.path)}"><h3>${escapeHTML(entry.title)}</h3></a><p>${escapeHTML(entry.summary)}</p><small>${entry.kind === 'comparison' ? '城市对比' : entry.topic ? '旅居专题' : '旅居指南'} · <time datetime="${escapeHTML(entry.updatedAt)}">${escapeHTML(entry.updatedAt)}</time></small></article>`;
  // Text-only guide cards get a deterministic visual cover: the entry's own
  // named-city photo with attribution, or an editorial illustration. Presentation
  // only — registry paths, statuses and publication rules are unchanged.
  const coverCardHTML = entry => cardHTML(entry, articleCoverHTML(entry));
  const relatedArticlesHTML = citySlug => {
    const articles = articlesForCity(citySlug);
    const extra = articles.slice(6);
    const more = extra.length ? `<details class="city-article-more"><summary>还有${extra.length}篇相关文章</summary><ul>${extra.map(entry=>`<li><a href="${escapeHTML(entry.path)}">${escapeHTML(entry.title)}</a></li>`).join('')}</ul></details>` : '';
    return articles.length ? `<section id="articles" class="city-articles city-section" aria-labelledby="city-articles-title"><div class="city-section-heading"><h2 id="city-articles-title">与这座城市有关的文章</h2></div><div class="city-article-list">${articles.slice(0,6).map(entry => cardHTML(entry)).join('')}</div>${more}</section>` : '';
  };
  // first-month already has its own feature in the guide index; other published
  // guides supplement that feature regardless of their underlying renderer.
  const guideCardsHTML = () => {
    const topics = published.filter(entry => entry.kind === 'guide' && entry.topic === true);
    const articles = published.filter(entry => entry.kind === 'guide' && !entry.topic && entry.slug !== 'first-month');
    const comparisons=published.filter(entry=>entry.kind==='comparison');
    const sorted = [...topics].sort((a,b)=>(a.seriesNumber ?? 51)-(b.seriesNumber ?? 51));
    const categories = {...topicCategories, other:{label:'更多专题',description:'继续看看其他旅居问题'}};
    const grouped = Object.entries(categories).map(([key,value])=>({key,...value,entries:sorted.filter(entry=>(entry.topicCategory || entry.seriesCategory || 'other')===key)})).filter(group=>group.entries.length);
    const choices = [{key:'all',label:'全部专题',description:'从选地方到入住，一起浏览',count:topics.length},...grouped.map(g=>({...g,count:g.entries.length}))];
    const collection = `<div id="guide-topics" data-guide-topics data-total-count="${topics.length}"><nav class="guide-topic-nav" aria-label="按问题找文章"><ul>${choices.map(g=>`<li><a href="#${g.key==='all'?'guide-topics':'guide-series-'+g.key}" data-guide-topic-filter="${g.key}"${g.key==='all'?' aria-current="true"':''}><strong>${g.label}</strong><span class="guide-topic-count">${g.count}篇<span aria-hidden="true"> ›</span></span><span class="guide-topic-description">${g.description}</span></a></li>`).join('')}</ul></nav><p class="guide-topic-status" data-guide-topic-status role="status" aria-live="polite" aria-atomic="true">显示全部${topics.length}篇专题</p>${grouped.map(g=>`<div id="guide-series-${g.key}" class="guide-series-group" data-guide-topic-group="${g.key}"><div class="guide-topic-heading"><h3>${g.label}</h3><span>${g.entries.length}篇</span></div><div class="city-article-list">${g.entries.map(coverCardHTML).join('')}</div></div>`).join('')}</div>`;
    const topicCards=topics.length?`<section class="guide-city-articles" aria-labelledby="guide-topic-title"><div class="content-section-heading"><h2 id="guide-topic-title">你想先了解什么？</h2><span>${topics.length}篇旅居专题</span></div>${collection}</section>`:'';
    const comparisonCards=comparisons.length?`<section class="guide-city-articles" aria-labelledby="guide-comparison-title"><div class="content-section-heading"><h2 id="guide-comparison-title">两座城市，怎么选</h2></div><div class="city-article-list">${comparisons.map(coverCardHTML).join('')}</div></section>`:'';
    return topicCards+(articles.length ? `<section class="guide-city-articles" aria-labelledby="guide-city-articles-title"><div class="content-section-heading"><h2 id="guide-city-articles-title">住一个月，先把账算清楚</h2></div><div class="city-article-list">${articles.map(coverCardHTML).join('')}</div></section>` : '')+comparisonCards;
  };
  return Object.freeze({publishedArticles, articlesForCity, articleBySlug, articlePaths, relatedArticlesHTML, guideCardsHTML});
}

const registry = createArticleCatalog(catalog);
export const {publishedArticles, articlesForCity, articleBySlug, articlePaths, relatedArticlesHTML, guideCardsHTML} = registry;
