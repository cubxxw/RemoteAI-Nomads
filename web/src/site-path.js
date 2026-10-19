import {sitePath,appPath} from '../public/modules/site-path.js';

export function siteLocation(env) {
  const url = new URL(env.SITE_ORIGIN || 'http://127.0.0.1:8787');
  return {origin: url.origin, base: url.pathname.replace(/\/$/, '')};
}

export function publicURL(path, env) {
  const {origin, base} = siteLocation(env);
  return origin + sitePath(path, base);
}

export function relocatePublishedHTML(html, source, env) {
  const {base}=siteLocation(env), from=new URL(source), oldBase=from.pathname.replace(/\/$/,'');
  const target=siteLocation(env),oldSite=from.origin+oldBase,newSite=target.origin+target.base;
  const belongs=(value,site)=>value===site||['/','?','#'].some(separator=>value.startsWith(site+separator));
  html=html.replace(/https?:\/\/[^"'<>\s]+/g,value=>belongs(value,newSite)?value:belongs(value,oldSite)?newSite+value.slice(oldSite.length):value);
  html=html.replace(/\b(href|src|action|poster)=(['"])(\/[^'"]*)\2/g,(match,key,quote,value)=>`${key}=${quote}${sitePath(appPath(value,oldBase),base)}${quote}`);
  return html.replace(/<html\b([^>]*)>/i,(match,attributes)=>`<html${/data-nomads-base=/.test(attributes)?attributes.replace(/data-nomads-base="[^"]*"/,`data-nomads-base="${base}"`):attributes+` data-nomads-base="${base}"`}>`);
}

const dynamicFiles = new Set(['/release.json', '/robots.txt', '/sitemap.xml']);
export const staticPath = path => !path.startsWith('/api/') && !path.startsWith('/map-tiles/') && !dynamicFiles.has(path) && /\.[a-z0-9]+$/i.test(path);

async function staticAsset(request, env) {
  const asset = await env.ASSETS.fetch(request);
  if (!new URL(request.url).pathname.startsWith('/city-guides/')) return asset;
  const headers = new Headers(asset.headers);
  headers.set('X-Robots-Tag', 'noindex, nofollow');
  return new Response(request.method === 'HEAD' ? null : asset.body, {status:asset.status, headers});
}

// Workers Assets normally precede the script. run_worker_first lets legacy URLs
// redirect while the binding still serves the unmounted file paths explicitly.
// https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
export async function mountedRequest(request, env, ctx, handler) {
  const url = new URL(request.url), {origin, base} = siteLocation(env);
  const localPath=appPath(url.pathname,base);
  if(localPath==='/local-data/'&&env.ASSETS&&['GET','HEAD'].includes(request.method)){
    const asset=await env.ASSETS.fetch(new Request(new URL('/local-data.html',url)));
    const headers=new Headers(asset.headers);headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Cache-Control','no-store');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    return new Response(request.method==='HEAD'?null:asset.body,{status:asset.status,headers});
  }
  if (!base) {
    if (staticPath(url.pathname) && env.ASSETS) return staticAsset(request,env);
    return handler(request, env, ctx);
  }
  const mounted = url.pathname === base || url.pathname.startsWith(base + '/');
  if (!mounted) {
    // Already-open legacy pages keep their same-origin lazy modules and maps.
    if(staticPath(url.pathname)&&env.ASSETS)return staticAsset(request,env);
    if(url.pathname.startsWith('/map-tiles/')||url.pathname==='/api/rankings')return handler(request,{...env,SITE_ORIGIN:url.origin.replace(/^http:/,'https:')},ctx);
    // Keep already-open legacy conversations usable; public navigation moves.
    if(url.pathname.startsWith('/api/agent/'))return handler(request,{...env,SITE_ORIGIN:url.origin.replace(/^http:/,'https:')},ctx);
    if (env.LEGACY_REDIRECT === 'true') return new Response(null,{status:308,headers:{Location:publicURL(url.pathname + url.search, env),'Cache-Control':'no-store'}});
    return handler(request, {...env, SITE_ORIGIN: env.PREVIEW==='false'?url.origin.replace(/^http:/,'https:'):url.origin}, ctx);
  }
  const internalURL = new URL(url);
  internalURL.protocol = new URL(origin).protocol;
  internalURL.host = new URL(origin).host;
  internalURL.pathname = url.pathname.slice(base.length) || '/';
  const internal = new Request(internalURL, request);
  if (staticPath(internalURL.pathname) && env.ASSETS) return staticAsset(internal,env);
  const response = await handler(internal, env, ctx);
  const location = response.headers.get('Location');
  if (!location) return response;
  const target = new URL(location, internalURL);
  if (![origin, url.origin].includes(target.origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Location', publicURL(target.pathname + target.search + target.hash, env));
  return new Response(response.body, {status: response.status, statusText: response.statusText, headers});
}
