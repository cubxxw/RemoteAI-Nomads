import {articleBySlug} from './article-catalog.js';
import {relocatePublishedHTML} from './site-path.js';

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
