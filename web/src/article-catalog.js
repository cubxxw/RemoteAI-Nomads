import catalog from '../data/article-catalog.json' with {type: 'json'};

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

// Validate the whole registry, including drafts, so publication cannot silently
// shadow an existing slug or canonical path. Returned entries are immutable.
export function createArticleCatalog(data) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.entries)) throw new Error('Article catalog schemaVersion 1 and entries are required');
  const slugs = new Set(), paths = new Set();
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
    if (entry.bodyParagraphs !== undefined && (entry.kind !== 'guide' || !Array.isArray(entry.bodyParagraphs) || !entry.bodyParagraphs.length || !entry.bodyParagraphs.every(text => typeof text === 'string' && text.trim()))) throw new Error('Invalid article bodyParagraphs: ' + entry.slug);
    return Object.freeze({...entry, citySlugs: Object.freeze([...entry.citySlugs]), ...(entry.bodyParagraphs ? {bodyParagraphs: Object.freeze([...entry.bodyParagraphs])} : {})});
  });
  const published = Object.freeze(entries.filter(entry => entry.status === 'published'));
  const publishedArticles = () => published;
  const articlesForCity = slug => published.filter(entry => entry.citySlugs.includes(slug));
  const articleBySlug = slug => published.find(entry => entry.slug === slug) || null;
  const articlePaths = () => published.map(entry => entry.path);
  const cardHTML = entry => `<article class="city-article-card"><a href="${escapeHTML(entry.path)}"><h3>${escapeHTML(entry.title)}</h3></a><p>${escapeHTML(entry.summary)}</p><small>${entry.kind === 'comparison' ? '城市对比' : '旅居指南'} · <time datetime="${escapeHTML(entry.updatedAt)}">${escapeHTML(entry.updatedAt)}</time></small></article>`;
  const relatedArticlesHTML = citySlug => {
    const articles = articlesForCity(citySlug);
    return articles.length ? `<section id="articles" class="city-articles city-section" aria-labelledby="city-articles-title"><div class="city-section-heading"><h2 id="city-articles-title">与这座城市有关的文章</h2></div><div class="city-article-list">${articles.map(cardHTML).join('')}</div></section>` : '';
  };
  // first-month already has its own feature in the guide index; other published
  // guides supplement that feature regardless of their underlying renderer.
  const guideCardsHTML = () => {
    const articles = published.filter(entry => entry.kind === 'guide' && entry.slug !== 'first-month');
    return articles.length ? `<section class="guide-city-articles" aria-labelledby="guide-city-articles-title"><div class="content-section-heading"><h2 id="guide-city-articles-title">住一个月，先把账算清楚</h2></div><div class="city-article-list">${articles.map(cardHTML).join('')}</div></section>` : '';
  };
  return Object.freeze({publishedArticles, articlesForCity, articleBySlug, articlePaths, relatedArticlesHTML, guideCardsHTML});
}

const registry = createArticleCatalog(catalog);
export const {publishedArticles, articlesForCity, articleBySlug, articlePaths, relatedArticlesHTML, guideCardsHTML} = registry;
