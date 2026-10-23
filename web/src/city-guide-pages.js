import {articleBySlug} from './article-catalog.js';
import {articleCover} from './guide-covers.js';
import {esc} from './render.js';
import {relocatePublishedHTML, siteLocation} from './site-path.js';
import {sitePath} from '../public/modules/site-path.js';

// Approved article HTML and its publication fingerprints stay untouched. The
// renderer may only add, at runtime: a same-origin alignment stylesheet and —
// for standalone budget guides whose first screen has no photo — the reviewed
// public photo of the article's own city with its original attribution.
export function augmentGuideRuntime(body, article, env) {
  const {base} = siteLocation(env);
  body = body.replace(/<\/head>/i, () => `<link rel="stylesheet" href="${sitePath('/guide-runtime.css', base)}"><script type="module" src="${sitePath('/guide-visuals.js', base)}"></script></head>`);
  if (article.kind === 'guide' && article.topic !== true) {
    const cover = articleCover(article);
    if (cover.kind === 'city') {
      const credit = /^https:\/\//.test(cover.photo_source)
        ? `<a href="${esc(cover.photo_source)}" target="_blank" rel="noopener noreferrer">${esc(cover.photo_credit)} ↗</a>`
        : `<span>${esc(cover.photo_credit)}</span>`;
      const figure = `<figure class="guide-runtime-cover"><img src="${sitePath(cover.photo_url, base)}" alt="${esc(cover.name_zh)}城市实景" width="960" height="641" loading="eager" fetchpriority="high" decoding="async" data-photo-label="${esc(cover.name_zh)}"><figcaption><span>${esc(cover.name_zh)}城市实景</span>${credit}</figcaption></figure>`;
      if (body.includes('<section class="answer-hero"')) body = body.replace('<section class="answer-hero"', () => figure + '<section class="answer-hero"');
      else body = body.replace(/(<main\b[^>]*>)/, match => match + figure);
    }
  }
  return body;
}

// Editorial artifacts are independent of the database and retain their own
// source dates. Only explicitly published catalog entries can reach this route.
export async function cityGuideResponse(request, env) {
  const url = new URL(request.url);
  const slug = url.pathname.match(/^\/guides\/([a-z0-9-]+)\/$/)?.[1];
  const article = slug && articleBySlug(slug);
  if (!article?.assetPath || article.status !== 'published') return null;
  if (!env.ASSETS) return new Response('文章暂时无法读取。', {status:503, headers:{'Cache-Control':'no-store'}});
  const asset = await env.ASSETS.fetch(new Request(new URL(article.assetPath, url)));
  if (!asset.ok) return new Response('文章暂时无法读取。', {status:503, headers:{'Cache-Control':'no-store'}});
  const indexable = env.PREVIEW === 'false' && !url.search;
  let body = relocatePublishedHTML(await asset.text(), 'https://roamorrow.com/nomads', env);
  body = body.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${indexable ? 'index,follow' : 'noindex,follow'}">`);
  body = augmentGuideRuntime(body, article, env);
  return new Response(request.method === 'HEAD' ? null : body, {headers:{
    'Content-Type':'text/html; charset=utf-8',
    'Cache-Control': indexable ? 'public, max-age=0, s-maxage=300' : 'no-store',
    'X-Robots-Tag': indexable ? 'index, follow' : 'noindex, follow',
    'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Strict-Transport-Security':'max-age=15552000',
    // Leaflet positions its own tiles and controls using style attributes.
    // Executable inline JavaScript remains disallowed.
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com; style-src 'self' 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  }});
}
